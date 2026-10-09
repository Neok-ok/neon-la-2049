// Spatial queries against the deterministic fabric (collision, spawn points, district lookup).
// Hot paths (walk / fly, every frame) read an LRU of 500 m cells filled by a worker.
// A miss does not generate on the main thread — the cell is queued and that frame has no
// fabric collision there. fabricAt, findStreetSpot and cinematic checks still generate
// synchronously, because they need a correct answer once rather than every frame.
import { generateFabric } from './fabric/generator';
import type { FabricOutput } from './fabric/types';
import { getLayout, type CityLayout, type District } from './layout';
import { COLLIDER_STRIDE, QUERY_BLOCK_STRIDE, packQuery } from './queryPack';
import type { QueryWorkerRequest, QueryWorkerResponse } from './query.worker';

export const QUERY_CELL = 500;
const BUCKET = 50;
const EXTRA_BUCKET = 120;

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

export interface PackedBlock {
  cx: number;
  cz: number;
  ax: number;
  az: number;
  la: number;
  lb: number;
  street: number;
  districtIndex: number;
  seed: number;
  ground: number;
}

interface Cell {
  colliders: Collider[];
  buckets: Map<number, Collider[]>;
  blocks: PackedBlock[];
  fab?: FabricOutput;
}

function local(cl: Collider, x: number, z: number): [number, number] {
  const dx = x - cl.x, dz = z - cl.z;
  return [dx * cl.c - dz * cl.s, dx * cl.s + dz * cl.c];
}

function collidersFrom(buf: Float32Array): Collider[] {
  const n = buf.length / COLLIDER_STRIDE;
  const out: Collider[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * COLLIDER_STRIDE;
    out[i] = {
      x: buf[o], z: buf[o + 1], hw: buf[o + 2], hd: buf[o + 3],
      c: buf[o + 4], s: buf[o + 5], y0: buf[o + 6], top: buf[o + 7],
    };
  }
  return out;
}

function blocksFrom(buf: Float32Array): PackedBlock[] {
  const n = buf.length / QUERY_BLOCK_STRIDE;
  const out: PackedBlock[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * QUERY_BLOCK_STRIDE;
    out[i] = {
      cx: buf[o], cz: buf[o + 1], ax: buf[o + 2], az: buf[o + 3],
      la: buf[o + 4], lb: buf[o + 5], street: buf[o + 6],
      districtIndex: buf[o + 7], seed: buf[o + 8], ground: buf[o + 9],
    };
  }
  return out;
}

function buildBuckets(colliders: Collider[]): Map<number, Collider[]> {
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
  return buckets;
}

export class CityQuery {
  readonly layout: CityLayout = getLayout();
  private cells = new Map<string, Cell>();
  private extra: Collider[] = [];
  /** Landmark colliders bucketed on a coarse grid (megatower kits register hundreds). */
  private extraGrid = new Map<number, Collider[]>();
  private maxCells = 48;
  private worker: Worker | null = null;
  private workerDead = false;
  private busy = false;
  private order: Array<[number, number]> = [];
  private queued = new Set<string>();
  private waiters = new Map<string, Array<() => void>>();
  /** Main-thread generateFabric calls (cold path). The frame loop should stay at zero. */
  syncCount = 0;
  /** Last worker cell time, ms. */
  lastQueryMs = 0;

  constructor() {
    try {
      const w = new Worker(new URL('./query.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<QueryWorkerResponse>) => this.onWorker(e.data);
      w.onerror = () => this.killWorker();
      this.worker = w;
    } catch (err) {
      console.error('query worker failed to start', err);
      this.workerDead = true;
    }
  }

  get pending(): number {
    return this.order.length + (this.busy ? 1 : 0);
  }

  /** Landmarks register their own coarse colliders (boxes) here. */
  addColliders(list: Array<Omit<Collider, 'c' | 's'> & { yaw: number }>): void {
    for (const b of list) {
      const cl: Collider = { x: b.x, z: b.z, hw: b.hw, hd: b.hd, y0: b.y0, top: b.top, c: Math.cos(b.yaw), s: Math.sin(b.yaw) };
      this.extra.push(cl);
      const r = Math.max(cl.hw, cl.hd) * 1.42;
      const i0 = Math.floor((cl.x - r) / EXTRA_BUCKET), i1 = Math.floor((cl.x + r) / EXTRA_BUCKET);
      const j0 = Math.floor((cl.z - r) / EXTRA_BUCKET), j1 = Math.floor((cl.z + r) / EXTRA_BUCKET);
      for (let i = i0; i <= i1; i++)
        for (let j = j0; j <= j1; j++) {
          const k = i * 100003 + j;
          let arr = this.extraGrid.get(k);
          if (!arr) this.extraGrid.set(k, (arr = []));
          arr.push(cl);
        }
    }
  }

  /** Landmark colliders whose bucket overlaps the square (x ± r, z ± r). Each collider at most once. */
  private nearExtra(x: number, z: number, r: number, cb: (c: Collider) => boolean | void): void {
    const i0 = Math.floor((x - r) / EXTRA_BUCKET), i1 = Math.floor((x + r) / EXTRA_BUCKET);
    const j0 = Math.floor((z - r) / EXTRA_BUCKET), j1 = Math.floor((z + r) / EXTRA_BUCKET);
    if (i0 === i1 && j0 === j1) {
      const arr = this.extraGrid.get(i0 * 100003 + j0);
      if (arr) for (const cl of arr) if (cb(cl) === true) return;
      return;
    }
    const seen = new Set<Collider>();
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const arr = this.extraGrid.get(i * 100003 + j);
        if (!arr) continue;
        for (const cl of arr) {
          if (seen.has(cl)) continue;
          seen.add(cl);
          if (cb(cl) === true) return;
        }
      }
  }

  /** Number of landmark colliders (debug stats). */
  get landmarkColliderCount(): number {
    return this.extra.length;
  }

  /**
   * Fill the 3×3 cells around (x, z) before the frame loop. Waits up to 4 s, then
   * generates the centre cell on the main thread if the worker has not answered.
   */
  prime(x: number, z: number): Promise<void> {
    const ix = Math.floor(x / QUERY_CELL), iz = Math.floor(z / QUERY_CELL);
    const jobs: Promise<void>[] = [];
    for (let i = ix - 1; i <= ix + 1; i++)
      for (let j = iz - 1; j <= iz + 1; j++) jobs.push(this.whenReady(i, j));
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 4000));
    return Promise.race([Promise.all(jobs).then(() => undefined), timeout]).then(() => {
      if (!this.cells.has(`${ix},${iz}`)) this.cellSync(ix, iz);
    });
  }

  /** Keep a one-cell ring around the camera, and around a point a bit ahead, in the queue. */
  warm(x: number, z: number, ax: number, az: number): void {
    const spots: Array<[number, number]> = [[x, z], [ax, az]];
    for (const [px, pz] of spots) {
      const ix = Math.floor(px / QUERY_CELL), iz = Math.floor(pz / QUERY_CELL);
      for (let i = ix - 1; i <= ix + 1; i++)
        for (let j = iz - 1; j <= iz + 1; j++) this.enqueue(i, j);
    }
  }

  /** Blocks already in the cache near (x, z). Does not generate. */
  cachedBlocks(x: number, z: number, r: number): PackedBlock[] {
    const out: PackedBlock[] = [];
    const i0 = Math.floor((x - r) / QUERY_CELL), i1 = Math.floor((x + r) / QUERY_CELL);
    const j0 = Math.floor((z - r) / QUERY_CELL), j1 = Math.floor((z + r) / QUERY_CELL);
    const r2 = (r + 40) * (r + 40);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const cell = this.cells.get(`${i},${j}`);
        if (!cell) continue;
        for (const b of cell.blocks) {
          const dx = b.cx - x, dz = b.cz - z;
          if (dx * dx + dz * dz <= r2) out.push(b);
        }
      }
    return out;
  }

  /** Fabric for the 500 m cell containing (x, z). Synchronous — cinematic and debug only. */
  fabricAt(x: number, z: number): FabricOutput {
    const ix = Math.floor(x / QUERY_CELL), iz = Math.floor(z / QUERY_CELL);
    const cell = this.cellSync(ix, iz);
    if (!cell.fab) {
      this.syncCount++;
      cell.fab = generateFabric(this.layout, ix * QUERY_CELL, iz * QUERY_CELL, QUERY_CELL);
    }
    return cell.fab;
  }

  /** Cheap test against landmark colliders only (no fabric generation). */
  insideLandmark(x: number, y: number, z: number, pad = 0): boolean {
    let hit = false;
    this.nearExtra(x, z, pad, (cl) => {
      if (y < cl.y0 - pad || y > cl.top + pad) return;
      const [lx, lz] = local(cl, x, z);
      if (Math.abs(lx) <= cl.hw + pad && Math.abs(lz) <= cl.hd + pad) return (hit = true);
    });
    return hit;
  }

  /** Highest landmark collider top under (x, z) within `pad` (0 if none). Spinner lanes use it to stay clear. */
  landmarkTopAt(x: number, z: number, pad = 0): number {
    let best = 0;
    this.nearExtra(x, z, pad, (cl) => {
      if (cl.top <= best) return;
      const [lx, lz] = local(cl, x, z);
      if (Math.abs(lx) <= cl.hw + pad && Math.abs(lz) <= cl.hd + pad) best = cl.top;
    });
    return best;
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
  floorBelow(x: number, y: number, z: number, sync = false): number {
    let best = this.layout.isOcean(x, z) ? 0 : this.groundHeight(x, z);
    this.near(x, z, 0.5, (cl) => {
      if (cl.top > y + 0.01 || cl.top <= best) return;
      const [lx, lz] = local(cl, x, z);
      if (Math.abs(lx) <= cl.hw && Math.abs(lz) <= cl.hd) best = cl.top;
    }, sync);
    return best;
  }

  insideSolid(x: number, y: number, z: number, pad = 0, sync = false): boolean {
    let hit = false;
    this.near(x, z, pad + 0.5, (cl) => {
      if (hit || y < cl.y0 - pad || y > cl.top + pad) return;
      const [lx, lz] = local(cl, x, z);
      if (Math.abs(lx) <= cl.hw + pad && Math.abs(lz) <= cl.hd + pad) hit = true;
    }, sync);
    return hit;
  }

  /**
   * Resolve a vertical capsule (radius r, from y to y+height) against building boxes.
   * Returns the corrected XZ position.
   */
  resolveCircle(x: number, z: number, y: number, height: number, r: number, sync = false): [number, number] {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      this.near(x, z, r + 1, (cl) => {
        if (y + height < cl.y0 || y > cl.top - 0.05) return;
        const [lx, lz] = local(cl, x, z);
        const qx = Math.max(-cl.hw, Math.min(cl.hw, lx));
        const qz = Math.max(-cl.hd, Math.min(cl.hd, lz));
        let dx = lx - qx, dz = lz - qz;
        const d2 = dx * dx + dz * dz;
        let pushX = 0, pushZ = 0;
        if (d2 > 1e-8) {
          if (d2 >= r * r) return;
          const d = Math.sqrt(d2);
          pushX = (dx / d) * (r - d);
          pushZ = (dz / d) * (r - d);
        } else {
          const ex = cl.hw - Math.abs(lx), ez = cl.hd - Math.abs(lz);
          if (ex < ez) pushX = Math.sign(lx || 1) * (ex + r);
          else pushZ = Math.sign(lz || 1) * (ez + r);
        }
        x += pushX * cl.c + pushZ * cl.s;
        z += -pushX * cl.s + pushZ * cl.c;
        moved = true;
      }, sync);
      if (!moved) break;
    }
    return [x, z];
  }

  /** Nearest open street-level spot to (x,z) (spiral search). Synchronous collision. */
  findStreetSpot(x: number, z: number, maxR = 400): [number, number] {
    const ok = (px: number, pz: number) =>
      !this.layout.isOcean(px, pz) && !this.insideSolid(px, this.groundHeight(px, pz) + 1, pz, 0.45, true);
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

  private key(ix: number, iz: number): string {
    return `${ix},${iz}`;
  }

  private touch(key: string, cell: Cell): Cell {
    this.cells.delete(key);
    this.cells.set(key, cell);
    return cell;
  }

  private store(ix: number, iz: number, colliders: Collider[], blocks: PackedBlock[], fab?: FabricOutput): Cell {
    const key = this.key(ix, iz);
    const prev = this.cells.get(key);
    const cell: Cell = {
      colliders, buckets: buildBuckets(colliders), blocks,
      fab: fab ?? prev?.fab,
    };
    this.touch(key, cell);
    while (this.cells.size > this.maxCells) this.cells.delete(this.cells.keys().next().value!);
    this.queued.delete(key);
    const wait = this.waiters.get(key);
    if (wait) {
      this.waiters.delete(key);
      for (const fn of wait) fn();
    }
    return cell;
  }

  private cellSync(ix: number, iz: number): Cell {
    const key = this.key(ix, iz);
    const hit = this.cells.get(key);
    if (hit) return this.touch(key, hit);
    this.syncCount++;
    const fab = generateFabric(this.layout, ix * QUERY_CELL, iz * QUERY_CELL, QUERY_CELL);
    const packed = packQuery(fab);
    return this.store(ix, iz, collidersFrom(packed.colliders), blocksFrom(packed.blocks), fab);
  }

  private cellPeek(ix: number, iz: number): Cell | null {
    const key = this.key(ix, iz);
    const hit = this.cells.get(key);
    if (hit) return this.touch(key, hit);
    this.enqueue(ix, iz);
    return null;
  }

  private enqueue(ix: number, iz: number): void {
    const key = this.key(ix, iz);
    if (this.cells.has(key) || this.queued.has(key)) return;
    if (this.workerDead || !this.worker) {
      this.cellSync(ix, iz);
      return;
    }
    this.queued.add(key);
    this.order.push([ix, iz]);
    this.pump();
  }

  private pump(): void {
    if (this.busy || !this.order.length || !this.worker) return;
    const next = this.order.shift();
    if (!next) return;
    const [ix, iz] = next;
    if (this.cells.has(this.key(ix, iz))) {
      this.queued.delete(this.key(ix, iz));
      this.pump();
      return;
    }
    this.busy = true;
    const req: QueryWorkerRequest = { id: 1, x0: ix * QUERY_CELL, z0: iz * QUERY_CELL, ix, iz };
    this.worker.postMessage(req);
  }

  private onWorker(res: QueryWorkerResponse): void {
    this.busy = false;
    this.lastQueryMs = res.ms;
    this.queued.delete(this.key(res.ix, res.iz));
    if (!this.cells.has(this.key(res.ix, res.iz))) {
      this.store(res.ix, res.iz, collidersFrom(res.colliders), blocksFrom(res.blocks));
    } else {
      const wait = this.waiters.get(this.key(res.ix, res.iz));
      if (wait) {
        this.waiters.delete(this.key(res.ix, res.iz));
        for (const fn of wait) fn();
      }
    }
    this.pump();
  }

  private killWorker(): void {
    this.workerDead = true;
    this.busy = false;
    this.worker = null;
    const left = this.order.splice(0);
    this.queued.clear();
    for (const [ix, iz] of left) if (!this.cells.has(this.key(ix, iz))) this.cellSync(ix, iz);
  }

  private whenReady(ix: number, iz: number): Promise<void> {
    const key = this.key(ix, iz);
    if (this.cells.has(key)) return Promise.resolve();
    return new Promise((resolve) => {
      let list = this.waiters.get(key);
      if (!list) this.waiters.set(key, (list = []));
      list.push(resolve);
      this.enqueue(ix, iz);
    });
  }

  private near(x: number, z: number, r: number, cb: (c: Collider) => void, sync: boolean): void {
    const i0 = Math.floor((x - r - 300) / QUERY_CELL), i1 = Math.floor((x + r + 300) / QUERY_CELL);
    const j0 = Math.floor((z - r - 300) / QUERY_CELL), j1 = Math.floor((z + r + 300) / QUERY_CELL);
    const seen = new Set<Collider>();
    const bx0 = Math.floor((x - r) / BUCKET), bx1 = Math.floor((x + r) / BUCKET);
    const bz0 = Math.floor((z - r) / BUCKET), bz1 = Math.floor((z + r) / BUCKET);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const cell = sync ? this.cellSync(i, j) : this.cellPeek(i, j);
        if (!cell) continue;
        for (let a = bx0; a <= bx1; a++)
          for (let b = bz0; b <= bz1; b++) {
            const arr = cell.buckets.get(a * 100003 + b);
            if (!arr) continue;
            for (const cl of arr) if (!seen.has(cl)) { seen.add(cl); cb(cl); }
          }
      }
    this.nearExtra(x, z, r, (cl) => {
      const rr = Math.max(cl.hw, cl.hd) * 1.42 + r;
      if (Math.abs(cl.x - x) < rr && Math.abs(cl.z - z) < rr) cb(cl);
    });
  }
}
