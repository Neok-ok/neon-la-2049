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
      x, y: ground + 48, z,
      heading: s?.heading ?? 0.4,
      pitch: -0.42,
      mode: 'fly',
    };
  }
  if (kind === 'interior' && noodle) {
    const seat = noodle.seats[Math.floor(noodle.seats.length / 2)] ?? noodle.entrance;
    return { x: seat.x, y: ground + 1.15, z: seat.z, heading: seat.heading, pitch: 0.12, mode: 'walk' };
  }
  if (kind === 'bibi' && bibi) {
    return { x: bibi.street.x, y: ground + 1.7, z: bibi.street.z, heading: bibi.street.heading, pitch: 0.06, mode: 'walk' };
  }
  if (kind === 'crowd' && noodle) {
    const s = noodle.street;
    const hx = Math.sin(s.heading), hz = -Math.cos(s.heading);
    return { x: s.x - hx * 1.2, y: ground + 1.45, z: s.z - hz * 1.2, heading: s.heading, pitch: 0.02, mode: 'walk' };
  }
  if (noodle) {
    const s = noodle.street;
    return { x: s.x, y: ground + 1.7, z: s.z, heading: s.heading, pitch: 0.05, mode: 'walk' };
  }
  return { x: fallback.x, y: ground + 1.7, z: fallback.z, heading: 0.6, pitch: 0.05, mode: 'walk' };
}
