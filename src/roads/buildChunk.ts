// One LOD0 chunk of roads from the street graph and the freeway polylines.
// The centreline is clipped to the chunk so a neighbour does not draw the same span.
// Surfaces may overhang the boundary; they belong to the chunk that owns the centre.
import type { CityLayout } from '../world/layout';
import type { Tier } from '../core/quality';
import { hash2i } from '../core/rng';
import { nearestWall, pastSeaWall } from '../districts/coastal-strip/profile';
import { edgeIdsNear, poseOn, streetGraph, type GraphEdge, type StreetGraph } from '../vehicles/streetGraph';
import { NO_STREET_GRAPH, freewayRoutes } from '../vehicles/trafficRegistry';
import {
  CURB_H, ROAD_LIFT, ROAD_LAMPS, freewayProfile, streetProfile,
  type RoadProfile,
} from './profile';

export const CELL = {
  dash: 0, stop: 1, bar: 2, arrow: 3, arrowL: 4, arrowR: 5, yellow: 6, hole: 7, drain: 8, joint: 9,
} as const;

export const KIND_ASPHALT = 0;
export const KIND_WALK = 1;
export const KIND_CONCRETE = 2;
export const KIND_HEAD = 3;
export const KIND_POLE = 4;

export interface Stamp {
  x: number; y: number; z: number;
  yaw: number;
  sx: number; sy: number; sz: number;
  cell: number;
  vertical: number;
}

export interface Puddle {
  x: number; y: number; z: number;
  yaw: number;
  sx: number; sz: number;
}

/** Head of a road street lamp. The mesh stays in the road solid; the light is a registry practical. */
export interface RoadLamp {
  x: number;
  y: number;
  z: number;
}

export interface RoadSolids {
  pos: Float32Array;
  nor: Float32Array;
  uv: Float32Array;
  kind: Float32Array;
  idx: Uint32Array;
}

export interface RoadChunk {
  solid: RoadSolids | null;
  stamps: Stamp[];
  signs: Stamp[];
  puddles: Puddle[];
  lamps: RoadLamp[];
  tris: number;
  bytes: number;
}

interface Budget {
  station: number;
  marks: boolean;
  arrows: boolean;
  puddles: boolean;
  gantries: boolean;
  text: boolean;
  bollard: number;
  lamp: boolean;
  barrier: boolean;
  manhole: boolean;
  dash: number;
  puddleStep: number;
}

interface P { x: number; y: number; z: number; u: number; v: number }
interface Station { x: number; z: number; y: number; t: number; along: number }

function budgetFor(tier: Tier): Budget {
  if (tier === 'low') {
    return { station: 32, marks: false, arrows: false, puddles: false, gantries: false, text: false, bollard: 36, lamp: true, barrier: true, manhole: false, dash: 18, puddleStep: 0 };
  }
  if (tier === 'medium') {
    return { station: 16, marks: true, arrows: false, puddles: false, gantries: true, text: true, bollard: 18, lamp: true, barrier: true, manhole: true, dash: 12, puddleStep: 0 };
  }
  if (tier === 'high') {
    return { station: 12, marks: true, arrows: true, puddles: true, gantries: true, text: true, bollard: 14, lamp: true, barrier: true, manhole: true, dash: 9, puddleStep: 28 };
  }
  return { station: 10, marks: true, arrows: true, puddles: true, gantries: true, text: true, bollard: 12, lamp: true, barrier: true, manhole: true, dash: 8, puddleStep: 18 };
}

class Acc {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  kind: number[] = [];
  idx: number[] = [];
  count = 0;

  quad(pts: P[], kind: number, wx: number, wy: number, wz: number): void {
    const a = pts[0]!, b = pts[1]!, c = pts[2]!, d = pts[3]!;
    const ax = b.x - a.x, ay = b.y - a.y, az = b.z - a.z;
    const bx = c.x - a.x, by = c.y - a.y, bz = c.z - a.z;
    const nx0 = ay * bz - az * by;
    const ny0 = az * bx - ax * bz;
    const nz0 = ax * by - ay * bx;
    const flip = nx0 * wx + ny0 * wy + nz0 * wz < 0;
    const order = flip ? [a, d, c, b] : [a, b, c, d];
    const p0 = order[0]!, p1 = order[1]!, p2 = order[2]!;
    let nx = (p1.y - p0.y) * (p2.z - p0.z) - (p1.z - p0.z) * (p2.y - p0.y);
    let ny = (p1.z - p0.z) * (p2.x - p0.x) - (p1.x - p0.x) * (p2.z - p0.z);
    let nz = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const base = this.count;
    for (const p of order) {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(nx, ny, nz);
      this.uv.push(p.u, p.v);
      this.kind.push(kind);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.count += 4;
  }

  pack(): RoadSolids | null {
    if (!this.count) return null;
    return {
      pos: new Float32Array(this.pos),
      nor: new Float32Array(this.nor),
      uv: new Float32Array(this.uv),
      kind: new Float32Array(this.kind),
      idx: new Uint32Array(this.idx),
    };
  }
}

function yawOf(fx: number, fz: number): number {
  return Math.atan2(fx, fz);
}

function rot(lx: number, ly: number, lz: number, yaw: number, cx: number, cy: number, cz: number): P {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  return { x: cx + lx * c + lz * s, y: cy + ly, z: cz - lx * s + lz * c, u: lx, v: ly };
}

function addBox(acc: Acc, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, yaw: number, kind: number): void {
  const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
  const p = (lx: number, ly: number, lz: number) => rot(lx, ly, lz, yaw, cx, cy, cz);
  const face = (a: P, b: P, c: P, d: P, wx: number, wy: number, wz: number) => acc.quad([a, b, c, d], kind, wx, wy, wz);
  const s = Math.sin(yaw), c = Math.cos(yaw);
  face(p(-hx, hy, -hz), p(hx, hy, -hz), p(hx, hy, hz), p(-hx, hy, hz), 0, 1, 0);
  face(p(-hx, -hy, hz), p(hx, -hy, hz), p(hx, -hy, -hz), p(-hx, -hy, -hz), 0, -1, 0);
  face(p(hx, -hy, -hz), p(hx, hy, -hz), p(hx, hy, hz), p(hx, -hy, hz), c, 0, -s);
  face(p(-hx, -hy, hz), p(-hx, hy, hz), p(-hx, hy, -hz), p(-hx, -hy, -hz), -c, 0, s);
  face(p(-hx, -hy, hz), p(hx, -hy, hz), p(hx, hy, hz), p(-hx, hy, hz), s, 0, c);
  face(p(hx, -hy, -hz), p(-hx, -hy, -hz), p(-hx, hy, -hz), p(hx, hy, -hz), -s, 0, -c);
}

function addPrism(acc: Acc, x: number, y: number, z: number, r: number, h: number, kind: number): void {
  const n = 6;
  const top: P[] = [];
  const bot: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const px = Math.cos(a) * r, pz = Math.sin(a) * r;
    top.push({ x: x + px, y: y + h, z: z + pz, u: px, v: h });
    bot.push({ x: x + px, y, z: z + pz, u: px, v: 0 });
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ox = (top[i]!.x + top[j]!.x) * 0.5 - x;
    const oz = (top[i]!.z + top[j]!.z) * 0.5 - z;
    acc.quad([bot[i]!, bot[j]!, top[j]!, top[i]!], kind, ox, 0, oz);
  }
  acc.quad([top[0]!, top[1]!, top[2]!, top[3]!], kind, 0, 1, 0);
  acc.quad([top[0]!, top[3]!, top[4]!, top[5]!], kind, 0, 1, 0);
}

function clipSegment(ax: number, az: number, bx: number, bz: number, x0: number, z0: number, x1: number, z1: number): [number, number] | null {
  const dx = bx - ax, dz = bz - az;
  let u0 = 0, u1 = 1;
  const p = [-dx, dx, -dz, dz];
  const q = [ax - x0, x1 - ax, az - z0, z1 - az];
  for (let i = 0; i < 4; i++) {
    const pi = p[i]!, qi = q[i]!;
    if (Math.abs(pi) < 1e-9) {
      if (qi < 0) return null;
    } else {
      const t = qi / pi;
      if (pi < 0) {
        if (t > u1) return null;
        if (t > u0) u0 = t;
      } else {
        if (t < u0) return null;
        if (t < u1) u1 = t;
      }
    }
  }
  return u0 <= u1 ? [u0, u1] : null;
}

function edgeStreet(layout: CityLayout, g: StreetGraph, e: GraphEdge): number {
  const a = g.nodes[e.a]!, b = g.nodes[e.b]!;
  return layout.districtAt((a.x + b.x) * 0.5, (a.z + b.z) * 0.5).grid.street;
}

function makeProfile(layout: CityLayout, g: StreetGraph, e: GraphEdge): RoadProfile {
  if (e.kind === 'freeway') {
    const p = freewayProfile(e.lane, e.laneGap > 0 ? e.laneGap : 3.6, Math.max(1, e.laneCount));
    // Trench decks already exist. Keep barriers and paint inside that concrete, not on the wall.
    if (e.deck < -0.5) {
      const deckHalf = e.lane + Math.max(0, e.laneCount - 1) * p.laneW + 2.4;
      return { ...p, carriageHalf: Math.max(p.laneW, deckHalf - 0.35) };
    }
    return p;
  }
  return streetProfile(edgeStreet(layout, g, e), e.lane, e.kind === 'canyon' ? 'canyon' : 'street');
}

function emitRibbon(acc: Acc, run: Station[], profile: RoadProfile, rx: number, rz: number): void {
  const freeway = profile.kind === 'freeway';
  const inner = profile.carriageHalf;
  const curbO = inner + (freeway ? 0 : profile.curbW);
  const outer = curbO + (freeway ? 0 : profile.sidewalk);
  for (let i = 0; i < run.length - 1; i++) {
    const a = run[i]!, b = run[i + 1]!;
    const dx = b.x - a.x, dz = b.z - a.z;
    const span = Math.hypot(dx, dz) || 1;
    const fx = dx / span, fz = dz / span;
    const slope = (b.y - a.y) / span;
    let nx = -fx * slope, ny = 1, nz = -fz * slope;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const side = (st: Station, lat: number, lift: number): P => ({
      x: st.x + rx * lat, y: st.y + lift, z: st.z + rz * lat, u: st.along, v: lat,
    });
    const yR = ROAD_LIFT;
    const yW = ROAD_LIFT + CURB_H;
    const band = (lat0: number, lat1: number, lift: number, kind: number) => {
      acc.quad([
        side(a, lat0, lift), side(a, lat1, lift), side(b, lat1, lift), side(b, lat0, lift),
      ], kind, nx, ny, nz);
    };
    band(-inner, inner, yR, KIND_ASPHALT);
    if (!freeway && profile.sidewalk > 0.2) {
      band(-outer, -curbO, yW, KIND_WALK);
      band(curbO, outer, yW, KIND_WALK);
      band(-curbO, -inner, yW, KIND_CONCRETE);
      band(inner, curbO, yW, KIND_CONCRETE);
      acc.quad([
        side(a, -inner, yW), side(a, -inner, yR), side(b, -inner, yR), side(b, -inner, yW),
      ], KIND_CONCRETE, rx, 0, rz);
      acc.quad([
        side(a, inner, yR), side(a, inner, yW), side(b, inner, yW), side(b, inner, yR),
      ], KIND_CONCRETE, -rx, 0, -rz);
    }
  }
}

function addBarrierRun(acc: Acc, run: Station[], profile: RoadProfile, rx: number, rz: number, fx: number, fz: number): void {
  const yaw = yawOf(fx, fz);
  const lat = profile.carriageHalf - 0.35;
  for (let i = 0; i < run.length - 1; i++) {
    const a = run[i]!, b = run[i + 1]!;
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    if (span < 0.8) continue;
    const mx = (a.x + b.x) * 0.5, mz = (a.z + b.z) * 0.5;
    const y = (a.y + b.y) * 0.5 + ROAD_LIFT + 0.4;
    for (const s of [-1, 1]) {
      addBox(acc, mx + rx * s * lat, y, mz + rz * s * lat, 0.46, 0.81, span + 0.05, yaw, KIND_CONCRETE);
    }
  }
}

function addLamp(acc: Acc, lamps: RoadLamp[], x: number, y: number, z: number, yaw: number, inward: number): void {
  addBox(acc, x, y + 3.75, z, 0.16, 7.5, 0.16, yaw, KIND_POLE);
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const ax = x + c * inward * 0.8;
  const az = z - s * inward * 0.8;
  addBox(acc, ax, y + 7.35, az, 1.6, 0.1, 0.12, yaw, KIND_POLE);
  const hx = x + c * inward * 1.35;
  const hy = y + 7.22;
  const hz = z - s * inward * 1.35;
  addBox(acc, hx, hy, hz, 0.55, 0.16, 0.28, yaw, KIND_HEAD);
  lamps.push({ x: hx, y: hy, z: hz });
}

interface MarkLine { lat: number; cell: number; step: number; len: number; width: number; solid: boolean }

function lineMarks(profile: RoadProfile): MarkLine[] {
  const pos = profile.lanes.filter((l) => l > 0.05).sort((a, b) => a - b);
  const out: MarkLine[] = [];
  if (!pos.length) return out;
  const push = (lat: number, cell: number, step: number, len: number, width: number, solid: boolean) => {
    out.push({ lat, cell, step, len, width, solid });
    if (Math.abs(lat) > 0.05) out.push({ lat: -lat, cell, step, len, width, solid });
  };
  if (profile.kind === 'freeway') {
    const inner = pos[0]! - profile.laneW * 0.5;
    push(inner, CELL.yellow, 0, 0, 0.42, true);
  } else if (!profile.alley) {
    out.push({ lat: 0, cell: CELL.yellow, step: 0, len: 0, width: 0.48, solid: true });
  }
  for (let i = 0; i < pos.length - 1; i++) {
    push((pos[i]! + pos[i + 1]!) * 0.5, CELL.dash, 12, 3, 0.15, false);
  }
  const edge = pos[pos.length - 1]! + profile.laneW * 0.5;
  if (edge < profile.carriageHalf - 0.15) push(edge, CELL.dash, 0, 0, 0.15, true);
  return out;
}

export function buildRoadChunk(layout: CityLayout, x0: number, z0: number, size: number, tier: Tier): RoadChunk | null {
  const budget = budgetFor(tier);
  const g = streetGraph(layout);
  const acc = new Acc();
  const stamps: Stamp[] = [];
  const signs: Stamp[] = [];
  const puddles: Puddle[] = [];
  const lamps: RoadLamp[] = [];
  const coast = nearestWall(layout, x0 + size * 0.5, z0 + size * 0.5).dist < 1800 + size;
  const x1 = x0 + size - 0.001;
  const z1 = z0 + size - 0.001;

  const blocked = (x: number, z: number): boolean => {
    if (!layout.inBounds(x, z) || layout.isOcean(x, z)) return true;
    if (NO_STREET_GRAPH.has(layout.districtAt(x, z).id)) return true;
    if (layout.inLandmark(x, z, 1.5)) return true;
    if (coast && pastSeaWall(layout, x, z)) return true;
    return false;
  };

  const seenNode = new Set<number>();
  const ids = edgeIdsNear(g, x0 + size * 0.5, z0 + size * 0.5, size * 0.75 + 240);
  for (const id of ids) {
    const e = g.edges[id];
    if (!e) continue;
    paveEdge(layout, g, e, acc, stamps, signs, puddles, lamps, budget, x0, z0, x1, z1, blocked, seenNode);
  }
  paveGradeFreeways(layout, acc, stamps, signs, puddles, lamps, budget, x0, z0, x1, z1, blocked);

  const solid = acc.pack();
  if (!solid && !stamps.length && !signs.length && !puddles.length) return null;
  const tris = (solid ? solid.idx.length / 3 : 0) + stamps.length * 2 + signs.length * 2 + puddles.length * 2;
  const bytes = (solid ? solid.pos.byteLength + solid.nor.byteLength + solid.uv.byteLength + solid.kind.byteLength + solid.idx.byteLength : 0)
    + stamps.length * 64 + signs.length * 64 + puddles.length * 64;
  return { solid, stamps, signs, puddles, lamps, tris, bytes };
}

function paveEdge(
  layout: CityLayout,
  g: StreetGraph,
  e: GraphEdge,
  acc: Acc,
  stamps: Stamp[],
  signs: Stamp[],
  puddles: Puddle[],
  lamps: RoadLamp[],
  budget: Budget,
  x0: number, z0: number, x1: number, z1: number,
  blocked: (x: number, z: number) => boolean,
  seenNode: Set<number>,
): void {
  const a = g.nodes[e.a]!, b = g.nodes[e.b]!;
  const clip = clipSegment(a.x, a.z, b.x, b.z, x0, z0, x1, z1);
  if (!clip) return;
  const profile = makeProfile(layout, g, e);
  const crossA = crossHalf(g, layout, e, e.a);
  const crossB = crossHalf(g, layout, e, e.b);
  let t0 = Math.max(clip[0], crossA / e.length);
  let t1 = Math.min(clip[1], 1 - crossB / e.length);
  if (t1 - t0 < 0.004) {
    maybeIntersection(layout, g, e.a, acc, stamps, budget, x0, z0, x1, z1, blocked, seenNode);
    maybeIntersection(layout, g, e.b, acc, stamps, budget, x0, z0, x1, z1, blocked, seenNode);
    return;
  }
  const rx = e.fz, rz = -e.fx;
  const runs = collectRuns(a.x, a.z, b.x, b.z, t0, t1, e.length, budget.station, layout, blocked, e.kind === 'freeway' ? e.deck : 0);
  for (const run of runs) {
    if (e.kind !== 'freeway') emitRibbon(acc, run, profile, rx, rz);
    else if (budget.barrier) addBarrierRun(acc, run, profile, rx, rz, e.fx, e.fz);
    dressRun(e, profile, run, rx, rz, budget, stamps, signs, puddles, lamps, acc);
  }
  if (e.kind !== 'freeway') {
    approachMarks(layout, g, e, profile, crossA, -1, budget, stamps, x0, z0, x1, z1);
    approachMarks(layout, g, e, profile, crossB, 1, budget, stamps, x0, z0, x1, z1);
  }
  maybeIntersection(layout, g, e.a, acc, stamps, budget, x0, z0, x1, z1, blocked, seenNode);
  maybeIntersection(layout, g, e.b, acc, stamps, budget, x0, z0, x1, z1, blocked, seenNode);
}

function collectRuns(
  ax: number, az: number, bx: number, bz: number,
  t0: number, t1: number, length: number, step: number,
  layout: CityLayout, blocked: (x: number, z: number) => boolean,
  yOff: number,
): Station[][] {
  const span = Math.max(0, (t1 - t0) * length);
  const n = Math.max(1, Math.ceil(span / step));
  const runs: Station[][] = [];
  let cur: Station[] = [];
  const flush = () => {
    if (cur.length >= 2) runs.push(cur);
    cur = [];
  };
  for (let i = 0; i <= n; i++) {
    const t = t0 + (t1 - t0) * (i / n);
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    if (blocked(x, z)) { flush(); continue; }
    cur.push({ x, z, y: layout.heightAt(x, z) + yOff, t, along: t * length });
  }
  flush();
  return runs;
}

function sampleAt(run: Station[], along: number): Station | null {
  for (let i = 0; i < run.length - 1; i++) {
    const a = run[i]!, b = run[i + 1]!;
    const lo = Math.min(a.along, b.along);
    const hi = Math.max(a.along, b.along);
    if (along < lo - 1e-3 || along > hi + 1e-3) continue;
    const span = b.along - a.along;
    const u = Math.abs(span) < 1e-4 ? 0 : Math.max(0, Math.min(1, (along - a.along) / span));
    return {
      x: a.x + (b.x - a.x) * u,
      z: a.z + (b.z - a.z) * u,
      y: a.y + (b.y - a.y) * u,
      t: a.t + (b.t - a.t) * u,
      along,
    };
  }
  return null;
}

function placeEvery(run: Station[], step: number, phase: number, fn: (st: Station, along: number) => void): void {
  if (step <= 0 || run.length < 2) return;
  const a0 = run[0]!.along;
  const a1 = run[run.length - 1]!.along;
  let at = Math.ceil((a0 - phase) / step) * step + phase;
  if (at < a0 - 0.01) at += step;
  for (let n = 0; at <= a1 + 0.01 && n < 80; n++) {
    const st = sampleAt(run, at);
    if (st) fn(st, at);
    at += step;
  }
}

const STAMP_CAP = 2400;

function pushStamp(stamps: Stamp[], s: Stamp): void {
  if (stamps.length < STAMP_CAP) stamps.push(s);
}

function dressRun(
  e: GraphEdge,
  profile: RoadProfile,
  run: Station[],
  rx: number, rz: number,
  budget: Budget,
  stamps: Stamp[],
  signs: Stamp[],
  puddles: Puddle[],
  lamps: RoadLamp[],
  acc: Acc,
): void {
  const yaw = yawOf(e.fx, e.fz);
  const lines = budget.marks ? lineMarks(profile) : [];
  const lampOk = budget.lamp && e.kind !== 'freeway' && ROAD_LAMPS.has(e.district);
  const markY = (st: Station) => st.y + ROAD_LIFT + 0.005;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    if (line.solid) {
      for (let i = 0; i < run.length - 1; i++) {
        const a = run[i]!, b = run[i + 1]!;
        const span = Math.hypot(b.x - a.x, b.z - a.z);
        if (span < 0.4) continue;
        pushStamp(stamps, {
          x: (a.x + b.x) * 0.5 + rx * line.lat,
          y: markY(a) * 0.5 + markY(b) * 0.5,
          z: (a.z + b.z) * 0.5 + rz * line.lat,
          yaw, sx: line.width, sy: 1, sz: span + 0.04, cell: line.cell, vertical: 0,
        });
      }
      continue;
    }
    const phase = (hash2i(e.index, li, 5) % Math.round(line.step * 10)) / 10;
    placeEvery(run, line.step, phase, (st) => {
      pushStamp(stamps, {
        x: st.x + rx * line.lat, y: markY(st), z: st.z + rz * line.lat,
        yaw, sx: line.width, sy: 1, sz: line.len, cell: line.cell, vertical: 0,
      });
    });
  }
  if (budget.manhole && e.kind !== 'freeway') {
    placeEvery(run, 56, 14, (st, along) => {
      const h = hash2i(e.index, Math.floor(along), 3);
      const lat = (h & 1 ? 1 : -1) * Math.min(profile.carriageHalf - 0.9, Math.abs(profile.driving) * 0.45 + 0.6);
      pushStamp(stamps, {
        x: st.x + rx * lat, y: markY(st), z: st.z + rz * lat,
        yaw, sx: 0.8, sy: 1, sz: 0.8, cell: CELL.hole, vertical: 0,
      });
    });
    placeEvery(run, 24, 6, (st, along) => {
      const side = hash2i(e.index, Math.floor(along), 8) & 1 ? 1 : -1;
      const lat = side * (profile.carriageHalf - 0.22);
      pushStamp(stamps, {
        x: st.x + rx * lat, y: markY(st), z: st.z + rz * lat,
        yaw, sx: 0.9, sy: 1, sz: 0.42, cell: CELL.drain, vertical: 0,
      });
    });
  }
  if (budget.puddles && budget.puddleStep > 0) {
    placeEvery(run, budget.puddleStep, 9, (st, along) => {
      if (puddles.length >= 64) return;
      const h = hash2i(e.index, Math.floor(along), 4);
      const lat = ((h % 100) / 100 - 0.5) * profile.carriageHalf * 1.3;
      puddles.push({
        x: st.x + rx * lat, y: st.y + ROAD_LIFT + 0.002, z: st.z + rz * lat,
        yaw, sx: 1.8 + (h % 5) * 0.35, sz: 1.2 + (h % 4) * 0.25,
      });
    });
  }
  if (e.kind === 'freeway' && budget.marks) {
    placeEvery(run, 24, 0, (st) => {
      pushStamp(stamps, {
        x: st.x, y: markY(st), z: st.z, yaw,
        sx: Math.max(1, profile.carriageHalf * 2 - 0.8), sy: 1, sz: 0.18,
        cell: CELL.joint, vertical: 0,
      });
    });
  }
  if (lampOk) {
    const side = profile.carriageHalf + profile.curbW + Math.min(0.7, profile.sidewalk * 0.4);
    placeEvery(run, 32, 10, (st) => {
      const y = st.y + ROAD_LIFT + CURB_H;
      addLamp(acc, lamps, st.x + rx * side, y, st.z + rz * side, yaw, -1);
      addLamp(acc, lamps, st.x - rx * side, y, st.z - rz * side, yaw, 1);
    });
  }
  if (e.kind !== 'freeway' && e.district !== 'historic-core' && profile.sidewalk > 0.4) {
    const lat = profile.carriageHalf + profile.curbW * 0.35;
    const step = Math.max(8, budget.bollard);
    placeEvery(run, step, 3, (st) => {
      const y = st.y + ROAD_LIFT + CURB_H;
      addPrism(acc, st.x + rx * lat, y, st.z + rz * lat, 0.11, 0.8, KIND_CONCRETE);
      addPrism(acc, st.x - rx * lat, y, st.z - rz * lat, 0.11, 0.8, KIND_CONCRETE);
    });
  }
  if (e.kind === 'freeway' && budget.gantries) {
    const drop = (st: Station, salt: number) => {
      addGantry(acc, signs, st, profile, rx, rz, e.fx, e.fz, budget.text, salt);
    };
    if (e.length > 160) {
      placeEvery(run, 240, 36, (st, along) => drop(st, hash2i(e.index, Math.floor(along), 2)));
    } else if (e.index % 4 === 0) {
      drop(run[Math.floor(run.length / 2)]!, hash2i(e.index, 1, 2));
    }
  }
}

function addGantry(
  acc: Acc, signs: Stamp[], st: Station, profile: RoadProfile,
  rx: number, rz: number, fx: number, fz: number, text: boolean, salt: number,
): void {
  const yaw = yawOf(fx, fz);
  const half = profile.carriageHalf - 0.2;
  const y0 = st.y + (profile.kind === 'freeway' ? 0 : 0) + ROAD_LIFT;
  const post = 6.6;
  for (const s of [-1, 1]) {
    addBox(acc, st.x + rx * s * half, y0 + post * 0.5, st.z + rz * s * half, 0.42, post, 0.42, yaw, KIND_CONCRETE);
  }
  addBox(acc, st.x, y0 + post - 0.15, st.z, half * 2, 0.38, 0.55, yaw, KIND_CONCRETE);
  addBox(acc, st.x, y0 + post - 1.15, st.z, Math.min(8.5, half * 1.4), 1.35, 0.16, yaw, KIND_CONCRETE);
  if (!text || signs.length > 80) return;
  const phrase = salt % 6;
  signs.push({
    x: st.x + fx * 0.12, y: y0 + post - 1.15, z: st.z + fz * 0.12,
    yaw, sx: Math.min(7.2, half * 1.2), sy: 1.15, sz: 1, cell: phrase, vertical: 1,
  });
  signs.push({
    x: st.x - fx * 0.12, y: y0 + post - 1.15, z: st.z - fz * 0.12,
    yaw: yaw + Math.PI, sx: Math.min(7.2, half * 1.2), sy: 1.15, sz: 1, cell: (phrase + 1) % 6, vertical: 1,
  });
}

function approachMarks(
  layout: CityLayout, g: StreetGraph, e: GraphEdge, profile: RoadProfile, cross: number, end: -1 | 1,
  budget: Budget, stamps: Stamp[], x0: number, z0: number, x1: number, z1: number,
): void {
  if (!budget.marks || cross < 1 || e.kind === 'freeway') return;
  const dir: 1 | -1 = end < 0 ? -1 : 1;
  const dist = cross + 1.35;
  if (dist >= e.length * 0.45) return;
  const inside = (x: number, z: number) => x >= x0 && z >= z0 && x < x1 && z < z1;
  const t = end < 0 ? dist / e.length : 1 - dist / e.length;
  const pose = poseOn(g, e.index, t, dir, profile.carriageHalf * 0.5);
  if (!inside(pose.x, pose.z)) return;
  const y = layout.heightAt(pose.x, pose.z) + ROAD_LIFT + 0.005;
  pushStamp(stamps, {
    x: pose.x, y, z: pose.z,
    yaw: yawOf(pose.fx, pose.fz),
    sx: Math.max(2.2, profile.carriageHalf - 0.35), sy: 1, sz: 0.4,
    cell: CELL.stop, vertical: 0,
  });
  if (!budget.arrows) return;
  const lanes = profile.lanes.filter((l) => l > 0.2).sort((a2, b2) => a2 - b2);
  const tA = end < 0 ? (cross + 6.2) / e.length : 1 - (cross + 6.2) / e.length;
  if (tA <= 0.02 || tA >= 0.98) return;
  lanes.forEach((lat, i) => {
    const cell = lanes.length < 2 ? CELL.arrow : i === 0 ? CELL.arrowL : i === lanes.length - 1 ? CELL.arrowR : CELL.arrow;
    const p = poseOn(g, e.index, tA, dir, lat);
    if (!inside(p.x, p.z)) return;
    pushStamp(stamps, {
      x: p.x, y: layout.heightAt(p.x, p.z) + ROAD_LIFT + 0.005, z: p.z,
      yaw: yawOf(p.fx, p.fz),
      sx: 1.15, sy: 1, sz: 3.2, cell, vertical: 0,
    });
  });
}

function crossHalf(g: StreetGraph, layout: CityLayout, e: GraphEdge, node: number): number {
  if (!g.signal[node]) return 0;
  let half = 0;
  for (const link of g.links[node] ?? []) {
    const o = g.edges[link.edge];
    if (!o || o.kind === 'freeway' || o.axis === e.axis) continue;
    const street = edgeStreet(layout, g, o);
    half = Math.max(half, street * 0.5);
  }
  return half;
}

function maybeIntersection(
  layout: CityLayout, g: StreetGraph, node: number, acc: Acc, stamps: Stamp[], budget: Budget,
  x0: number, z0: number, x1: number, z1: number,
  blocked: (x: number, z: number) => boolean,
  seen: Set<number>,
): void {
  if (seen.has(node) || !g.signal[node]) return;
  const n = g.nodes[node];
  if (!n || n.x < x0 || n.z < z0 || n.x >= x1 || n.z >= z1) return;
  if (blocked(n.x, n.z)) return;
  let e0: GraphEdge | null = null;
  let e1: GraphEdge | null = null;
  for (const link of g.links[node] ?? []) {
    const e = g.edges[link.edge];
    if (!e || e.kind === 'freeway') continue;
    if (e.axis === 0 && !e0) e0 = e;
    if (e.axis === 1 && !e1) e1 = e;
  }
  if (!e0 || !e1) return;
  const p0 = makeProfile(layout, g, e0);
  const p1 = makeProfile(layout, g, e1);
  const r0x = e0.fz, r0z = -e0.fx;
  const r1x = e1.fz, r1z = -e1.fx;
  const dot = Math.abs(r0x * r1x + r0z * r1z);
  if (dot > 0.75) return;
  seen.add(node);
  const half0 = p0.street * 0.5;
  const half1 = p1.street * 0.5;
  const curb0 = half0 - p0.sidewalk;
  const curb1 = half1 - p1.sidewalk;
  const yR = ROAD_LIFT;
  const yW = ROAD_LIFT + CURB_H;
  const at = (u: number, v: number, lift: number): P => {
    const x = n.x + r0x * u + r1x * v;
    const z = n.z + r0z * u + r1z * v;
    return { x, y: layout.heightAt(x, z) + lift, z, u, v };
  };
  const quad = (u0: number, v0: number, u1: number, v1: number, lift: number, kind: number) => {
    acc.quad([at(u0, v0, lift), at(u1, v0, lift), at(u1, v1, lift), at(u0, v1, lift)], kind, 0, 1, 0);
  };
  quad(-curb0, -curb1, curb0, curb1, yR, KIND_ASPHALT);
  quad(curb0, -curb1, half0, curb1, yR, KIND_ASPHALT);
  quad(-half0, -curb1, -curb0, curb1, yR, KIND_ASPHALT);
  quad(-curb0, curb1, curb0, half1, yR, KIND_ASPHALT);
  quad(-curb0, -half1, curb0, -curb1, yR, KIND_ASPHALT);
  for (const su of [-1, 1]) {
    for (const sv of [-1, 1]) {
      const u0 = su > 0 ? curb0 : -half0;
      const u1 = su > 0 ? half0 : -curb0;
      const v0 = sv > 0 ? curb1 : -half1;
      const v1 = sv > 0 ? half1 : -curb1;
      quad(u0, v0, u1, v1, yW, KIND_WALK);
      const cu = su * curb0;
      const cv = sv * curb1;
      acc.quad([
        at(cu, sv > 0 ? cv : v0, yW), at(cu, sv > 0 ? cv : v0, yR),
        at(cu, sv > 0 ? v1 : cv, yR), at(cu, sv > 0 ? v1 : cv, yW),
      ], KIND_CONCRETE, -su * r0x, 0, -su * r0z);
      acc.quad([
        at(su > 0 ? u0 : u1, cv, yW), at(su > 0 ? u0 : u1, cv, yR),
        at(su > 0 ? u1 : u0, cv, yR), at(su > 0 ? u1 : u0, cv, yW),
      ], KIND_CONCRETE, -sv * r1x, 0, -sv * r1z);
    }
  }
  if (!budget.marks) return;
  const bars = budget.arrows ? 6 : 4;
  for (const sv of [-1, 1]) {
    const span = Math.max(2.2, curb0 * 2 - 0.5);
    for (let i = 0; i < bars; i++) {
      const v = sv * (curb1 - 0.55 - i * 0.72);
      if (Math.abs(v) < 0.4) continue;
      const p = at(0, v, yR + 0.006);
      pushStamp(stamps, {
        x: p.x, y: p.y, z: p.z, yaw: yawOf(e0.fx, e0.fz),
        sx: span, sy: 1, sz: 0.48, cell: CELL.bar, vertical: 0,
      });
    }
  }
  for (const su of [-1, 1]) {
    const span = Math.max(2.2, curb1 * 2 - 0.5);
    for (let i = 0; i < bars; i++) {
      const u = su * (curb0 - 0.55 - i * 0.72);
      if (Math.abs(u) < 0.4) continue;
      const p = at(u, 0, yR + 0.006);
      pushStamp(stamps, {
        x: p.x, y: p.y, z: p.z, yaw: yawOf(e1.fx, e1.fz),
        sx: span, sy: 1, sz: 0.48, cell: CELL.bar, vertical: 0,
      });
    }
  }
}

function paveGradeFreeways(
  layout: CityLayout, acc: Acc, stamps: Stamp[], signs: Stamp[], puddles: Puddle[], lamps: RoadLamp[], budget: Budget,
  x0: number, z0: number, x1: number, z1: number,
  blocked: (x: number, z: number) => boolean,
): void {
  for (const spec of freewayRoutes()) {
    if (spec.trench || spec.vehicles) continue;
    const line = layout.freeways.find((f) => f.id === spec.id);
    if (!line) continue;
    const bb = line.bbox;
    if (bb[2] < x0 - 40 || bb[0] > x1 + 40 || bb[3] < z0 - 40 || bb[1] > z1 + 40) continue;
    const profile = freewayProfile(spec.inset, spec.spacing, spec.lanes);
    for (let i = 0; i < line.pts.length - 1; i++) {
      const ax = line.pts[i]![0], az = line.pts[i]![1];
      const bx = line.pts[i + 1]![0], bz = line.pts[i + 1]![1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 2) continue;
      const clip = clipSegment(ax, az, bx, bz, x0, z0, x1, z1);
      if (!clip) continue;
      const fx = (bx - ax) / len, fz = (bz - az) / len;
      const rx = fz, rz = -fx;
      const runs = collectRuns(ax, az, bx, bz, clip[0], clip[1], len, budget.station, layout, blocked, 0.02);
      const fake: GraphEdge = {
        index: 200000 + i + line.pts.length * 17, a: 0, b: 0, axis: 0, length: len, fx, fz,
        lane: spec.inset, kind: 'freeway', district: '', deck: 0, density: spec.density,
        route: spec.id, laneCount: spec.lanes, laneGap: spec.spacing,
      };
      for (const run of runs) {
        emitRibbon(acc, run, profile, rx, rz);
        if (budget.barrier) addBarrierRun(acc, run, profile, rx, rz, fx, fz);
        const yaw = yawOf(fx, fz);
        for (let k = 0; k < run.length - 1; k++) {
          const a = run[k]!, b = run[k + 1]!;
          const span = Math.hypot(b.x - a.x, b.z - a.z);
          const mx = (a.x + b.x) * 0.5, mz = (a.z + b.z) * 0.5;
          const y = (a.y + b.y) * 0.5 + ROAD_LIFT + 0.45;
          addBox(acc, mx, y, mz, 0.5, 0.7, Math.max(0.8, span), yaw, KIND_CONCRETE);
        }
        dressRun(fake, profile, run, rx, rz, budget, stamps, signs, puddles, lamps, acc);
      }
    }
  }
}

export function chunkDraws(tier: Tier, chunk: RoadChunk): number {
  let n = chunk.solid ? 1 : 0;
  if (chunk.stamps.length) n++;
  if (chunk.signs.length) n++;
  if (chunk.puddles.length && (tier === 'high' || tier === 'ultra')) n++;
  return n;
}
