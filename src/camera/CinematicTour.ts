// Authored glide across the basin. One centripetal spline, timed by arc length, so the
// dolly does not speed up on a long span or hitch at a knot. Knots are placed from the
// live landmark positions and lifted over roofs. Street beats are dropped if the block
// is not open. The look target is a subject framed on a third, recomputed from the
// window aspect so a portrait phone does not centre the same point as a wide monitor.

import { Vector3 } from 'three/webgpu';
import type { GradeId } from '../photo/types';
import type { Landmark } from '../world/layout';
import type { CityQuery } from '../world/CityQuery';
import { raiseClear, roofAt } from './clearance';
import { damp, smootherstep } from './easing';
import { frameSubject, type Third } from './framing';
import { CameraSpline, type SplineKnot } from './spline';
import { reducedMotion } from './reducedMotion';

const TARGET_SECONDS = 132;

export interface TourBeat {
  id: string;
  name: string;
  t0: number;
  t1: number;
}

interface KnotData {
  focal: number;
  fStop: number;
  grade: GradeId;
  gradeMix: number;
  anamorphic: number;
  flare: number;
  pace: number;
  beat: string;
  beatIndex: number;
  xThird: number;
  yThird: number;
  subject: Vector3;
}

export interface TourView {
  focalMm: number;
  fStop: number;
  focus: number;
  anamorphic: number;
  flare: number;
  grain: number;
  vignette: number;
  grade: GradeId;
  gradeMix: number;
  motion: number;
  beat: string;
  beatIndex: number;
  beatCount: number;
}

const look = new Vector3();
const subject = new Vector3();

export class CinematicTour {
  readonly beats: TourBeat[];
  readonly duration: number;
  readonly clearanceFixes: number;
  /** Metres of path that were still inside something after the lift. Runtime raiseClear covers these. */
  readonly clearanceLeft: number;
  time = 0;
  active = true;
  readonly position = new Vector3();
  readonly aim = new Vector3();
  readonly prefetch = new Vector3();
  lens: TourView;
  private readonly query: CityQuery;
  private readonly spline: CameraSpline<KnotData>;
  private readonly stamps: Array<{ d: number; time: number }>;
  private focus = 80;

  private constructor(query: CityQuery, spline: CameraSpline<KnotData>, stamps: Array<{ d: number; time: number }>, beats: TourBeat[], fixes: number, left: number) {
    this.query = query;
    this.spline = spline;
    this.stamps = stamps;
    this.beats = beats;
    this.duration = stamps[stamps.length - 1]?.time ?? 1;
    this.clearanceFixes = fixes;
    this.clearanceLeft = left;
    this.lens = blankLens(beats.length);
    this.apply(0, 16 / 9, 0);
  }

  static build(query: CityQuery): CinematicTour | null {
    const knots = author(query);
    if (knots.length < 4) return null;
    const hardened = harden(query, knots);
    const spline = new CameraSpline(hardened.knots);
    if (spline.length < 80) return null;
    const stamps = timeStamps(spline, reducedMotion() ? TARGET_SECONDS * 1.25 : TARGET_SECONDS);
    const beats = beatRanges(spline, stamps);
    const left = countInside(query, spline);
    return new CinematicTour(query, spline, stamps, beats, hardened.fixes, left);
  }

  suspend(): void {
    this.active = false;
  }

  update(dt: number, hold: boolean, aspect: number): void {
    if (!this.active) return;
    if (!hold) this.time = Math.min(this.duration, this.time + Math.max(0, dt));
    if (this.time >= this.duration - 1e-3) this.active = false;
    this.apply(this.time, aspect, dt);
  }

  /** Jump to the next beat. The director covers the cut with a short dip. */
  skip(): void {
    const next = this.beats.find((b) => b.t0 > this.time + 0.35);
    this.time = next ? next.t0 : this.duration;
    if (this.time >= this.duration - 1e-3) this.active = false;
  }

  /** Park inside a beat so a still can be framed. */
  seekBeat(index: number): void {
    const beat = this.beats[Math.max(0, Math.min(this.beats.length - 1, index))];
    if (!beat) return;
    this.active = true;
    this.time = beat.t0 + (beat.t1 - beat.t0) * 0.42;
    this.apply(this.time, 16 / 9, 1);
  }

  private apply(time: number, aspect: number, dt: number): void {
    const distance = distanceAt(this.stamps, time);
    const hit = this.spline.at(distance);
    const y = raiseClear(this.query, hit.position.x, hit.position.y, hit.position.z, 3);
    this.position.copy(hit.position);
    this.position.y = y;
    const data = hit.data;
    subject.copy(data.subject);
    const focal = data.focal;
    frameSubject(this.position, subject, focal, Math.max(0.3, aspect), asThird(data.xThird), asThird(data.yThird), look);
    this.aim.copy(look);
    const want = Math.max(0.8, this.position.distanceTo(subject));
    this.focus = dt > 0 ? damp(this.focus, want, 1.6, dt) : want;
    const ahead = this.spline.at(distanceAt(this.stamps, Math.min(this.duration, time + 4)));
    this.prefetch.copy(ahead.position);
    const beat = this.beats.find((b) => b.id === data.beat) ?? this.beats[0];
    this.lens = {
      focalMm: focal,
      fStop: data.fStop,
      focus: this.focus,
      anamorphic: data.anamorphic,
      flare: data.flare,
      grain: 0.2,
      vignette: 0.36,
      grade: data.grade,
      gradeMix: data.gradeMix,
      motion: reducedMotion() ? 0 : 0.62,
      beat: beat?.name ?? data.beat,
      beatIndex: beat ? this.beats.indexOf(beat) : 0,
      beatCount: this.beats.length,
    };
  }
}

function blankLens(count: number): TourView {
  return {
    focalMm: 35, fStop: 4, focus: 40, anamorphic: 0, flare: 0.1,
    grain: 0.2, vignette: 0.36, grade: 'cyan', gradeMix: 0.4, motion: 0.5,
    beat: '', beatIndex: 0, beatCount: count,
  };
}

function asThird(n: number): Third {
  if (n < -0.34) return -1;
  if (n > 0.34) return 1;
  return 0;
}

function author(query: CityQuery): Array<SplineKnot<KnotData>> {
  const layout = query.layout;
  const mt = layout.landmarkById('megatower-1');
  const py = layout.landmarkById('wallace-pyramid');
  if (!mt || !py) return [];
  const sat = layout.landmarkById('wallace-satellite-a');
  const oldN = layout.landmarkById('old-pyramid-north');
  const knots: Array<SplineKnot<KnotData>> = [];
  let beat = 0;

  const push = (p: Vector3, partial: Omit<KnotData, 'beatIndex'> & { beatIndex?: number }) => {
    const data: KnotData = { ...partial, beatIndex: partial.beatIndex ?? beat };
    knots.push({ p: p.clone(), look: data.subject.clone(), data });
  };

  const sub = (lm: Landmark, frac: number) => new Vector3(lm.x, Math.max(20, lm.height * frac), lm.z);

  // 1. Wide establish. The tower sits on the right third, haze above it.
  beat = knots.length ? beat : 0;
  const estA = place(query, mt, 2.15, 1.65, 340);
  const estB = place(query, mt, 1.82, 1.15, 260);
  push(estA, lens('establish', 'cyan', 0.62, 28, 5.6, 1, sub(mt, 0.46), 1, 1, 0.1));
  push(estB, lens('establish', 'cyan', 0.62, 32, 5.6, 1, sub(mt, 0.5), 1, 1, 0.12));

  // 2. Street dolly, leading lines down the avenue.
  const street = streetRun(query, 'historic-core') ?? streetRun(query, 'dtla') ?? streetRun(query, 'little-tokyo-market');
  if (street) {
    beat++;
    for (const bow of bridge(query, knots[knots.length - 1]!.p, street[0]!, 320)) {
      push(bow, lens('establish', 'cyan', 0.4, 35, 5.6, 0.8, sub(mt, 0.4), 0, 0, 0.08));
    }
    beat++;
    const along = streetLook(street);
    street.forEach((p, i) => {
      const u = street.length <= 1 ? 0 : i / (street.length - 1);
      push(p, lens('avenue', 'cyan', 0.42, 40, 4, 2.3, along[i] ?? along[0]!, 0, 1, 0.08, u));
    });
  }

  // 3. Crane off the street, up the megatower face.
  beat++;
  const craneLow = place(query, mt, 0.9, 1.05, Math.max(18, query.groundHeight(mt.x, mt.z) + 8));
  const craneMid = place(query, mt, 0.72, 1.2, Math.min(160, mt.height * 0.22));
  const craneHigh = place(query, mt, 0.55, 1.35, Math.min(340, mt.height * 0.4));
  push(craneLow, lens('crane', 'cyan', 0.48, 30, 4, 1.7, sub(mt, 0.18), -1, 1, 0.1));
  push(craneMid, lens('crane', 'cyan', 0.5, 48, 4, 1.7, sub(mt, 0.4), -1, 1, 0.12));
  push(craneHigh, lens('crane', 'cyan', 0.52, 72, 4, 1.6, sub(mt, 0.62), -1, 0, 0.14));

  // 4. Slow partial orbit of the crown.
  beat++;
  for (let i = 0; i <= 4; i++) {
    const u = i / 4;
    const p = place(query, mt, 0.35 + u * 0.7, 1.25, Math.min(420, mt.height * 0.48) + u * 20);
    push(p, lens('orbit', 'cyan', 0.55, 58, 4, 1.45, sub(mt, 0.58), u < 0.5 ? -1 : 1, 1, 0.12));
  }

  // 5. Long lens on the pyramid, from the downtown side.
  beat++;
  const pyAngle = Math.atan2(mt.z - py.z, mt.x - py.x);
  for (const bow of bridge(query, knots[knots.length - 1]!.p, place(query, py, pyAngle + Math.PI, 1.02, 240), 480)) {
    push(bow, lens('orbit', 'orange', 0.35, 70, 4, 0.75, sub(py, 0.35), 1, 0, 0.1));
  }
  beat++;
  push(place(query, py, pyAngle + Math.PI + 0.08, 1.05, 220), lens('compress', 'orange', 0.78, 115, 2.8, 1.55, sub(py, 0.42), 1, 0, 0.2));
  push(place(query, py, pyAngle + Math.PI - 0.06, 1.12, 260), lens('compress', 'orange', 0.8, 135, 2.8, 1.55, sub(py, 0.48), 1, 0, 0.22));

  // 6. Foreground mass against the haze. The satellite sits near the lens, the pyramid on the right third.
  if (sat) {
    beat++;
    const fore = foreground(query, sat, py);
    push(fore[0]!, lens('silhouette', 'orange', 0.72, 80, 2.8, 1.4, sub(py, 0.38), 1, 0, 0.16));
    push(fore[1]!, lens('silhouette', 'orange', 0.7, 95, 2.8, 1.4, sub(py, 0.44), 1, 1, 0.16));
  }

  // 7. Canyon dolly, a second street if the first one was not Broadway's district.
  const canyon = streetRun(query, street ? 'little-tokyo-market' : 'historic-core') ?? streetRun(query, 'financial-megatowers');
  if (canyon) {
    beat++;
    for (const bow of bridge(query, knots[knots.length - 1]!.p, canyon[0]!, 300)) {
      push(bow, lens('silhouette', 'cyan', 0.3, 40, 4, 0.8, sub(py, 0.3), 0, 0, 0.08));
    }
    beat++;
    const aims = streetLook(canyon);
    canyon.forEach((p, i) => {
      push(p, lens('canyon', 'neon', 0.48, 35, 2.8, 2.2, aims[i] ?? aims[0]!, -1, 0, 0.14));
    });
  }

  // 8. Sea wall, wide, horizon on the lower third.
  const sea = seaRun(query);
  if (sea) {
    beat++;
    for (const bow of bridge(query, knots[knots.length - 1]!.p, sea.points[0]!, 220)) {
      push(bow, lens('canyon', 'harbor', 0.25, 28, 5.6, 0.78, sea.aims[0]!, 0, -1, 0.06));
    }
    beat++;
    sea.points.forEach((p, i) => {
      push(p, lens('seawall', 'harbor', 0.4, 24, 8, 1.15, sea.aims[i] ?? sea.aims[0]!, 0, -1, 0.05));
    });
  }

  // 9. Amber ruin. The old pyramids stand in for a dead strip: dust colour, no signage.
  if (oldN) {
    beat++;
    const amberCam = place(query, oldN, 0.4, 1.35, Math.min(180, oldN.height * 0.22));
    for (const bow of bridge(query, knots[knots.length - 1]!.p, amberCam, 260)) {
      push(bow, lens('seawall', 'amber', 0.3, 40, 5.6, 0.8, sub(oldN, 0.4), 0, 0, 0.08));
    }
    beat++;
    push(amberCam, lens('amber', 'amber', 0.74, 70, 4, 1.5, sub(oldN, 0.45), -1, 0, 0.18));
    push(place(query, oldN, 0.85, 1.45, Math.min(220, oldN.height * 0.28)), lens('amber', 'amber', 0.7, 85, 2.8, 1.5, sub(oldN, 0.55), -1, 1, 0.18));
  }

  // 10. Return, slow, easing out over the towers.
  beat++;
  const back = place(query, mt, 2.0, 1.4, 380);
  for (const bow of bridge(query, knots[knots.length - 1]!.p, back, 420)) {
    push(bow, lens('return', 'orange', 0.28, 40, 5.6, 0.72, sub(mt, 0.4), 1, 1, 0.08));
  }
  beat++;
  push(back, lens('return', 'cyan', 0.4, 36, 5.6, 1.1, sub(mt, 0.5), 1, 1, 0.1));
  push(place(query, mt, 2.35, 1.7, 300), lens('return', 'cyan', 0.36, 28, 5.6, 1.3, sub(mt, 0.42), 1, 1, 0.08));

  return knots.filter((k, i) => i === 0 || k.p.distanceTo(knots[i - 1]!.p) > 4);
}

function lens(
  beat: string,
  grade: GradeId,
  gradeMix: number,
  focal: number,
  fStop: number,
  pace: number,
  subjectPoint: Vector3,
  xThird: number,
  yThird: number,
  flare: number,
  _u = 0,
): Omit<KnotData, 'beatIndex'> {
  void _u;
  return {
    focal, fStop, grade, gradeMix, anamorphic: 0, flare, pace, beat,
    xThird, yThird, subject: subjectPoint,
  };
}

function place(query: CityQuery, lm: Landmark, angle: number, radiusScale: number, wantY: number): Vector3 {
  const half = Math.max(lm.baseWidth, lm.baseDepth ?? lm.baseWidth, 40) * 0.5;
  let r = (Math.max(half, lm.reserveRadius) * 1.06 + 48) * radiusScale;
  for (let k = 0; k < 8; k++) {
    const x = lm.x + Math.cos(angle) * r;
    const z = lm.z + Math.sin(angle) * r;
    const top = roofAt(query, x, z, 12);
    if (top + 14 <= wantY || k === 7) {
      const y = Math.max(wantY, top + 16, query.groundHeight(x, z) + 12);
      return new Vector3(x, y, z);
    }
    r *= 1.14;
  }
  return new Vector3(lm.x + Math.cos(angle) * r, wantY, lm.z + Math.sin(angle) * r);
}

/** Two points just outside a near mass, looking past it at a far landmark. */
function foreground(query: CityQuery, near: Landmark, far: Landmark): [Vector3, Vector3] {
  const dx = far.x - near.x;
  const dz = far.z - near.z;
  const len = Math.hypot(dx, dz) || 1;
  const tx = dx / len;
  const tz = dz / len;
  const sx = -tz;
  const sz = tx;
  const half = Math.max(near.baseWidth, near.baseDepth ?? near.baseWidth) * 0.5;
  const r = Math.max(half, near.reserveRadius) + 56;
  const y0 = Math.max(70, query.groundHeight(near.x, near.z) + 40);
  const a = new Vector3(near.x - tx * (r + 30) + sx * r * 0.92, y0, near.z - tz * (r + 30) + sz * r * 0.92);
  const b = new Vector3(near.x - tx * (r + 10) + sx * r * 0.55, y0 + 18, near.z - tz * (r + 10) + sz * r * 0.55);
  a.y = Math.max(a.y, roofAt(query, a.x, a.z, 8) + 14);
  b.y = Math.max(b.y, roofAt(query, b.x, b.z, 8) + 14);
  return [a, b];
}

function bridge(query: CityQuery, a: Vector3, b: Vector3, floorY: number): Vector3[] {
  const out: Vector3[] = [];
  for (const t of [0.34, 0.67]) out.push(sidestep(query, a, b, t, floorY));
  return out;
}

function sidestep(query: CityQuery, a: Vector3, b: Vector3, t: number, floorY: number): Vector3 {
  const x = a.x + (b.x - a.x) * t;
  const z = a.z + (b.z - a.z) * t;
  const y = Math.max(floorY, a.y + (b.y - a.y) * t);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  const px = -dz / len;
  const pz = dx / len;
  let bestX = x;
  let bestZ = z;
  let bestTop = roofAt(query, x, z, 16);
  if (bestTop > 160) {
    for (let s = 250; s <= 3600; s += 250) {
      for (const sign of [1, -1]) {
        const sx = x + px * s * sign;
        const sz = z + pz * s * sign;
        const top = roofAt(query, sx, sz, 16);
        if (top < bestTop) {
          bestTop = top;
          bestX = sx;
          bestZ = sz;
        }
        if (top < 40) break;
      }
      if (bestTop < 40) break;
    }
  }
  const gy = query.groundHeight(bestX, bestZ);
  return new Vector3(bestX, Math.max(y, bestTop + 28, gy + 40, floorY * (0.55 + Math.sin(t * Math.PI) * 0.45)), bestZ);
}

function streetRun(query: CityQuery, id: string): Vector3[] | null {
  const district = query.layout.districts.find((d) => d.id === id);
  if (!district) return null;
  const cx = (district.bbox[0] + district.bbox[2]) / 2;
  const cz = (district.bbox[1] + district.bbox[3]) / 2;
  const prevFail = query.failClosed;
  const prevLimit = query.syncLimit;
  query.failClosed = true;
  query.syncLimit = query.frameSyncs + 4;
  try {
    const fab = query.fabricAt(cx, cz);
    const blocks = fab.blocks.filter((b) => b.district === district);
    if (!blocks.length) return null;
    const block = blocks[Math.floor(blocks.length / 2)]!;
    const side = 1;
    const off = block.la / 2 + block.street / 2;
    const ox = block.cx + block.ax * off * side;
    const oz = block.cz + block.az * off * side;
    const points: Vector3[] = [];
    const stops = [-0.42, -0.14, 0.14, 0.42];
    for (const u of stops) {
      const x = ox + block.bx * block.lb * u;
      const z = oz + block.bz * block.lb * u;
      const y = query.groundHeight(x, z) + 1.85;
      if (query.insideSolid(x, y, z, 0.7, true) || query.insideLandmark(x, y, z, 1.2)) return null;
      points.push(new Vector3(x, y, z));
    }
    return points;
  } finally {
    query.failClosed = prevFail;
    query.syncLimit = prevLimit;
  }
}

function streetLook(points: Vector3[]): Vector3[] {
  return points.map((p, i) => {
    const n = points[Math.min(points.length - 1, i + 1)]!;
    const dir = _dir.copy(n).sub(p);
    if (dir.lengthSq() < 1) dir.set(points[1]!.x - points[0]!.x, 0, points[1]!.z - points[0]!.z);
    dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
    dir.normalize();
    return new Vector3(p.x + dir.x * 86, p.y + 7, p.z + dir.z * 86);
  });
}

const _dir = new Vector3();

function seaRun(query: CityQuery): { points: Vector3[]; aims: Vector3[] } | null {
  let best: { ax: number; az: number; bx: number; bz: number; len: number; crest: number } | null = null;
  for (const wall of query.layout.seaWalls) {
    for (let i = 0; i < wall.pts.length - 1; i++) {
      const ax = wall.pts[i]![0];
      const az = wall.pts[i]![1];
      const bx = wall.pts[i + 1]![0];
      const bz = wall.pts[i + 1]![1];
      const len = Math.hypot(bx - ax, bz - az);
      if (!best || len > best.len) best = { ax, az, bx, bz, len, crest: wall.crestHeight };
    }
  }
  if (!best || best.len < 400) return null;
  const ux = (best.bx - best.ax) / best.len;
  const uz = (best.bz - best.az) / best.len;
  let nx = -uz;
  let nz = ux;
  if (!query.layout.isOcean(best.ax + nx * 300, best.az + nz * 300)) { nx = -nx; nz = -nz; }
  const points: Vector3[] = [];
  const aims: Vector3[] = [];
  for (const u of [0.22, 0.48, 0.74]) {
    const x = best.ax + (best.bx - best.ax) * u + nx * 70;
    const z = best.az + (best.bz - best.az) * u + nz * 70;
    const y = best.crest + 32;
    points.push(new Vector3(x, y, z));
    aims.push(new Vector3(x + ux * 420, best.crest + 6, z + uz * 420));
  }
  return { points, aims };
}

function harden(query: CityQuery, knots: Array<SplineKnot<KnotData>>): { knots: Array<SplineKnot<KnotData>>; fixes: number } {
  let fixes = 0;
  const lifted = knots.map((k) => {
    const y = raiseClear(query, k.p.x, k.p.y, k.p.z, 4);
    if (y > k.p.y + 1) fixes++;
    const p = k.p.clone();
    p.y = y;
    return { p, look: k.look.clone(), data: { ...k.data, subject: k.data.subject.clone() } };
  });
  const out: Array<SplineKnot<KnotData>> = [lifted[0]!];
  for (let i = 0; i < lifted.length - 1; i++) {
    const a = lifted[i]!;
    const b = lifted[i + 1]!;
    const dist = a.p.distanceTo(b.p);
    const steps = Math.max(1, Math.ceil(dist / 45));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const p = a.p.clone().lerp(b.p, t);
      const y = raiseClear(query, p.x, p.y, p.z, 8);
      if (y > p.y + 8) {
        p.y = y;
        fixes++;
        out.push(mid(a, b, t, p));
      }
    }
    out.push(b);
  }
  return { knots: out, fixes };
}

function mid(a: SplineKnot<KnotData>, b: SplineKnot<KnotData>, t: number, p: Vector3): SplineKnot<KnotData> {
  const data = lerpKnot(a.data, b.data, t);
  return { p, look: data.subject.clone(), data };
}

function lerpKnot(a: KnotData, b: KnotData, t: number): KnotData {
  return {
    focal: a.focal + (b.focal - a.focal) * t,
    fStop: a.fStop + (b.fStop - a.fStop) * t,
    grade: t < 0.5 ? a.grade : b.grade,
    gradeMix: a.gradeMix + (b.gradeMix - a.gradeMix) * t,
    anamorphic: a.anamorphic + (b.anamorphic - a.anamorphic) * t,
    flare: a.flare + (b.flare - a.flare) * t,
    pace: a.pace + (b.pace - a.pace) * t,
    beat: t < 0.5 ? a.beat : b.beat,
    beatIndex: t < 0.5 ? a.beatIndex : b.beatIndex,
    xThird: a.xThird + (b.xThird - a.xThird) * t,
    yThird: a.yThird + (b.yThird - a.yThird) * t,
    subject: a.subject.clone().lerp(b.subject, t),
  };
}

function countInside(query: CityQuery, spline: CameraSpline<KnotData>): number {
  let hits = 0;
  const n = Math.max(1, Math.ceil(spline.length / 30));
  for (let i = 0; i <= n; i++) {
    const p = spline.at(spline.length * (i / n)).position;
    const y = raiseClear(query, p.x, p.y, p.z, 3);
    if (y > p.y + 12) hits++;
  }
  return hits;
}

function timeStamps(spline: CameraSpline<KnotData>, target: number): Array<{ d: number; time: number }> {
  const step = 10;
  const raw: Array<{ d: number; pace: number }> = [];
  for (let d = 0; d <= spline.length; d += step) raw.push({ d, pace: Math.max(0.4, spline.at(d).data.pace) });
  if (raw[raw.length - 1]!.d < spline.length) raw.push({ d: spline.length, pace: raw[raw.length - 1]!.pace });
  const edge = Math.min(140, spline.length * 0.07);
  const stamps: Array<{ d: number; time: number }> = [{ d: 0, time: 0 }];
  let time = 0;
  const cruise = 46;
  for (let i = 1; i < raw.length; i++) {
    const dd = raw[i]!.d - raw[i - 1]!.d;
    const mid = (raw[i]!.d + raw[i - 1]!.d) / 2;
    let pace = 0;
    let w = 0;
    for (const sample of raw) {
      const gap = Math.abs(sample.d - mid);
      if (gap > 160) continue;
      const k = 1 - gap / 160;
      pace += sample.pace * k;
      w += k;
    }
    pace = w > 0 ? pace / w : 1;
    const fade = Math.max(0.12, smootherstep(Math.min(1, mid / edge)) * smootherstep(Math.min(1, (spline.length - mid) / edge)));
    const speed = cruise / pace * fade;
    time += dd / Math.max(0.4, speed);
    stamps.push({ d: raw[i]!.d, time });
  }
  const scale = time > 1 ? target / time : 1;
  for (const stamp of stamps) stamp.time *= scale;
  return stamps;
}

function beatRanges(spline: CameraSpline<KnotData>, stamps: Array<{ d: number; time: number }>): TourBeat[] {
  const beats: TourBeat[] = [];
  let current = '';
  let t0 = 0;
  for (const stamp of stamps) {
    const id = spline.at(stamp.d).data.beat;
    if (id !== current) {
      if (current) beats.push({ id: current, name: BEAT_NAMES[current] ?? current, t0, t1: stamp.time });
      current = id;
      t0 = stamp.time;
    }
  }
  if (current) beats.push({ id: current, name: BEAT_NAMES[current] ?? current, t0, t1: stamps[stamps.length - 1]!.time });
  return beats.filter((b) => b.t1 - b.t0 > 0.4);
}

const BEAT_NAMES: Record<string, string> = {
  establish: 'Wide establish',
  avenue: 'Avenue lines',
  crane: 'Crane',
  orbit: 'Crown orbit',
  compress: 'Pyramid compression',
  silhouette: 'Foreground haze',
  canyon: 'Canyon dolly',
  seawall: 'Sea wall',
  amber: 'Amber ruin',
  return: 'Return',
};

function distanceAt(stamps: Array<{ d: number; time: number }>, time: number): number {
  const t = Math.max(0, Math.min(stamps[stamps.length - 1]?.time ?? 0, time));
  for (let i = 1; i < stamps.length; i++) {
    const s = stamps[i]!;
    if (t <= s.time) {
      const p = stamps[i - 1]!;
      const span = s.time - p.time;
      const u = span > 1e-5 ? (t - p.time) / span : 0;
      return p.d + (s.d - p.d) * u;
    }
  }
  return stamps[stamps.length - 1]?.d ?? 0;
}
