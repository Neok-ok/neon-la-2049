// One camera for the whole city. Districts change the mix of practicals, not the exposure.
// Night is a pushed cinema exposure (f/2, 1/48, ISO 1000). Day is a smoggy stop or two
// down from sunny-16 so the basin is not a white disc.
import { ev100, exposureFromEv, smoothstep } from './units.ts';

export const NIGHT_CAMERA = { aperture: 2, shutter: 1 / 48, iso: 1000 };
export const DAY_CAMERA = { aperture: 5.6, shutter: 1 / 125, iso: 100 };

export const NIGHT_EV = ev100(NIGHT_CAMERA.aperture, NIGHT_CAMERA.shutter, NIGHT_CAMERA.iso);
export const DAY_EV = ev100(DAY_CAMERA.aperture, DAY_CAMERA.shutter, DAY_CAMERA.iso);

/** Artistic sky, fog and rain were graded at exposure 1. This lifts them into nits. */
export const AUTHORED_EXPOSURE = 1;

let ev = NIGHT_EV;
let locked: number | null = null;

export function lockExposureEv(value: number | null): void {
  locked = value;
  if (value != null && Number.isFinite(value)) ev = value;
}

export function currentEv(): number {
  return ev;
}

export function currentExposure(): number {
  return exposureFromEv(ev);
}

/** How many times to scale an exposure-1 colour so it survives the physical exposure. */
export function authoredLift(exposure = currentExposure()): number {
  return AUTHORED_EXPOSURE / Math.max(exposure, 1e-5);
}

/**
 * Adapt toward the sun elevation. Lightning opens the iris for the strike.
 * The first call snaps, so a frozen screenshot does not fade in from the wrong stop.
 */
export function stepExposure(dt: number, sunY: number, overcast: number, lightning: number): number {
  const day = smoothstep(-0.05, 0.38, sunY);
  let target = NIGHT_EV + (DAY_EV - NIGHT_EV) * day;
  target -= overcast * day * 0.45;
  target -= Math.max(0, lightning) * 1.35;
  if (locked != null) target = locked;
  if (dt <= 0) ev = target;
  else {
    const k = 1 - Math.exp(-Math.max(0, dt) * 1.6);
    ev += (target - ev) * (locked != null ? 1 : k);
  }
  return exposureFromEv(ev);
}

/**
 * Smoggy noon is not 100 000 lux. ~12 000 lux on the directional plus a sky
 * hemisphere keeps a grey wall inside the film curve at DAY_EV.
 * Night skyglow of ~12 lux is a dense basin, not moonlight (0.25 lux).
 */
export function sunLux(daylight: number, overcast: number): number {
  return 12000 * Math.max(0, daylight) * (1 - overcast * 0.62);
}

export function skyLux(daylight: number, night: number, overcast: number): number {
  const daySky = 2800 * daylight * (0.35 + overcast * 0.65);
  const nightSky = 12 * night;
  return daySky + nightSky;
}
