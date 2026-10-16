// Mouths sit on the flame, the flare, the grate, the pot, and the bumper.
// Positions come from the same planners that built those meshes.
import type { CityLayout } from '../../world/layout';
import { hash2i } from '../../core/rng';
import { carriageNear } from '../../roads/streetSpan';
import { marketSpots, marketSteamPoints } from '../../districts/little-tokyo-market/spots';
import { flamesNear } from '../../districts/_shared/refinery/flames';
import { edgeIdsNear, poseOn, streetGraph } from '../../vehicles/streetGraph';
import { readLaunchPlume } from './bridge';
import { KIND, type Mouth } from './types';
import type { Tier } from '../../core/quality';

export interface Tailpipe {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  fx: number;
  fz: number;
  heavy: number;
}

const STACK_KEEP: Record<Tier, number> = { low: 2, medium: 3, high: 4, ultra: 5 };
const CURB_KEEP: Record<Tier, number> = { low: 4, medium: 7, high: 10, ultra: 12 };

let heroes: Mouth[] | null = null;

function mouth(partial: Omit<Mouth, 'vx' | 'vz' | 'fx' | 'fz'> & Partial<Pick<Mouth, 'vx' | 'vz' | 'fx' | 'fz'>>): Mouth {
  return { vx: 0, vz: 0, fx: 0, fz: 0, ...partial };
}

const GRATE_KEEP: Record<Tier, number> = { low: 4, medium: 6, high: 8, ultra: 10 };
const VENT_KEEP: Record<Tier, number> = { low: 3, medium: 4, high: 5, ultra: 6 };

/** Nearest mouths, equal weight, so each grate keeps its own column. */
function nearestSources(list: readonly Mouth[], x: number, z: number, keep: number, kind: number): Mouth[] {
  const hit = list.filter((m) => m.kind === kind);
  hit.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  const out: Mouth[] = [];
  for (let i = 0; i < hit.length && i < keep; i++) out.push({ ...hit[i]!, weight: 1 });
  return out;
}

function heroMouths(layout: CityLayout): Mouth[] {
  if (heroes) return heroes;
  const out: Mouth[] = [];
  const spots = marketSpots(layout);
  const addLane = (x: number, z: number, heading: number, _weight: number) => {
    const lane = carriageNear(layout, x, z, 'little-tokyo-market');
    const ox = lane?.x ?? x;
    const oz = lane?.z ?? z;
    const fx = lane?.fx ?? Math.sin(heading);
    const fz = lane?.fz ?? -Math.cos(heading);
    const y = (lane?.y ?? layout.heightAt(ox, oz)) + 0.22;
    const rx = fz;
    const rz = -fx;
    const vents: Array<[number, number]> = [[10, 3.1], [17, -3.2], [25, 2.6]];
    for (const [d, side] of vents) {
      out.push(mouth({
        x: ox + fx * d + rx * side,
        y, z: oz + fz * d + rz * side,
        kind: KIND.grate, weight: 1, life: 2.2,
        size0: 0.18, size1: 0.42, heat: 0.03, radius: 0.1,
        rise: 0.95, spread: 0.02, floor: y - 0.02, wind: 0.03,
        turb: 0.08, aspect: 1, alpha: 0.46,
      }));
    }
  };
  if (spots.noodle) addLane(spots.noodle.street.x, spots.noodle.street.z, spots.noodle.street.heading, 4);
  if (spots.bibi) addLane(spots.bibi.street.x, spots.bibi.street.z, spots.bibi.street.heading, 2.2);
  const cooks = [spots.noodle?.cook, spots.bibi?.cook].filter((c): c is NonNullable<typeof c> => !!c);
  for (const s of marketSteamPoints(layout)) {
    let near = false;
    for (const c of cooks) {
      if (Math.hypot(s.x - c.x, s.z - c.z) < 2.4 && s.y - c.y > 0.6 && s.y - c.y < 2.2) near = true;
    }
    const ground = layout.heightAt(s.x, s.z);
    const dy = s.y - ground;
    if (near) {
      out.push(mouth({
        x: s.x, y: s.y, z: s.z,         kind: KIND.stall, weight: 5, life: 1.35,
        size0: 0.028, size1: 0.055, heat: 0.08, radius: 0.02,
        rise: 0.72, spread: 0.008, floor: s.y - 0.02, wind: 0.01,
        turb: 0.04, aspect: 1, alpha: 0.62,
      }));
    } else if (dy < 0.55) {
      out.push(mouth({
        x: s.x, y: s.y, z: s.z, kind: KIND.grate, weight: 1, life: 2.2,
        size0: 0.14, size1: 0.34, heat: 0.02, radius: 0.08,
        rise: 0.9, spread: 0.02, floor: ground, wind: 0.04,
        turb: 0.08, aspect: 1, alpha: 0.4,
      }));
    } else if (dy < 2.6) {
      out.push(mouth({
        x: s.x, y: s.y, z: s.z, kind: KIND.vent, weight: 1, life: 2.3,
        size0: 0.16, size1: 0.38, heat: 0.04, radius: 0.08,
        rise: 0.95, spread: 0.02, floor: ground, wind: 0.05,
        turb: 0.1, aspect: 1, alpha: 0.42,
      }));
    }
  }
  heroes = out;
  return out;
}

function curbMouths(layout: CityLayout, x: number, z: number, tier: Tier): Mouth[] {
  const g = streetGraph(layout);
  const ids = edgeIdsNear(g, x, z, 70, 'street');
  const out: Mouth[] = [];
  const keep = CURB_KEEP[tier];
  for (const id of ids) {
    const e = g.edges[id];
    if (!e || e.kind === 'freeway') continue;
    const h = hash2i(id, 0x5e, 11);
    if (h % 5 !== 0) continue;
    const t = 0.18 + (h % 60) / 100;
    const side = (e.lane * 0.55) * ((h & 1) ? 1 : -1);
    const pose = poseOn(g, id, t, 1, side);
    const y = layout.heightAt(pose.x, pose.z);
    out.push(mouth({
      x: pose.x, y: y + 0.22, z: pose.z, kind: KIND.grate, weight: 1, life: 2.2,
      size0: 0.14, size1: 0.34, heat: 0.02, radius: 0.08,
      rise: 0.9, spread: 0.02, floor: y, wind: 0.04,
      turb: 0.08, aspect: 1, alpha: 0.4,
    }));
    if (out.length >= keep) break;
  }
  return out;
}

export function gatherMouths(
  layout: CityLayout,
  x: number,
  y: number,
  z: number,
  tier: Tier,
  tails: readonly Tailpipe[],
): Mouth[] {
  const out: Mouth[] = [];
  const plume = readLaunchPlume();
  if (plume.live && plume.env > 0.04) {
    const base = plume.base;
    out.push(mouth({
      x: plume.x, y: base + 4, z: plume.z, kind: KIND.launch, weight: 1, life: 6.4,
      size0: 8, size1: 18, heat: 0.55, radius: 4,
      rise: 2, spread: 0.2, floor: base, wind: 0.02,
      turb: 1.1, aspect: 1, alpha: 0.62,
    }));
    out.push(mouth({
      x: plume.x, y: base + 2, z: plume.z, kind: KIND.ground, weight: 1, life: 4.2,
      size0: 5, size1: 12, heat: 0.08, radius: 6,
      rise: 1.6, spread: 0.8, floor: base, wind: 0.08,
      turb: 0.6, aspect: 0.9, alpha: 0.16,
    }));
  }
  const stacks = flamesNear(x, z, 520, STACK_KEEP[tier]);
  for (let i = 0; i < stacks.length; i++) {
    const f = stacks[i]!;
    out.push(mouth({
      x: f.x, y: f.y, z: f.z, kind: KIND.stack, weight: i === 0 ? 6 : 0.35, life: 9.2,
      size0: 0.85, size1: 2.1, heat: 0.28, radius: 0.45,
      rise: 3.2, spread: 0.25, floor: f.y, wind: 0.1,
      turb: 0.8, aspect: 1, alpha: 0.32,
    }));
  }
  const steam: Mouth[] = [];
  for (const h of heroMouths(layout)) {
    if (Math.hypot(h.x - x, h.z - z) < 48) steam.push(h);
  }
  if (Math.hypot(x - (marketSpots(layout).noodle?.street.x ?? 1e9), z - (marketSpots(layout).noodle?.street.z ?? 1e9)) > 140) {
    for (const c of curbMouths(layout, x, z, tier)) steam.push(c);
  }
  for (const g of nearestSources(steam, x, z, GRATE_KEEP[tier], KIND.grate)) out.push(g);
  for (const v of nearestSources(steam, x, z, VENT_KEEP[tier], KIND.vent)) out.push(v);
  const stalls = nearestSources(steam, x, z, 2, KIND.stall);
  for (const s of stalls) out.push({ ...s, weight: 4 });
  const tailKeep = tier === 'low' ? 3 : tier === 'medium' ? 4 : 5;
  for (let i = 0; i < tails.length && i < tailKeep; i++) {
    const t = tails[i]!;
    const heavy = t.heavy > 0;
    out.push(mouth({
      x: t.x, y: t.y + 0.06, z: t.z, kind: KIND.exhaust,
      weight: i === 0 ? 3 : 1.4,
      life: 0.8,
      size0: heavy ? 0.16 : 0.11, size1: heavy ? 0.34 : 0.26, heat: 0.02,
      radius: 0.04, rise: 0.12, spread: 0.02, floor: t.y - 0.35, wind: 0,
      turb: 0.04, aspect: 1, alpha: 0.62,
      vx: t.vx, vz: t.vz, fx: t.fx, fz: t.fz,
    }));
  }
  return out;
}

export interface SmokePose {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  mode: 'walk' | 'fly';
  cockpit?: boolean;
  feet?: { x: number; y: number; z: number };
}

/** Sidewalk beside the first hero grate, looking across at the column rather than down the lane. */
export function streetSteamPose(layout: CityLayout): SmokePose | null {
  const spots = marketSpots(layout);
  const n = spots.noodle;
  if (!n) return null;
  const lane = carriageNear(layout, n.street.x, n.street.z, 'little-tokyo-market');
  const ox = lane?.x ?? n.street.x;
  const oz = lane?.z ?? n.street.z;
  const fx = lane?.fx ?? Math.sin(n.street.heading);
  const fz = lane?.fz ?? -Math.cos(n.street.heading);
  const rx = fz;
  const rz = -fx;
  const d = 10;
  const side = 3.1;
  const vx = ox + fx * d + rx * side;
  const vz = oz + fz * d + rz * side;
  // Close, across the lane, so this grate's own column is the subject.
  const px = ox + fx * d - rx * 2.4;
  const pz = oz + fz * d - rz * 2.4;
  const ground = layout.heightAt(px, pz);
  const eye = ground + 1.7;
  const lookY = layout.heightAt(vx, vz) + 1.05;
  const dist = Math.hypot(vx - px, vz - pz) || 1;
  return {
    x: px, y: eye, z: pz,
    heading: Math.atan2(vx - px, -(vz - pz)),
    pitch: Math.atan2(lookY - eye, dist),
    mode: 'walk',
    feet: { x: px, y: ground, z: pz },
  };
}

export function stallPose(layout: CityLayout): SmokePose | null {
  const spots = marketSpots(layout);
  const cook = spots.noodle?.cook ?? spots.bibi?.cook;
  if (!cook) return null;
  let pot = { x: cook.x, y: cook.y + 1.28, z: cook.z };
  let best = 1e9;
  for (const s of marketSteamPoints(layout)) {
    const d = Math.hypot(s.x - cook.x, s.z - cook.z);
    if (d < 2.4 && s.y > cook.y + 0.7 && d < best) {
      best = d;
      pot = s;
    }
  }
  const hx = Math.sin(cook.heading);
  const hz = -Math.cos(cook.heading);
  const dist = 2.45;
  // Customer side, looking back at the pot. Behind the cook the frame is the street.
  const fx = pot.x + hx * dist;
  const fz = pot.z + hz * dist;
  const ground = layout.heightAt(fx, fz);
  const eye = ground + 1.7;
  return {
    x: fx, y: eye, z: fz,
    heading: Math.atan2(pot.x - fx, -(pot.z - fz)),
    pitch: Math.atan2(pot.y - eye, dist),
    mode: 'walk',
    feet: { x: fx, y: ground, z: fz },
  };
}

export function launchPose(layout: CityLayout): SmokePose | null {
  const plume = readLaunchPlume();
  if (!plume.live) return null;
  const px = plume.x + 26;
  const pz = plume.z + 58;
  const ground = layout.heightAt(px, pz);
  const eye = ground + 1.7;
  const lookX = plume.x - 2;
  const lookZ = plume.z;
  const lookY = plume.base + 190;
  const dist = Math.hypot(lookX - px, lookZ - pz) || 1;
  return {
    x: px, y: eye, z: pz,
    heading: Math.atan2(lookX - px, -(lookZ - pz)),
    pitch: Math.atan2(lookY - eye, dist),
    mode: 'walk',
    feet: { x: px, y: ground, z: pz },
  };
}

export function exhaustPose(layout: CityLayout, tails: readonly Tailpipe[]): SmokePose | null {
  const t = tails[0];
  if (!t) return null;
  // Three-quarter rear, far enough that a short trail reads and does not fill the lens.
  const dist = 5.8;
  const side = 3.6;
  const rx = -t.fz;
  const rz = t.fx;
  const fx = t.x - t.fx * dist + rx * side;
  const fz = t.z - t.fz * dist + rz * side;
  const ground = layout.heightAt(fx, fz);
  const eye = Math.max(ground + 1.15, t.y + 0.35);
  const lookX = t.x - t.fx * 1.6;
  const lookZ = t.z - t.fz * 1.6;
  const lookY = t.y + 0.2;
  return {
    x: fx, y: eye, z: fz,
    heading: Math.atan2(lookX - fx, -(lookZ - fz)),
    pitch: Math.atan2(lookY - eye, Math.hypot(lookX - fx, lookZ - fz) || 1),
    mode: 'walk',
    feet: { x: fx, y: ground, z: fz },
  };
}
