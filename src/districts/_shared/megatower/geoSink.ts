// Main-thread sink: writes kit pieces into a GeoWriter (city material vertex layout) in a placed, rotated frame.
import { GeoWriter } from '../../../world/landmarks/GeoWriter';
import type { FaceStyle, KitDetail, MassSink } from './sink';

/** Placement of a kit frame in the world: origin (x, z), ground y and yaw (same convention as GeoWriter). */
export interface KitFrame {
  x: number;
  z: number;
  y: number;
  yaw: number;
}

export function frameToWorld(f: KitFrame, lx: number, lz: number): [number, number] {
  const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  return [f.x + lx * c + lz * s, f.z - lx * s + lz * c];
}

export class GeoSink implements MassSink {
  readonly full = true;
  readonly writer: GeoWriter;
  tris = 0;
  private c: number;
  private s: number;

  constructor(readonly maxDetail: number, public frame: KitFrame, writer?: GeoWriter) {
    this.writer = writer ?? new GeoWriter();
    this.c = Math.cos(frame.yaw);
    this.s = Math.sin(frame.yaw);
  }

  /** Re-target the sink (several towers into one writer). */
  setFrame(frame: KitFrame): void {
    this.frame = frame;
    this.c = Math.cos(frame.yaw);
    this.s = Math.sin(frame.yaw);
  }

  frustum(lx: number, lz: number, y0: number, w0: number, d0: number, w1: number, d1: number, h: number, st: FaceStyle, detail: KitDetail, cap = true, rot = 0): void {
    if (detail > this.maxDetail || h <= 0.01) return;
    const f = this.frame;
    const x = f.x + lx * this.c + lz * this.s;
    const z = f.z - lx * this.s + lz * this.c;
    this.writer.frustum(x, z, f.y + y0, w0, d0, w1, d1, h, f.yaw + rot, st, cap);
    this.tris += 8 + (cap ? 2 : 0) + (w0 < w1 || d0 < d1 ? 2 : 0);
  }
}
