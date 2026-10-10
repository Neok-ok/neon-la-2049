// Reusable street-kit templates. Unit-ish meshes; callers scale them per instance.
// Local space: +Y up, +Z "outward" (awnings extend +Z from the wall). Hard-surface flat normals.

export interface KitTemplate {
  position: Float32Array;
  normal: Float32Array;
  index: Uint16Array;
}

class Bld {
  p: number[] = [];
  n: number[] = [];
  ix: number[] = [];
  private v = 0;

  /** Four corners, CCW when looking along the normal. */
  quad(c: number[][], nx: number, ny: number, nz: number): void {
    const v = this.v;
    for (const p of c) {
      this.p.push(p[0], p[1], p[2]);
      this.n.push(nx, ny, nz);
    }
    this.ix.push(v, v + 1, v + 2, v, v + 2, v + 3);
    this.v += 4;
  }

  done(): KitTemplate {
    return { position: new Float32Array(this.p), normal: new Float32Array(this.n), index: new Uint16Array(this.ix) };
  }
}

/** Centered box. Default 1×1×1. */
export function makeBox(w = 1, h = 1, d = 1): KitTemplate {
  const b = new Bld();
  const x = w / 2, y = h / 2, z = d / 2;
  b.quad([[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]], 0, 0, 1);
  b.quad([[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]], 0, 0, -1);
  b.quad([[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]], 1, 0, 0);
  b.quad([[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]], -1, 0, 0);
  b.quad([[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]], 0, 1, 0);
  b.quad([[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]], 0, -1, 0);
  return b.done();
}

/** Sloped awning: x [-0.5,0.5], z [0,1] (out from the wall), drops toward the street, with a front valance. */
export function makeAwning(): KitTemplate {
  const b = new Bld();
  const x = 0.5;
  const drop = 0.14;
  const t = 0.045;
  const y0 = 0;
  const z1 = 1;
  // top
  b.quad([[-x, y0 + t, 0], [x, y0 + t, 0], [x, y0 + t - drop, z1], [-x, y0 + t - drop, z1]], 0, 0.98, -0.2);
  // underside
  b.quad([[-x, y0 - drop, z1], [x, y0 - drop, z1], [x, y0, 0], [-x, y0, 0]], 0, -0.98, 0.2);
  // left / right
  b.quad([[-x, y0, 0], [-x, y0 - drop, z1], [-x, y0 + t - drop, z1], [-x, y0 + t, 0]], -1, 0, 0);
  b.quad([[x, y0 + t, 0], [x, y0 + t - drop, z1], [x, y0 - drop, z1], [x, y0, 0]], 1, 0, 0);
  // valance
  const vy = y0 - drop;
  b.quad([[-x, vy - 0.22, z1], [x, vy - 0.22, z1], [x, vy, z1], [-x, vy, z1]], 0, 0, 1);
  b.quad([[x, vy - 0.22, z1 - 0.02], [-x, vy - 0.22, z1 - 0.02], [-x, vy, z1 - 0.02], [x, vy, z1 - 0.02]], 0, 0, -1);
  return b.done();
}

/** Umbrella / stall canopy: hexagonal pyramid, radius 0.5, sitting on y=0, peak up. Origin at centre. */
export function makeCanopy(): KitTemplate {
  const b = new Bld();
  const n = 6;
  const peak = [0, 0.16, 0];
  const rim: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    rim.push([Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5]);
  }
  for (let i = 0; i < n; i++) {
    const p0 = rim[i], p1 = rim[(i + 1) % n];
    const nx = (p0[0] + p1[0]) * 0.5, nz = (p0[2] + p1[2]) * 0.5;
    b.quad([p0, p1, peak, peak], nx, 0.35, nz);
    // dark underside
    b.quad([p1, p0, [p0[0] * 0.15, -0.02, p0[2] * 0.15], [p1[0] * 0.15, -0.02, p1[2] * 0.15]], 0, -1, 0);
  }
  return b.done();
}

/** Vertical cylinder, radius 0.5, centred, 6 sides. Open ends. */
export function makeCylinder(sides = 6): KitTemplate {
  const b = new Bld();
  const y = 0.5;
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const nx = (c0 + c1) * 0.5, nz = (s0 + s1) * 0.5;
    b.quad(
      [[c0 * 0.5, -y, s0 * 0.5], [c1 * 0.5, -y, s1 * 0.5], [c1 * 0.5, y, s1 * 0.5], [c0 * 0.5, y, s0 * 0.5]],
      nx, 0, nz,
    );
  }
  return b.done();
}

/** Storage tank: 12-side wall plus a roof. Radius 0.5, height 1, centred. Same scale as `cyl` (sx = diameter). */
export function makeDrum(sides = 12): KitTemplate {
  const b = new Bld();
  const y = 0.5;
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const nx = (c0 + c1) * 0.5, nz = (s0 + s1) * 0.5;
    b.quad(
      [[c0 * 0.5, -y, s0 * 0.5], [c1 * 0.5, -y, s1 * 0.5], [c1 * 0.5, y, s1 * 0.5], [c0 * 0.5, y, s0 * 0.5]],
      nx, 0, nz,
    );
    b.quad(
      [[0, y, 0], [c0 * 0.5, y, s0 * 0.5], [c1 * 0.5, y, s1 * 0.5], [c1 * 0.5, y, s1 * 0.5]],
      0, 1, 0,
    );
  }
  return b.done();
}

/** Horizontal quad facing +Y, 1×1, centred. Puddles, grates, light cards. */
export function makeQuadY(): KitTemplate {
  const b = new Bld();
  b.quad([[-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 0, -0.5], [-0.5, 0, -0.5]], 0, 1, 0);
  return b.done();
}

/** Vertical quad facing +Z, 1×1, centred. Sheets, banners, shutters. */
export function makeQuadZ(): KitTemplate {
  const b = new Bld();
  b.quad([[-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0]], 0, 0, 1);
  return b.done();
}

/** Stool: post + round-ish seat. Feet at y=0, seat top ≈ 0.75. */
export function makeStool(): KitTemplate {
  const b = new Bld();
  const post = (x: number, z: number) => {
    const s = 0.035;
    b.quad([[x - s, 0, z + s], [x + s, 0, z + s], [x + s, 0.68, z + s], [x - s, 0.68, z + s]], 0, 0, 1);
    b.quad([[x - s, 0, z - s], [x - s, 0, z + s], [x - s, 0.68, z + s], [x - s, 0.68, z - s]], -1, 0, 0);
  };
  post(0, 0);
  // seat
  const r = 0.18, y0 = 0.66, y1 = 0.74;
  b.quad([[-r, y1, r], [r, y1, r], [r, y1, -r], [-r, y1, -r]], 0, 1, 0);
  b.quad([[-r, y0, -r], [r, y0, -r], [r, y0, r], [-r, y0, r]], 0, -1, 0);
  b.quad([[-r, y0, r], [r, y0, r], [r, y1, r], [-r, y1, r]], 0, 0, 1);
  b.quad([[r, y0, -r], [-r, y0, -r], [-r, y1, -r], [r, y1, -r]], 0, 0, -1);
  b.quad([[r, y0, r], [r, y0, -r], [r, y1, -r], [r, y1, r]], 1, 0, 0);
  b.quad([[-r, y0, -r], [-r, y0, r], [-r, y1, r], [-r, y1, -r]], -1, 0, 0);
  return b.done();
}

/** Two crossed vertical quads. Steam puffs. Height 1, width 1, centred on Y. */
export function makeCross(): KitTemplate {
  const b = new Bld();
  b.quad([[-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0]], 0, 0, 1);
  b.quad([[0, -0.5, -0.5], [0, -0.5, 0.5], [0, 0.5, 0.5], [0, 0.5, -0.5]], 1, 0, 0);
  return b.done();
}

export type TemplateId = 'box' | 'awning' | 'canopy' | 'cyl' | 'drum' | 'quadY' | 'quadZ' | 'stool';

const cache = new Map<TemplateId, KitTemplate>();

export function getTemplate(id: TemplateId): KitTemplate {
  let t = cache.get(id);
  if (!t) {
    if (id === 'box') t = makeBox();
    else if (id === 'awning') t = makeAwning();
    else if (id === 'canopy') t = makeCanopy();
    else if (id === 'cyl') t = makeCylinder();
    else if (id === 'drum') t = makeDrum();
    else if (id === 'quadY') t = makeQuadY();
    else if (id === 'quadZ') t = makeQuadZ();
    else t = makeStool();
    cache.set(id, t);
  }
  return t;
}
