// Local-frame wrapper around GeoWriter. Copied from the civic mass helper so a district
// does not import another district. Detail 2 is the hero mesh, 1 the mid mesh, 0 the silhouette.
import { GeoWriter, type FaceStyle } from '../../world/landmarks/GeoWriter';
import type { LandmarkCollider } from '../../world/landmarks/registry';

export type Detail = 0 | 1 | 2;

export class Mass {
  readonly cols: LandmarkCollider[] = [];
  constructor(
    readonly w: GeoWriter,
    readonly x: number,
    readonly z: number,
    readonly yaw: number,
    readonly max: Detail,
  ) {}

  private place(lx: number, lz: number): [number, number] {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return [this.x + lx * c + lz * s, this.z - lx * s + lz * c];
  }

  box(d: Detail, lx: number, lz: number, y: number, w: number, dep: number, h: number, st: FaceStyle, cap = true): void {
    if (d > this.max || h < 0.02 || w < 0.04 || dep < 0.04) return;
    const [x, z] = this.place(lx, lz);
    this.w.box(x, z, y, w, dep, h, this.yaw, st, cap);
  }

  solid(lx: number, lz: number, w: number, dep: number, y0: number, top: number): void {
    if (top - y0 < 0.02 || w < 0.04 || dep < 0.04) return;
    const [x, z] = this.place(lx, lz);
    this.cols.push({ x, z, hw: w / 2, hd: dep / 2, yaw: this.yaw, y0, top });
  }
}
