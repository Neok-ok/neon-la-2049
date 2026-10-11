// Centripetal Catmull-Rom sampled by arc length.
// Parameterising by distance (not by knot index) keeps a dolly from speeding up on long spans
// and stalling on short ones. Alpha 0.5 is the centripetal form, which does not cusp on uneven knots.

import { Vector3 } from 'three/webgpu';

const ALPHA = 0.5;

export interface SplineKnot<T> {
  p: Vector3;
  look: Vector3;
  data: T;
}

interface Mark {
  t: number;
  d: number;
}

interface Segment<T> {
  i: number;
  d0: number;
  d1: number;
  marks: Mark[];
  a: SplineKnot<T>;
  b: SplineKnot<T>;
}

export interface SplineHit<T> {
  position: Vector3;
  look: Vector3;
  data: T;
  distance: number;
  /** 0..1 along the whole path, by distance. */
  u: number;
}

function knotT(ti: number, a: Vector3, b: Vector3): number {
  const d = a.distanceTo(b);
  return ti + Math.pow(Math.max(d, 1e-4), ALPHA);
}

function lerpV(a: Vector3, b: Vector3, t: number, out: Vector3): Vector3 {
  return out.copy(a).lerp(b, t);
}

/** One centripetal span. `t` is 0 at p1 and 1 at p2. */
export function centripetal(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: number, out: Vector3): Vector3 {
  const t0 = 0;
  const t1 = knotT(t0, p0, p1);
  const t2 = knotT(t1, p1, p2);
  const t3 = knotT(t2, p2, p3);
  const tt = t1 + (t2 - t1) * Math.min(1, Math.max(0, t));
  const a1 = weighted(p0, p1, t0, t1, tt, _a);
  const a2 = weighted(p1, p2, t1, t2, tt, _b);
  const a3 = weighted(p2, p3, t2, t3, tt, _c);
  const b1 = weighted(a1, a2, t0, t2, tt, _d);
  const b2 = weighted(a2, a3, t1, t3, tt, _e);
  return weighted(b1, b2, t1, t2, tt, out);
}

function weighted(p: Vector3, q: Vector3, ta: number, tb: number, tt: number, out: Vector3): Vector3 {
  const span = tb - ta;
  if (Math.abs(span) < 1e-6) return out.copy(q);
  const u = (tt - ta) / span;
  return out.copy(p).multiplyScalar(1 - u).addScaledVector(q, u);
}

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _e = new Vector3();
const _p = new Vector3();

export class CameraSpline<T> {
  readonly length: number;
  private segs: Array<Segment<T>> = [];
  private knots: Array<SplineKnot<T>>;

  constructor(knots: Array<SplineKnot<T>>) {
    this.knots = knots.length >= 2 ? knots : [knots[0]!, { ...knots[0]!, p: knots[0]!.p.clone(), look: knots[0]!.look.clone() }];
    let dist = 0;
    for (let i = 0; i < this.knots.length - 1; i++) {
      const a = this.knots[i]!;
      const b = this.knots[i + 1]!;
      const marks: Mark[] = [];
      const steps = 12;
      let prev = a.p;
      let local = 0;
      marks.push({ t: 0, d: 0 });
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const pos = this.spanPos(i, t, _p);
        local += pos.distanceTo(prev);
        prev = pos.clone();
        marks.push({ t, d: local });
      }
      this.segs.push({ i, d0: dist, d1: dist + local, marks, a, b });
      dist += local;
    }
    this.length = dist;
  }

  at(distance: number): SplineHit<T> {
    const d = Math.max(0, Math.min(this.length, distance));
    const seg = this.segmentAt(d);
    const local = d - seg.d0;
    const t = invert(seg.marks, local);
    const position = this.spanPos(seg.i, t, new Vector3());
    const look = this.spanLook(seg.i, t, new Vector3());
    return {
      position,
      look,
      data: lerpData(seg.a.data, seg.b.data, t),
      distance: d,
      u: this.length > 0 ? d / this.length : 0,
    };
  }

  /** Positions every `step` metres, for a clearance pass. */
  samples(step: number): Vector3[] {
    const out: Vector3[] = [];
    const n = Math.max(1, Math.ceil(this.length / Math.max(4, step)));
    for (let i = 0; i <= n; i++) out.push(this.at(this.length * (i / n)).position.clone());
    return out;
  }

  private segmentAt(distance: number): Segment<T> {
    for (const seg of this.segs) if (distance <= seg.d1) return seg;
    return this.segs[this.segs.length - 1]!;
  }

  private pad(i: number): [SplineKnot<T>, SplineKnot<T>, SplineKnot<T>, SplineKnot<T>] {
    const n = this.knots.length;
    const i0 = Math.max(0, i - 1);
    const i1 = i;
    const i2 = Math.min(n - 1, i + 1);
    const i3 = Math.min(n - 1, i + 2);
    return [this.knots[i0]!, this.knots[i1]!, this.knots[i2]!, this.knots[i3]!];
  }

  private spanPos(i: number, t: number, out: Vector3): Vector3 {
    const [a, b, c, d] = this.pad(i);
    return centripetal(a.p, b.p, c.p, d.p, t, out);
  }

  private spanLook(i: number, t: number, out: Vector3): Vector3 {
    const [a, b, c, d] = this.pad(i);
    return centripetal(a.look, b.look, c.look, d.look, t, out);
  }
}

function invert(marks: Mark[], distance: number): number {
  if (distance <= 0) return 0;
  for (let i = 1; i < marks.length; i++) {
    const m = marks[i]!;
    if (distance <= m.d) {
      const p = marks[i - 1]!;
      const span = m.d - p.d;
      const u = span > 1e-6 ? (distance - p.d) / span : 0;
      return p.t + (m.t - p.t) * u;
    }
  }
  return 1;
}

function lerpData<T>(a: T, b: T, t: number): T {
  if (typeof a === 'number' && typeof b === 'number') return (a + (b - a) * t) as T;
  if (a && b && typeof a === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(a as object)) {
      const av = (a as Record<string, unknown>)[key];
      const bv = (b as Record<string, unknown>)[key];
      if (typeof av === 'number' && typeof bv === 'number') out[key] = av + (bv - av) * t;
      else if (av instanceof Vector3 && bv instanceof Vector3) out[key] = lerpV(av, bv, t, new Vector3());
      else out[key] = t < 0.5 ? av : bv;
    }
    return out as T;
  }
  return t < 0.5 ? a : b;
}
