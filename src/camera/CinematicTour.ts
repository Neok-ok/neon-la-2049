// Authored glide across the basin. One centripetal spline, timed by arc length, so the
// dolly does not speed up on a long span or hitch at a knot. Knots are placed from the
// live landmark positions and lifted over roofs. Street beats are dropped if the block
// is not open. The look target is a subject framed on a third, recomputed from the
// window aspect so a portrait phone does not centre the same point as a wide monitor.

import { Vector3 } from 'three/webgpu';
import { planApron } from '../districts/coastal-strip/apronPlan';
import { framePoint } from '../districts/coastal-strip/profile';
import { coastCamera, type CoastPose } from '../districts/coastal-strip/view';
import type { GradeId } from '../photo/types';
import type { Landmark } from '../world/layout';
import type { CityQuery } from '../world/CityQuery';
import { raiseClear, roofAt } from './clearance';
import { damp, smootherstep } from './easing';
import { frameSubject } from './framing';
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
  /** True on the framed shot. Bridges stay false so a beat starts on the picture, not the transit. */
  hero: boolean;
  /** Keep an authored eye height. The sea-wall crest sits on a collider raiseClear would climb. */
  lockHeight: boolean;
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
  beats: TourBeat[];
  duration: number;
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
  private stamps: Array<{ d: number; time: number }>;
  private focus = 80;
  private calm: boolean;
  private liftY = Number.NaN;

  private constructor(query: CityQuery, spline: CameraSpline<KnotData>, stamps: Array<{ d: number; time: number }>, beats: TourBeat[], fixes: number, left: number) {
    this.query = query;
    this.spline = spline;
    this.stamps = stamps;
    this.beats = beats;
    this.duration = stamps[stamps.length - 1]?.time ?? 1;
    this.clearanceFixes = fixes;
    this.clearanceLeft = left;
    this.calm = reducedMotion();
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
    const calm = reducedMotion();
    if (calm && !this.calm) {
      const beat = [...this.beats].reverse().find((b) => b.t0 <= this.time + 0.05) ?? this.beats[0];
      if (beat) this.time = beat.t0;
      this.liftY = Number.NaN;
    }
    this.calm = calm;
    if (!hold && !calm) this.time = Math.min(this.duration, this.time + Math.max(0, dt));
    if (!calm && this.time >= this.duration - 1e-3) this.active = false;
    this.apply(this.time, aspect, calm ? 0 : dt);
  }

  /** Jump to the next beat. The director covers the cut with a short dip. */
  skip(): void {
    const next = this.beats.find((b) => b.t0 > this.time + 0.35);
    this.time = next ? next.t0 : this.duration;
    if (this.time >= this.duration - 1e-3) this.active = false;
  }

  /** Park on the framed knot of a beat. */
  seekBeat(index: number): void {
    const beat = this.beats[Math.max(0, Math.min(this.beats.length - 1, index))];
    if (!beat) return;
    this.active = true;
    this.time = beat.t0;
    this.apply(this.time, 16 / 9, 0);
  }

  private apply(time: number, aspect: number, dt: number): void {
    const distance = distanceAt(this.stamps, time);
    const hit = this.spline.at(distance);
    const data = hit.data;
    const target = data.lockHeight
      ? hit.position.y
      : raiseClear(this.query, hit.position.x, hit.position.y, hit.position.z, 3);
    if (!Number.isFinite(this.liftY) || dt === 0) this.liftY = target;
    else this.liftY = damp(this.liftY, target, 3.5, dt);
    this.position.copy(hit.position);
    this.position.y = this.liftY;
    subject.copy(data.subject);
    const focal = data.focal;
    frameSubject(this.position, subject, focal, Math.max(0.3, aspect), data.xThird, data.yThird, look);
    this.aim.copy(look);
    const want = Math.max(0.8, this.position.distanceTo(subject));
    const pull = Math.abs(want - this.focus) < 400;
    this.focus = dt > 0 && pull ? damp(this.focus, want, 1.6, dt) : want;
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
      motion: reducedMotion() ? 0 : 0.28,
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

  // 1. Wide establish. Far enough that the slab is a skyline, not a wall.
  beat = knots.length ? beat : 0;
  const estA = wide(query, mt, 2.2, 2800, 240);
  const estB = wide(query, mt, 2.05, 1900, 200);
  push(estA, lens('establish', 'cyan', 0.82, 24, 5.6, 1, sub(mt, 0.42), 0.85, 0.2, 0.04, true));
  push(estB, lens('establish', 'cyan', 0.78, 32, 5.6, 1, sub(mt, 0.48), 0.65, 0.15, 0.04, true));

  // 2. Street dolly, leading lines down the avenue.
  const street = streetRun(query, 'historic-core') ?? streetRun(query, 'dtla') ?? streetRun(query, 'little-tokyo-market');
  if (street) {
    beat++;
    for (const bow of bridge(query, knots[knots.length - 1]!.p, street[0]!, 320)) {
      push(bow, lens('establish', 'cyan', 0.28, 35, 5.6, 0.8, sub(mt, 0.4), 0, 0, 0.02, false));
    }
    beat++;
    const along = streetLook(street, 64, 2.2);
    street.forEach((p, i) => {
      push(p, lens('avenue', 'neon', 0.4, 32, 2.8, 2.3, along[i] ?? along[0]!, 0, -0.35, 0.03, true));
    });
  }

  // 3. Crane off the street, up the megatower face.
  beat++;
  const craneLow = place(query, mt, 0.9, 1.05, Math.max(18, query.groundHeight(mt.x, mt.z) + 8));
  const craneMid = place(query, mt, 0.72, 1.2, Math.min(160, mt.height * 0.22));
  const craneHigh = place(query, mt, 0.55, 1.35, Math.min(340, mt.height * 0.4));
  push(craneLow, lens('crane', 'cyan', 0.4, 30, 4, 1.7, sub(mt, 0.18), -1, 1, 0.03, true));
  push(craneMid, lens('crane', 'cyan', 0.4, 48, 4, 1.7, sub(mt, 0.4), -1, 1, 0.04, true));
  push(craneHigh, lens('crane', 'cyan', 0.42, 72, 4, 1.6, sub(mt, 0.62), -1, 0, 0.04, true));

  // 4. Slow partial orbit of the crown.
  beat++;
  for (let i = 0; i <= 4; i++) {
    const u = i / 4;
    const p = place(query, mt, 0.35 + u * 0.7, 1.25, Math.min(420, mt.height * 0.48) + u * 20);
    push(p, lens('orbit', 'cyan', 0.4, 58, 4, 1.45, sub(mt, 0.58), u < 0.5 ? -1 : 1, 1, 0.04, true));
  }

  // 5. The pyramid on the right third, a nearer tower pulled into the left foreground.
  beat++;
  const compressA = pyramidFrame(query, py, sat, 7400, 1700, 190);
  const compressB = pyramidFrame(query, py, sat, 6600, 1200, 240);
  for (const bow of bridge(query, knots[knots.length - 1]!.p, compressA, 520)) {
    push(bow, lens('orbit', 'orange', 0.28, 50, 5.6, 0.75, sub(py, 0.5), 1, 0, 0.02, false));
  }
  beat++;
  push(compressA, lens('compress', 'orange', 0.55, 42, 2.8, 1.55, sub(py, 0.4), 0.85, -0.1, 0.05, true));
  push(compressB, lens('compress', 'orange', 0.58, 50, 2.8, 1.55, sub(py, 0.46), 0.7, 0.1, 0.05, true));

  // 6. Foreground mass against the haze. The satellite sits near the lens, the pyramid on the right third.
  if (sat) {
    beat++;
    const fore = foreground(query, sat, py);
    push(fore[0]!, lens('silhouette', 'orange', 0.48, 32, 2.2, 1.4, sub(py, 0.42), 0.85, 0.05, 0.05, true));
    push(fore[1]!, lens('silhouette', 'orange', 0.5, 40, 2.2, 1.4, sub(py, 0.5), 0.7, 0.2, 0.05, true));
  }

  // 7. Canyon dolly, a second street if the first one was not Broadway's district.
  const canyon = streetRun(query, street ? 'little-tokyo-market' : 'historic-core') ?? streetRun(query, 'financial-megatowers');
  if (canyon) {
    beat++;
    for (const bow of bridge(query, knots[knots.length - 1]!.p, canyon[0]!, 300)) {
      push(bow, lens('silhouette', 'cyan', 0.22, 40, 4, 0.8, sub(py, 0.3), 0, 0, 0.02, false));
    }
    beat++;
    const aims = streetLook(canyon);
    canyon.forEach((p, i) => {
      push(p, lens('canyon', 'neon', 0.4, 35, 2.8, 2.2, aims[i] ?? aims[0]!, -1, 0, 0.04, true));
    });
  }

  // 8. Sea wall, wide, horizon on the lower third.
  const sea = seaRun(query);
  if (sea) {
    beat++;
    for (const bow of bridge(query, knots[knots.length - 1]!.p, sea.points[0]!, 220)) {
      push(bow, lens('canyon', 'harbor', 0.2, 28, 5.6, 0.78, sea.aims[0]!, 0, -1, 0.02, false));
    }
    beat++;
    sea.points.forEach((p, i) => {
      push(p, lens('seawall', 'harbor', 0.36, sea.focal[i] ?? 28, 5.6, 1.15, sea.aims[i] ?? sea.aims[0]!, 0, 0, 0.03, true, true));
    });
  }

  // 9. Amber ruin. The old pyramids stand in for a dead strip: dust colour, no signage.
  if (oldN) {
    beat++;
    const amberCam = place(query, oldN, 0.4, 1.35, Math.min(180, oldN.height * 0.22));
    for (const bow of bridge(query, knots[knots.length - 1]!.p, amberCam, 260)) {
      push(bow, lens('seawall', 'amber', 0.22, 40, 5.6, 0.8, sub(oldN, 0.4), 0, 0, 0.02, false));
    }
    beat++;
    push(amberCam, lens('amber', 'amber', 0.55, 58, 4, 1.5, sub(oldN, 0.45), -1, 0, 0.05, true));
    push(place(query, oldN, 0.85, 1.8, Math.min(280, oldN.height * 0.35)), lens('amber', 'amber', 0.5, 70, 2.8, 1.5, sub(oldN, 0.55), -1, 1, 0.05, true));
  }

  // 10. Return, slow, easing out over the towers.
  beat++;
  const back = place(query, mt, 2.0, 1.4, 380);
  for (const bow of bridge(query, knots[knots.length - 1]!.p, back, 420)) {
    push(bow, lens('return', 'orange', 0.22, 40, 5.6, 0.72, sub(mt, 0.4), 1, 1, 0.02, false));
  }
  beat++;
  push(back, lens('return', 'cyan', 0.34, 36, 5.6, 1.1, sub(mt, 0.5), 1, 1, 0.03, true));
  push(place(query, mt, 2.35, 1.7, 300), lens('return', 'cyan', 0.32, 28, 5.6, 1.3, sub(mt, 0.42), 1, 1, 0.03, true));

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
  hero: boolean,
  lockHeight = false,
): Omit<KnotData, 'beatIndex'> {
  return {
    focal, fStop, grade, gradeMix, anamorphic: 0, flare, pace, beat,
    xThird, yThird, subject: subjectPoint, hero, lockHeight,
  };
}

/** Far skyline stand. `dist` is from the landmark centre, not from the reserve. */
function wide(query: CityQuery, lm: Landmark, angle: number, dist: number, wantY: number): Vector3 {
  return distant(query, lm, angle, dist, wantY);
}

/**
 * Stand beyond a satellite so it falls on the left and the pyramid on the right.
 * With no satellite, stand on the downtown side of the pyramid.
 */
function pyramidFrame(query: CityQuery, py: Landmark, sat: Landmark | undefined, dist: number, side: number, y: number): Vector3 {
  const near = sat ?? py;
  const dx = py.x - near.x;
  const dz = py.z - near.z;
  const len = Math.hypot(dx, dz) || 1;
  const tx = len < 2 ? 1 : dx / len;
  const tz = len < 2 ? 0 : dz / len;
  const x = py.x - tx * dist - tz * side;
  const z = py.z - tz * dist + tx * side;
  const roof = roofAt(query, x, z, 24);
  return new Vector3(x, Math.max(y, roof + 28, query.groundHeight(x, z) + 40), z);
}

/** A point `dist` metres from a landmark centre, lifted over whatever roof is there. */
function distant(query: CityQuery, lm: Landmark, angle: number, dist: number, y: number): Vector3 {
  const x = lm.x + Math.cos(angle) * dist;
  const z = lm.z + Math.sin(angle) * dist;
  const roof = roofAt(query, x, z, 24);
  const gy = query.groundHeight(x, z);
  return new Vector3(x, Math.max(y, roof + 28, gy + 40), z);
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
  // Close enough that the near tower is a dark mass, wide enough that it is not the whole frame.
  const back = Math.max(1500, half * 7);
  const side = Math.max(1100, half * 5);
  const y0 = 200;
  const a = new Vector3(near.x - tx * back + sx * side, y0, near.z - tz * back + sz * side);
  const b = new Vector3(near.x - tx * (back * 0.82) + sx * (side * 0.7), y0 + 40, near.z - tz * (back * 0.82) + sz * (side * 0.7));
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
      if (raiseClear(query, x, y, z, 0.6) > y + 2.5) return null;
      const ahead = streetLookPoint(x, z, y, block.bx, block.bz);
      if (query.insideSolid(ahead.x, ahead.y, ahead.z, 1.2, true)) return null;
      points.push(new Vector3(x, y, z));
    }
    return points;
  } finally {
    query.failClosed = prevFail;
    query.syncLimit = prevLimit;
  }
}

function streetLookPoint(x: number, z: number, y: number, bx: number, bz: number): Vector3 {
  const len = Math.hypot(bx, bz) || 1;
  return new Vector3(x + (bx / len) * 18, y + 2, z + (bz / len) * 18);
}

function streetLook(points: Vector3[], reach = 86, lift = 7): Vector3[] {
  return points.map((p, i) => {
    const n = points[Math.min(points.length - 1, i + 1)]!;
    const dir = _dir.copy(n).sub(p);
    if (dir.lengthSq() < 1) dir.set(points[1]!.x - points[0]!.x, 0, points[1]!.z - points[0]!.z);
    dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
    dir.normalize();
    return new Vector3(p.x + dir.x * reach, p.y + lift, p.z + dir.z * reach);
  });
}

const _dir = new Vector3();

function seaRun(query: CityQuery): { points: Vector3[]; aims: Vector3[]; focal: number[] } | null {
  const plan = planApron(query.layout);
  const f = plan.frame;
  const points: Vector3[] = [];
  const aims: Vector3[] = [];
  const focal: number[] = [];
  // Seaward of the toe, looking up the treads so the risers read as a rhythm, not a grazing edge.
  const tread = [
    { across: 78, along: 48, y: 46, la: 22, ll: 96, ly: f.H * 0.72, mm: 35 },
    { across: 96, along: 18, y: 38, la: 20, ll: 78, ly: f.H * 0.6, mm: 32 },
  ];
  for (const s of tread) {
    const eye = framePoint(f, s.across, s.along);
    const look = framePoint(f, s.la, s.ll);
    points.push(new Vector3(eye.x, s.y, eye.z));
    aims.push(new Vector3(look.x, s.ly, look.z));
    focal.push(s.mm);
  }
  const aerial = coastCamera(query.layout, 'aerial');
  if (aerial) {
    points.push(lensEye(aerial));
    aims.push(lookFrom(aerial, 420));
    focal.push(48);
  }
  if (points.length < 2) return null;
  return { points, aims, focal };
}

function lensEye(pose: CoastPose): Vector3 {
  const y = pose.mode === 'fly' ? pose.y + 1.22 : pose.y;
  return new Vector3(pose.x, y, pose.z);
}

function lookFrom(pose: CoastPose, dist: number): Vector3 {
  const eye = lensEye(pose);
  const horiz = Math.cos(pose.pitch) * dist;
  return new Vector3(
    eye.x + Math.sin(pose.heading) * horiz,
    eye.y + Math.sin(pose.pitch) * dist,
    eye.z - Math.cos(pose.heading) * horiz,
  );
}

function harden(query: CityQuery, knots: Array<SplineKnot<KnotData>>): { knots: Array<SplineKnot<KnotData>>; fixes: number } {
  let fixes = 0;
  const lifted = knots.map((k) => {
    const y = k.data.lockHeight ? k.p.y : raiseClear(query, k.p.x, k.p.y, k.p.z, 4);
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
    hero: false,
    lockHeight: false,
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
  const end = stamps[stamps.length - 1]?.time ?? 0;
  for (const knot of spline.knotMarks()) {
    if (!knot.data.hero) continue;
    const time = timeAt(stamps, knot.distance);
    const last = beats[beats.length - 1];
    if (last && last.id === knot.data.beat) continue;
    beats.push({ id: knot.data.beat, name: BEAT_NAMES[knot.data.beat] ?? knot.data.beat, t0: time, t1: time });
  }
  for (let i = 0; i < beats.length; i++) {
    const next = beats[i + 1];
    beats[i]!.t1 = next ? next.t0 : end;
  }
  return beats.filter((b) => b.t1 - b.t0 > 0.15);
}

function timeAt(stamps: Array<{ d: number; time: number }>, distance: number): number {
  const d = Math.max(0, distance);
  for (let i = 1; i < stamps.length; i++) {
    const s = stamps[i]!;
    if (d <= s.d) {
      const p = stamps[i - 1]!;
      const span = s.d - p.d;
      const u = span > 1e-5 ? (d - p.d) / span : 0;
      return p.time + (s.time - p.time) * u;
    }
  }
  return stamps[stamps.length - 1]?.time ?? 0;
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
