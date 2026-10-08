// Geometry writer producing the same vertex layout as the chunk mesher (position/normal/facade/bdata),
// so landmarks share the procedural city material (windows, wetness, snow, far-light averaging).
import { BufferAttribute, BufferGeometry } from 'three/webgpu';

export interface FaceStyle {
  style: number;
  lit: number;
  tint: number;
  seed: number;
}

export class GeoWriter {
  private pos: number[] = [];
  private nor: number[] = [];
  private fac: number[] = [];
  private bd: number[] = [];
  private idx: number[] = [];
  private v = 0;

  /** Planar quad, corners CCW seen from the front. Facade coords per corner. */
  quad(p: number[][], f: number[][], st: FaceStyle): void {
    const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
    const bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (let k = 0; k < 4; k++) {
      this.pos.push(p[k][0], p[k][1], p[k][2]);
      this.nor.push(nx, ny, nz);
      this.fac.push(f[k][0], f[k][1]);
      this.bd.push(st.seed, st.style, st.lit, st.tint);
    }
    const v = this.v;
    this.idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    this.v += 4;
  }

  /**
   * Rectangular frustum (box when w0==w1 && d0==d1) centred at (cx, cz), rotated by yaw.
   * Bottom w0 x d0 at y0, top w1 x d1 at y0 + h. Optional top cap.
   */
  frustum(cx: number, cz: number, y0: number, w0: number, d0: number, w1: number, d1: number, h: number, yaw: number, st: FaceStyle, cap = true): void {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const L = (lx: number, lz: number, y: number) => [cx + lx * c + lz * s, y, cz - lx * s + lz * c];
    const y1 = y0 + h;
    const b = [L(-w0 / 2, d0 / 2, y0), L(w0 / 2, d0 / 2, y0), L(w0 / 2, -d0 / 2, y0), L(-w0 / 2, -d0 / 2, y0)];
    const t = [L(-w1 / 2, d1 / 2, y1), L(w1 / 2, d1 / 2, y1), L(w1 / 2, -d1 / 2, y1), L(-w1 / 2, -d1 / 2, y1)];
    const slant = (dw: number) => Math.hypot(h, dw / 2);
    const sides: Array<[number, number, number, number]> = [
      [0, 1, w0, w1], // +Z
      [1, 2, d0, d1], // +X
      [2, 3, w0, w1], // -Z
      [3, 0, d0, d1], // -X
    ];
    let u = 100 + st.seed * 1000;
    for (const [i, j, lb, lt] of sides) {
      const sv = slant(lb - lt);
      const off = (lb - lt) / 2;
      this.quad([b[i], b[j], t[j], t[i]], [[u, 0], [u + lb, 0], [u + lb - off, sv], [u + off, sv]], st);
      u += lb;
    }
    if (cap) this.quad([t[0], t[1], t[2], t[3]], [[500 - w1 / 2, 500 + d1 / 2], [500 + w1 / 2, 500 + d1 / 2], [500 + w1 / 2, 500 - d1 / 2], [500 - w1 / 2, 500 - d1 / 2]], st);
    if (w0 < w1 || d0 < d1) this.quad([b[3], b[2], b[1], b[0]], [[0, 0], [w0, 0], [w0, d0], [0, d0]], { ...st, lit: 0 });
  }

  box(cx: number, cz: number, y0: number, w: number, d: number, h: number, yaw: number, st: FaceStyle, cap = true): void {
    this.frustum(cx, cz, y0, w, d, w, d, h, yaw, st, cap);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('facade', new BufferAttribute(new Float32Array(this.fac), 2));
    g.setAttribute('bdata', new BufferAttribute(new Float32Array(this.bd), 4));
    g.setIndex(new BufferAttribute(new Uint32Array(this.idx), 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}
