// Pure module (worker-safe). The megatower kit writes geometry through a sink so the same code can feed a
// landmark mesh (GeoWriter, any shape, LOD by detail) or the chunk fabric (axis-aligned boxes only).

export interface FaceStyle {
  style: number;
  lit: number;
  tint: number;
  seed: number;
}

/**
 * 0 = mass, kept at every LOD (and in the far fabric).
 * 1 = secondary: pilasters, ledges, crown parts, every other fin (landmark LOD1, fabric LOD0–1).
 * 2 = detail: all fins, louvers, piers, mast arms (landmark LOD0, fabric LOD0).
 * 3 = hero clutter: only landmark LOD0 (fabric sinks drop it).
 */
export type KitDetail = 0 | 1 | 2 | 3;

export interface MassSink {
  /** Pieces with a higher detail are skipped. Kit code may also branch on it (e.g. merge split masses at 0). */
  readonly maxDetail: number;
  /** false for the fabric: frustums become their average box and rotated pieces are dropped. */
  readonly full: boolean;
  /**
   * Rectangular frustum in the sink frame: centre (lx, lz), base w0 × d0 at y0, top w1 × d1 at y0 + h.
   * `rot` is an extra yaw about the piece centre.
   */
  frustum(lx: number, lz: number, y0: number, w0: number, d0: number, w1: number, d1: number, h: number, st: FaceStyle, detail: KitDetail, cap?: boolean, rot?: number): void;
}

export function kitBox(sink: MassSink, lx: number, lz: number, y0: number, w: number, d: number, h: number, st: FaceStyle, detail: KitDetail, cap = true): void {
  sink.frustum(lx, lz, y0, w, d, w, d, h, st, detail, cap);
}

/** Counts pieces and triangles without writing geometry (budget checks, tests). */
export class CountingSink implements MassSink {
  pieces = 0;
  tris = 0;
  constructor(readonly maxDetail: number, readonly full = true) {}
  frustum(_lx: number, _lz: number, _y0: number, w0: number, d0: number, w1: number, d1: number, _h: number, _st: FaceStyle, detail: KitDetail, cap = true): void {
    if (detail > this.maxDetail) return;
    this.pieces++;
    this.tris += 8 + (cap ? 2 : 0) + (w0 < w1 || d0 < d1 ? 2 : 0);
  }
}
