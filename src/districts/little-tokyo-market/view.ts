// Debug / screenshot cameras. Not imported by the archetype (that would cycle through the generator).
import type { CityLayout } from '../../world/layout';
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
    // In the doorway, looking at the counter. The stool is too close to the back wall.
    const e = noodle.entrance;
    return {
      x: e.x, y: ground + 1.62, z: e.z,
      heading: e.heading, pitch: 0.1, mode: 'walk',
    };
  }
  if (kind === 'bibi' && bibi) {
    return { x: bibi.street.x, y: ground + 1.7, z: bibi.street.z, heading: bibi.street.heading, pitch: 0.06, mode: 'walk' };
  }
  if (kind === 'crowd' && noodle) {
    const s = noodle.street;
    const toward = towardShop(s, noodle.entrance);
    const hx = Math.sin(s.heading), hz = -Math.cos(s.heading);
    // Beside the lane, a little low, so coats and umbrella canopies fill the frame.
    return {
      x: s.x - hx * 1.6 + toward.x * 1.15,
      y: ground + 1.4,
      z: s.z - hz * 1.6 + toward.z * 1.15,
      heading: s.heading, pitch: 0.0, mode: 'walk',
    };
  }
  if (noodle) {
    const s = noodle.street;
    const toward = towardShop(s, noodle.entrance);
    // The sidewalk anchor sits in the pedestrian lane. Step into the doorway so a coat
    // does not fill the lens; the crowd stays a couple of metres off to the side.
    return {
      x: s.x + toward.x * 1.7, y: ground + 1.7, z: s.z + toward.z * 1.7,
      heading: s.heading, pitch: 0.04, mode: 'walk',
    };
  }
  return { x: fallback.x, y: ground + 1.7, z: fallback.z, heading: 0.6, pitch: 0.05, mode: 'walk' };
}
