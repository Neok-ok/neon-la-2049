// Debug / screenshot cameras. Not imported by the archetype (that would cycle through the generator).
import type { CityLayout } from '../../world/layout';
import { carriageNear } from '../../roads/streetSpan';
import { marketSpots } from './spots';

export type MarketView = 'street' | 'interior' | 'crowd' | 'roof' | 'bibi';

export interface MarketPose {
  x: number;
  y: number;
  z: number;
  /** Compass radians, 0 = north. */
  heading: number;
  pitch: number;
  mode: 'walk' | 'fly';
  /** Fly only: pilot view, so the chase mesh does not sit in the middle of the street. */
  cockpit?: boolean;
}

function towardShop(from: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number } {
  const x = to.x - from.x;
  const z = to.z - from.z;
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
}

export function marketCamera(layout: CityLayout, kind: MarketView): MarketPose | null {
  const spots = marketSpots(layout);
  const noodle = spots.noodle;
  const bibi = spots.bibi;
  const poi = layout.poiById('noodle-bar');
  const fallback = poi ?? { x: 415, z: 387 };
  const ground = layout.heightAt(fallback.x, fallback.z);

  if (kind === 'roof') {
    const s = noodle?.street;
    const x = s?.x ?? fallback.x;
    const z = s?.z ?? fallback.z;
    return {
      x, y: ground + 32, z,
      heading: s?.heading ?? 0.4,
      pitch: -0.62,
      mode: 'fly',
      cockpit: true,
    };
  }
  if (kind === 'interior' && noodle) {
    // Just outside the doorway, looking in. Standing on the stool or under the soffit
    // either fills the lens with the back wall or clips the ceiling.
    const e = noodle.entrance;
    const hx = Math.sin(e.heading);
    const hz = -Math.cos(e.heading);
    return {
      x: e.x - hx * 1.85, y: ground + 1.7, z: e.z - hz * 1.85,
      heading: e.heading, pitch: 0.05, mode: 'walk',
    };
  }
  if (kind === 'bibi' && bibi) {
    return { x: bibi.street.x, y: ground + 1.7, z: bibi.street.z, heading: bibi.street.heading, pitch: 0.06, mode: 'walk' };
  }
  if (kind === 'crowd' && noodle) {
    const s = noodle.street;
    const toward = towardShop(s, noodle.entrance);
    const hx = Math.sin(s.heading), hz = -Math.cos(s.heading);
    // Just outside the noodle doorway, looking out at the sidewalk so coats fill the frame.
    return {
      x: s.x + toward.x * 2.05 + hx * 0.6,
      y: ground + 1.7,
      z: s.z + toward.z * 2.05 + hz * 0.6,
      heading: Math.atan2(-toward.x, toward.z),
      pitch: 0.02,
      mode: 'walk',
    };
  }
  if (noodle) {
    const s = noodle.street;
    const lane = carriageNear(layout, s.x, s.z, 'little-tokyo-market');
    if (lane) {
      const along = Math.atan2(lane.fx, -lane.fz);
      const shop = Math.atan2(noodle.entrance.x - lane.x, -(noodle.entrance.z - lane.z));
      let turn = shop - along;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      return {
        x: lane.x,
        y: lane.y + 1.7,
        z: lane.z,
        heading: along + Math.max(-0.45, Math.min(0.45, turn * 0.55)),
        pitch: 0.08,
        mode: 'walk',
      };
    }
    const toward = towardShop(s, noodle.entrance);
    const ax = Math.sin(s.heading), az = -Math.cos(s.heading);
    const lx = ax * 0.6 - toward.x * 0.4;
    const lz = az * 0.6 - toward.z * 0.4;
    return {
      x: s.x + toward.x * 1.15,
      y: ground + 1.7,
      z: s.z + toward.z * 1.15,
      heading: Math.atan2(lx, -lz) - 0.18,
      pitch: 0.09,
      mode: 'walk',
    };
  }
  return { x: fallback.x, y: ground + 1.7, z: fallback.z, heading: 0.6, pitch: 0.05, mode: 'walk' };
}
