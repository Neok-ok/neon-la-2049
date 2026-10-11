// Distant-district impostors. A superchunk that the residency budget did not admit
// still needs a skyline, so each missing 2 km cell becomes a handful of boxes on
// the shared city material. They leave the frame the same moment the real mesh arrives.
import { Group, Mesh } from 'three/webgpu';
import { hash2i } from '../../core/rng';
import { Style } from '../fabric/types';
import { GeoWriter } from '../landmarks/GeoWriter';
import { getCityMaterial } from '../materials/cityMaterial';
import { getLayout } from '../layout';

const CELL = 2000;
const MAX_CELLS = 48;

export class DistrictHlod {
  readonly root = new Group();
  private readonly cells = new Map<string, Mesh>();
  private readonly layout = getLayout();

  constructor() {
    this.root.name = 'district-hlod';
  }

  get count(): number {
    return this.cells.size;
  }

  /**
   * `resident` keys are `sx,sz` of superchunks that already have a mesh.
   * `lookRadius` is the tier's visual horizon, which can be wider than the
   * residency radius. Cells past the horizon are dropped.
   */
  update(camX: number, camZ: number, lookRadius: number, resident: ReadonlySet<string>): void {
    const radius = Math.max(CELL, lookRadius);
    const sx0 = Math.floor((camX - radius) / CELL);
    const sx1 = Math.floor((camX + radius) / CELL);
    const sz0 = Math.floor((camZ - radius) / CELL);
    const sz1 = Math.floor((camZ + radius) / CELL);
    const want = new Set<string>();
    const ranked: Array<{ key: string; dist: number; sx: number; sz: number }> = [];
    for (let sx = sx0; sx <= sx1; sx++) {
      for (let sz = sz0; sz <= sz1; sz++) {
        const key = `${sx},${sz}`;
        if (resident.has(key)) continue;
        const x0 = sx * CELL;
        const z0 = sz * CELL;
        const cx = x0 + CELL * 0.5;
        const cz = z0 + CELL * 0.5;
        const dist = Math.hypot(cx - camX, cz - camZ);
        if (dist > radius) continue;
        if (this.layout.isOcean(cx, cz)) continue;
        ranked.push({ key, dist, sx, sz });
      }
    }
    ranked.sort((a, b) => a.dist - b.dist);
    for (let i = 0; i < ranked.length && want.size < MAX_CELLS; i++) {
      const cell = ranked[i];
      if (!cell) break;
      want.add(cell.key);
      if (!this.cells.has(cell.key)) this.cells.set(cell.key, this.build(cell.sx, cell.sz));
    }
    for (const [key, mesh] of this.cells) {
      if (want.has(key)) continue;
      mesh.geometry.dispose();
      mesh.removeFromParent();
      this.cells.delete(key);
    }
  }

  clear(): void {
    for (const mesh of this.cells.values()) {
      mesh.geometry.dispose();
      mesh.removeFromParent();
    }
    this.cells.clear();
  }

  private build(sx: number, sz: number): Mesh {
    const w = new GeoWriter();
    const x0 = sx * CELL;
    const z0 = sz * CELL;
    const ground = this.layout.heightAt(x0 + CELL * 0.5, z0 + CELL * 0.5);
    for (let i = 0; i < 6; i++) {
      const h = hash2i(sx, sz, i);
      const fx = (h & 1023) / 1023;
      const fz = ((h >> 10) & 1023) / 1023;
      const tall = 28 + ((h >> 20) & 255) * 0.7;
      const bw = 36 + (h & 63);
      const bd = 36 + ((h >> 6) & 63);
      w.box(
        x0 + 180 + fx * (CELL - 360),
        z0 + 180 + fz * (CELL - 360),
        ground,
        bw,
        bd,
        tall,
        0,
        { style: Style.Office, lit: 0.35, tint: 0.8, seed: (h & 255) / 255 },
        true,
      );
    }
    const mesh = new Mesh(w.build(), getCityMaterial());
    mesh.name = `hlod-${sx},${sz}`;
    mesh.matrixAutoUpdate = false;
    this.root.add(mesh);
    return mesh;
  }
}
