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

function heroMouths(layout: CityLayout): Mouth[] {
  if (heroes) return heroes;
  const out: Mouth[] = [];
  const spots = marketSpots(layout);
  const addLane = (x: number, z: number, heading: number, weight: number) => {
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
        kind: KIND.grate, weight: weight * 2, life: 2.8,
        size0: 0.38, size1: 1.05, heat: 0.05, radius: 0.18,
        rise: 1.65, spread: 0.07, floor: y - 0.05, wind: 0.05,
        turb: 0.18, aspect: 1, alpha: 0.52,
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
        x: s.x, y: s.y, z: s.z, kind: KIND.stall, weight: 5, life: 1.55,
        size0: 0.07, size1: 0.2, heat: 0.14, radius: 0.04,
        rise: 0.82, spread: 0.02, floor: s.y - 0.02, wind: 0.02,
        turb: 0.06, aspect: 1, alpha: 0.46,
      }));
    } else if (dy < 0.55) {
      out.push(mouth({
        x: s.x, y: s.y, z: s.z, kind: KIND.grate, weight: 0.55, life: 2.4,
        size0: 0.16, size1: 0.42, heat: 0.02, radius: 0.1,
        rise: 1.15, spread: 0.05, floor: ground, wind: 0.08,
        turb: 0.12, aspect: 1, alpha: 0.28,
      }));
    } else if (dy < 2.6) {
      out.push(mouth({
        x: s.x, y: s.y, z: s.z, kind: KIND.vent, weight: 1.4, life: 2.6,
        size0: 0.2, size1: 0.55, heat: 0.06, radius: 0.1,
        rise: 1.2, spread: 0.06, floor: ground, wind: 0.12,
        turb: 0.16, aspect: 1, alpha: 0.36,
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
      x: pose.x, y: y + 0.22, z: pose.z, kind: KIND.grate, weight: 0.7, life: 2.4,
      size0: 0.22, size1: 0.55, heat: 0.02, radius: 0.16,
      rise: 1.2, spread: 0.08, floor: y, wind: 0.16,
      turb: 0.2, aspect: 1, alpha: 0.3,
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
      x: plume.x, y: base + 4, z: plume.z, kind: KIND.launch, weight: 1, life: 6.2,
      size0: 22, size1: 40, heat: 0.55, radius: 4,
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
      x: f.x, y: f.y, z: f.z, kind: KIND.stack, weight: i === 0 ? 8 : 1, life: 8.5,
      size0: 2.4, size1: 5.6, heat: 0.9, radius: 0.45,
      rise: 6.8, spread: 0.22, floor: f.y, wind: 0.15,
      turb: 0.7, aspect: 1, alpha: 0.4,
    }));
  }
  const reach = 90;
  for (const h of heroMouths(layout)) {
    if (Math.hypot(h.x - x, h.z - z) < reach) out.push(h);
  }
  if (Math.hypot(x - (marketSpots(layout).noodle?.street.x ?? 1e9), z - (marketSpots(layout).noodle?.street.z ?? 1e9)) > 140) {
    for (const c of curbMouths(layout, x, z, tier)) out.push(c);
  }
  const tailKeep = tier === 'low' ? 4 : tier === 'medium' ? 6 : 8;
  for (let i = 0; i < tails.length && i < tailKeep; i++) {
    const t = tails[i]!;
    const heavy = t.heavy > 0;
    out.push(mouth({
      x: t.x - t.fx * 0.35, y: t.y + 0.02, z: t.z - t.fz * 0.35, kind: KIND.exhaust, weight: 1,
      life: heavy ? 1.45 : 1.1,
      size0: heavy ? 0.16 : 0.1, size1: heavy ? 0.55 : 0.34, heat: 0.02,
      radius: 0.05, rise: 0.12, spread: 0.04, floor: t.y - 0.2, wind: 0.01,
      turb: 0.08, aspect: 1, alpha: 0.42,
      vx: t.vx - t.fx * (heavy ? 2.4 : 3.4),
      vz: t.vz - t.fz * (heavy ? 2.4 : 3.4),
      fx: t.fx, fz: t.fz,
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
  // Across the lane from the grate, so the column is the subject and the street sign is out of frame.
  const px = ox + fx * d - rx * 2.4;
  const pz = oz + fz * d - rz * 2.4;
  const ground = layout.heightAt(px, pz);
  const eye = ground + 1.55;
  const lookY = layout.heightAt(vx, vz) + 1.45;
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

export function exhaustPose(layout: CityLayout, tails: readonly Tailpipe[]): SmokePose | null {
  const t = tails[0];
  if (!t) return null;
  const dist = 10.5;
  const side = 3.1;
  const rx = -t.fz;
  const rz = t.fx;
  const fx = t.x - t.fx * dist + rx * side;
  const fz = t.z - t.fz * dist + rz * side;
  const ground = layout.heightAt(fx, fz);
  const eye = ground + 1.7;
  const lookX = t.x - t.fx * 1.1;
  const lookZ = t.z - t.fz * 1.1;
  return {
    x: fx, y: eye, z: fz,
    heading: Math.atan2(lookX - fx, -(lookZ - fz)),
    pitch: Math.atan2((t.y + 0.05) - eye, Math.hypot(lookX - fx, lookZ - fz) || 1),
    mode: 'walk',
    feet: { x: fx, y: ground, z: fz },
  };
}
