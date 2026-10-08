// Main-thread spatial queries against the deterministic fabric (collision, spawn points, district lookup).
// Uses the same pure generator as the worker, in layout-only mode, with an LRU cache of 500 m cells.
import { generateFabric } from './fabric/generator';
import type { Box, FabricOutput } from './fabric/types';
import { getLayout, type CityLayout, type District } from './layout';

export const QUERY_CELL = 500;
const BUCKET = 50;

export interface Collider {
  x: number;
  z: number;
  hw: number;
  hd: number;
  c: number;
  s: number;
  y0: number;
  top: number;
}

interface Cell {
  fab: FabricOutput;
  colliders: Collider[];
  buckets: Map<number, Collider[]>;
}

function toCollider(b: Box): Collider {
  return { x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2, c: Math.cos(b.yaw), s: Math.sin(b.yaw), y0: b.y0, top: b.y0 + b.h };
}

/** Point in collider local space. */
function local(cl: Collider, x: number, z: number): [number, number] {
  const dx = x - cl.x, dz = z - cl.z;
  return [dx * cl.c - dz * cl.s, dx * cl.s + dz * cl.c];
}

export class CityQuery {
  readonly layout: CityLayout = getLayout();
  private cells = new Map<string, Cell>();
  private extra: Collider[] = [];
  private maxCells = 48;

  /** Landmarks register their own coarse colliders (boxes) here. */
  addColliders(list: Array<Omit<Collider, 'c' | 's'> & { yaw: number }>): void {
    for (const b of list) this.extra.push({ ...b, c: Math.cos(b.yaw), s: Math.sin(b.yaw) });
  }

  private cell(ix: number, iz: number): Cell {
    const key = `${ix},${iz}`;
    let c = this.cells.get(key);
    if (c) {
      this.cells.delete(key);
      this.cells.set(key, c);
      return c;
    }
    const fab = generateFabric(this.layout, ix * QUERY_CELL, iz * QUERY_CELL, QUERY_CELL);
    const colliders = fab.boxes.filter((b) => b.detail <= 1 && b.w > 1.5 && b.d > 1.5).map(toCollider);
    const buckets = new Map<number, Collider[]>();
    for (const cl of colliders) {
      const r = Math.max(cl.hw, cl.hd) * 1.42;
      const bx0 = Math.floor((cl.x - r) / BUCKET), bx1 = Math.floor((cl.x + r) / BUCKET);
      const bz0 = Math.floor((cl.z - r) / BUCKET), bz1 = Math.floor((cl.z + r) / BUCKET);
      for (let i = bx0; i <= bx1; i++)
        for (let j = bz0; j <= bz1; j++) {
          const k = i * 100003 + j;
          let arr = buckets.get(k);
          if (!arr) buckets.set(k, (arr = []));
          arr.push(cl);
        }
    }
    c = { fab, colliders, buckets };
    this.cells.set(key, c);
    if (this.cells.size > this.maxCells) this.cells.delete(this.cells.keys().next().value!);
    return c;
  }

  /** Fabric (blocks/boxes/signs) for the 500 m query cell containing (x,z). */
  fabricAt(x: number, z: number): FabricOutput {
    return this.cell(Math.floor(x / QUERY_CELL), Math.floor(z / QUERY_CELL)).fab;
  }

  private near(x: number, z: number, r: number, cb: (c: Collider) => void): void {
    const i0 = Math.floor((x - r - 300) / QUERY_CELL), i1 = Math.floor((x + r + 300) / QUERY_CELL);
    const j0 = Math.floor((z - r - 300) / QUERY_CELL), j1 = Math.floor((z + r + 300) / QUERY_CELL);
    const seen = new Set<Collider>();
    const bx0 = Math.floor((x - r) / BUCKET), bx1 = Math.floor((x + r) / BUCKET);
    const bz0 = Math.floor((z - r) / BUCKET), bz1 = Math.floor((z + r) / BUCKET);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const cell = this.cell(i, j);
        for (let a = bx0; a <= bx1; a++)
          for (let b = bz0; b <= bz1; b++) {
            const arr = cell.buckets.get(a * 100003 + b);
            if (!arr) continue;
            for (const cl of arr) if (!seen.has(cl)) { seen.add(cl); cb(cl); }
          }
      }
    for (const cl of this.extra) {
      const rr = Math.max(cl.hw, cl.hd) * 1.42 + r;
      if (Math.abs(cl.x - x) < rr && Math.abs(cl.z - z) < rr) cb(cl);
    }
  }

  /** Cheap test against landmark colliders only (no fabric generation). */
  insideLandmark(x: number, y: number, z: number, pad = 0): boolean {
    for (const cl of this.extra) {
      if (y < cl.y0 - pad || y > cl.top + pad) continue;
      const [lx, lz] = local(cl, x, z);
      if (Math.abs(lx) <= cl.hw + pad && Math.abs(lz) <= cl.hd + pad) return true;
    }
    return false;
  }

  /** Tallest fabric box in the region is ~300 m; above this only landmarks can be hit. */
  static readonly FABRIC_CEILING = 320;

  groundHeight(x: number, z: number): number {
    return this.layout.heightAt(x, z);
  }

  district(x: number, z: number): District {
    return this.layout.districtAt(x, z);
  }

  /** Highest solid surface under (x,z) at or below y (ground if none). */
  floorBelow(x: number, y: number, z: number): number {
    let best = this.layout.isOcean(x, z) ? 0 : this.groundHeight(x, z);
    this.near(x, z, 0.5, (cl) => {
      if (cl.top > y + 0.01 || cl.top <= best) return;
      const [lx, lz] = local(cl, x, z);
      if (Math.abs(lx) <= cl.hw && Math.abs(lz) <= cl.hd) best = cl.top;
    });
    return best;
  }

  insideSolid(x: number, y: number, z: number, pad = 0): boolean {
    let hit = false;
    this.near(x, z, pad + 0.5, (cl) => {
      if (hit || y < cl.y0 - pad || y > cl.top + pad) return;
      const [lx, lz] = local(cl, x, z);
      if (Math.abs(lx) <= cl.hw + pad && Math.abs(lz) <= cl.hd + pad) hit = true;
    });
    return hit;
  }

  /**
   * Resolve a vertical capsule (radius r, from y to y+height) against building boxes.
   * Returns the corrected XZ position.
   */
  resolveCircle(x: number, z: number, y: number, height: number, r: number): [number, number] {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      this.near(x, z, r + 1, (cl) => {
        if (y + height < cl.y0 || y > cl.top - 0.05) return;
        const [lx, lz] = local(cl, x, z);
        const qx = Math.max(-cl.hw, Math.min(cl.hw, lx));
        const qz = Math.max(-cl.hd, Math.min(cl.hd, lz));
        let dx = lx - qx, dz = lz - qz;
        let d2 = dx * dx + dz * dz;
        let pushX = 0, pushZ = 0;
        if (d2 > 1e-8) {
          if (d2 >= r * r) return;
          const d = Math.sqrt(d2);
          pushX = (dx / d) * (r - d);
          pushZ = (dz / d) * (r - d);
        } else {
          // centre inside the box: exit through the nearest face
          const ex = cl.hw - Math.abs(lx), ez = cl.hd - Math.abs(lz);
          if (ex < ez) pushX = Math.sign(lx || 1) * (ex + r);
          else pushZ = Math.sign(lz || 1) * (ez + r);
          dx = dz = d2 = 0;
        }
        // back to world space (inverse of local())
        x += pushX * cl.c + pushZ * cl.s;
        z += -pushX * cl.s + pushZ * cl.c;
        moved = true;
      });
      if (!moved) break;
    }
    return [x, z];
  }

  /** Nearest open street-level spot to (x,z) (spiral search). */
  findStreetSpot(x: number, z: number, maxR = 400): [number, number] {
    const ok = (px: number, pz: number) =>
      !this.layout.isOcean(px, pz) && !this.insideSolid(px, this.groundHeight(px, pz) + 1, pz, 1.2);
    if (ok(x, z)) return [x, z];
    for (let r = 4; r < maxR; r += 4) {
      const n = Math.max(8, Math.floor(r / 2));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (ok(px, pz)) return [px, pz];
      }
    }
    return [x, z];
  }
}
