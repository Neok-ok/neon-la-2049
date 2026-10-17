// Mouths sit on the flame, the flare, the grate, the pot, and the bumper.
// Positions come from the same planners that built those meshes.
import type { CityLayout } from '../../world/layout';
import { hash2i } from '../../core/rng';
import { carriageNear } from '../../roads/streetSpan';
import { marketPlates, marketSpots, marketSteamPoints } from '../../districts/little-tokyo-market/spots';
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
        size0: 0.18, size1: 0.46, heat: 0, radius: 0.12,
        rise: 1.05, spread: 0.02, floor: y - 0.02, wind: 0.32,
        turb: 0.95, aspect: 1, alpha: 0.7,
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
        x: s.x, y: s.y, z: s.z, kind: KIND.stall, weight: 5, life: 1.7,
        size0: 0.1, size1: 0.18, heat: 0, radius: 0.12,
        rise: 0.42, spread: 0.05, floor: s.y - 0.02, wind: 0.04,
        turb: 0.8, aspect: 1, alpha: 0.9,
      }));
    } else if (dy < 0.55) {
      // Baseline courtyard card. The visible plate is marketPlates.
    } else if (dy < 2.6) {
      out.push(mouth({
        x: s.x, y: s.y, z: s.z, kind: KIND.vent, weight: 1, life: 2.2,
        size0: 0.14, size1: 0.36, heat: 0, radius: 0.08,
        rise: 1.0, spread: 0.03, floor: ground, wind: 0.2,
        turb: 0.45, aspect: 1, alpha: 0.46,
      }));
    }
  }
  for (const s of marketPlates(layout)) {
    const ground = layout.heightAt(s.x, s.z);
    out.push(mouth({
      x: s.x, y: s.y, z: s.z, kind: KIND.grate, weight: 1, life: 2.2,
      size0: 0.18, size1: 0.46, heat: 0, radius: 0.12,
      rise: 1.05, spread: 0.02, floor: ground, wind: 0.32,
      turb: 0.95, aspect: 1, alpha: 0.72,
    }));
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
      size0: 0.18, size1: 0.46, heat: 0, radius: 0.12,
      rise: 1.05, spread: 0.02, floor: y, wind: 0.32,
      turb: 0.95, aspect: 1, alpha: 0.7,
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
      size0: 7.5, size1: 14, heat: 0.55, radius: 6,
      rise: 2, spread: 0.2, floor: base, wind: 0.02,
      turb: 1.35, aspect: 1, alpha: 0.58,
    }));
    out.push(mouth({
      x: plume.x, y: base + 1, z: plume.z, kind: KIND.ground, weight: 1, life: 3.4,
      size0: 3.2, size1: 6.5, heat: 0.04, radius: 4,
      rise: 0.8, spread: 0.4, floor: base, wind: 0.06,
      turb: 0.35, aspect: 0.85, alpha: 0.08,
    }));
  }
  const stacks = flamesNear(x, z, 520, STACK_KEEP[tier]);
  for (let i = 0; i < stacks.length; i++) {
    const f = stacks[i]!;
    out.push(mouth({
      x: f.x, y: f.y, z: f.z, kind: KIND.stack, weight: i === 0 ? 6 : 0.35, life: 9.2,
      size0: 5.2, size1: 12.4, heat: 0.55, radius: 0.9,
      rise: 3.4, spread: 0.35, floor: f.y, wind: 0.22,
      turb: 1.8, aspect: 1, alpha: 0.7,
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
  for (let i = 0; i < stalls.length; i++) out.push({ ...stalls[i]!, weight: i === 0 ? 7 : 1.1 });
  for (const m of exhaustMouths(tails, tier)) out.push(m);
  return out;
}

/** One mouth per nearby bumper. Rebuilt every frame so a moving pipe keeps its plume. */
export function exhaustMouths(tails: readonly Tailpipe[], tier: Tier): Mouth[] {
  const tailKeep = tier === 'low' ? 3 : tier === 'medium' ? 4 : 5;
  const out: Mouth[] = [];
  for (let i = 0; i < tails.length && i < tailKeep; i++) {
    const t = tails[i]!;
    const heavy = t.heavy > 0;
    const px = -t.fz;
    const pz = t.fx;
    const pipe = heavy ? 0.48 : 0.36;
    // Clear of the rear face. A puff born in the bumper is depth-tested away.
    const back = 0.34;
    out.push(mouth({
      x: t.x - t.fx * back + px * pipe, y: t.y + 0.18, z: t.z - t.fz * back + pz * pipe, kind: KIND.exhaust,
      weight: i === 0 ? 12 : 0.25,
      life: 2.05,
      size0: heavy ? 0.16 : 0.11, size1: heavy ? 0.55 : 0.38, heat: 0,
      radius: 0.05, rise: 0.85, spread: 0.08, floor: t.y, wind: 0.08,
      turb: 0.9, aspect: 1, alpha: 0.78,
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
  /** Hold this eye height. Walk gravity would drop an elevated still. */
  lock?: boolean;
  eye?: number;
  /** Vertical field of view in degrees. The stall still tightens past the walk default. */
  fov?: number;
}

/** Grate in the foreground, column rising toward the shop neon behind it. */
export function streetSteamPose(layout: CityLayout): SmokePose | null {
  const spots = marketSpots(layout);
  const n = spots.noodle;
  if (!n) return null;
  const anchor = n.street;
  let grate: { x: number; y: number; z: number } | null = null;
  let best = 1e9;
  for (const s of marketPlates(layout)) {
    const d = Math.hypot(s.x - anchor.x, s.z - anchor.z);
    if (d < best && d < 90) {
      best = d;
      grate = s;
    }
  }
  if (!grate) return null;
  const dx = anchor.x - grate.x;
  const dz = anchor.z - grate.z;
  const len = Math.hypot(dx, dz) || 1;
  const sx = dx / len;
  const sz = dz / len;
  const dist = 1.92;
  const lateral = 0.32;
  // Grate in the lower frame, column through the middle. Looking up dropped the source.
  const px = grate.x + sx * dist - sz * lateral;
  const pz = grate.z + sz * dist + sx * lateral;
  const ground = layout.heightAt(px, pz);
  const eye = ground + 1.58;
  const lookX = grate.x - sz * 0.5;
  const lookZ = grate.z + sx * 0.5;
  const lookY = grate.y + 0.95;
  const span = Math.hypot(lookX - px, lookZ - pz) || 1;
  return {
    x: px, y: eye, z: pz,
    heading: Math.atan2(lookX - px, -(lookZ - pz)),
    pitch: Math.atan2(lookY - eye, span),
    mode: 'walk',
    lock: true,
    eye: 1.58,
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
  const rx = hz;
  const rz = -hx;
  // Just in front of one rim. The NOODLES panel is on the back wall, only
  // ~0.4 m above the broth, so a wider lens makes that sign the subject.
  // A 20° lens aimed at the rim leaves the panel at the top edge.
  const dist = 1.55;
  const side = 0.78;
  const fx = pot.x + hx * dist + rx * side;
  const fz = pot.z + hz * dist + rz * side;
  const lookX = pot.x;
  const lookZ = pot.z;
  const ground = layout.heightAt(fx, fz);
  const eyeY = ground + 1.32;
  const eye = eyeY - ground;
  const lookY = pot.y + 0.02;
  const span = Math.hypot(lookX - fx, lookZ - fz) || 1;
  return {
    x: fx, y: eyeY, z: fz,
    heading: Math.atan2(lookX - fx, -(lookZ - fz)),
    pitch: Math.atan2(lookY - eyeY, span),
    mode: 'walk',
    lock: true,
    eye,
    fov: 20,
    feet: { x: fx, y: ground, z: fz },
  };
}

export function launchPose(layout: CityLayout): SmokePose | null {
  const plume = readLaunchPlume();
  if (!plume.live) return null;
  // The service stack stands on the nozzle. A head-on view of its face made
  // the tower the subject. Step back and look up the shaft so the column
  // above the crown is the frame, with the pad still at the foot.
  const dist = 156;
  const ang = 0.62;
  const px = plume.x + Math.cos(ang) * dist;
  const pz = plume.z + Math.sin(ang) * dist;
  const feetY = plume.base + 10;
  const lookX = plume.x;
  const lookZ = plume.z;
  const lookY = plume.base + 92;
  const span = Math.hypot(lookX - px, lookZ - pz) || 1;
  return {
    x: px, y: feetY, z: pz,
    heading: Math.atan2(lookX - px, -(lookZ - pz)),
    pitch: Math.atan2(lookY - feetY, span),
    mode: 'walk',
    lock: true,
    eye: 0,
    feet: { x: px, y: feetY, z: pz },
  };
}

export function exhaustPose(layout: CityLayout, tails: readonly Tailpipe[]): SmokePose | null {
  const t = tails[0];
  if (!t) return null;
  // Close enough that a metre of plume is the subject, with the street still in frame.
  const dist = 6.0;
  const side = 2.35;
  const rx = -t.fz;
  const rz = t.fx;
  const fx = t.x - t.fx * dist + rx * side;
  const fz = t.z - t.fz * dist + rz * side;
  const ground = layout.heightAt(fx, fz);
  const eye = 2.25;
  const lookX = t.x - t.fx * 1.2;
  const lookZ = t.z - t.fz * 1.2;
  const lookY = t.y + 1.05;
  return {
    x: fx, y: ground + eye, z: fz,
    heading: Math.atan2(lookX - fx, -(lookZ - fz)),
    pitch: Math.atan2(lookY - (ground + eye), Math.hypot(lookX - fx, lookZ - fz) || 1),
    mode: 'walk',
    lock: true,
    eye,
    fov: 30,
    feet: { x: fx, y: ground, z: fz },
  };
}
