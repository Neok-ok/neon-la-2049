// Thin-lens circle of confusion, shared by the tour, the photo readout, and the shader.
// Lengths in the formula are millimetres. World units in this city are metres.
//
// Diameter on the sensor (Potmesil, and the form AMD publishes for a thin lens):
//   c = (f^2 / (N * (S - f))) * |S - D| / D
// Pixels use the same film height PerspectiveCamera.getFilmHeight() uses, so the
// blur matches the frustum the focal length already built.

import { clamp, lerp } from './easing';

export const FSTOP_MIN = 1.4;
export const FSTOP_MAX = 16;
export const FOCAL_MIN = 18;
export const FOCAL_MAX = 200;

export interface CocInput {
  focalMm: number;
  fStop: number;
  /** Focus distance, metres. */
  focusM: number;
  /** Subject distance, metres. */
  depthM: number;
  sensorHeightMm: number;
  viewHeightPx: number;
}

/** Circle of confusion diameter in pixels. 0 when the point is on the focus plane. */
export function circleOfConfusionPx(i: CocInput): number {
  const f = Math.max(1, i.focalMm);
  const n = Math.max(1.1, i.fStop);
  const s = Math.max(0.35, i.focusM) * 1000;
  const d = Math.max(0.35, i.depthM) * 1000;
  const cocMm = (f * f) / (n * Math.max(1, s - f)) * Math.abs(s - d) / d;
  const sensor = Math.max(1, i.sensorHeightMm);
  return cocMm / sensor * Math.max(1, i.viewHeightPx);
}

/** 0 is nearly sharp (f/16). 1 is wide open (f/1.4). Matches the old aperture slider. */
export function fStopFromAperture(aperture: number): number {
  const t = clamp(aperture, 0, 1);
  return Math.exp(Math.log(FSTOP_MAX) + t * (Math.log(FSTOP_MIN) - Math.log(FSTOP_MAX)));
}

export function apertureFromFStop(fStop: number): number {
  const f = clamp(fStop, FSTOP_MIN, FSTOP_MAX);
  return (Math.log(f) - Math.log(FSTOP_MAX)) / (Math.log(FSTOP_MIN) - Math.log(FSTOP_MAX));
}

export function formatFStop(fStop: number): string {
  const f = clamp(fStop, FSTOP_MIN, FSTOP_MAX);
  const shown = f >= 10 ? f.toFixed(0) : f.toFixed(1);
  return `f/${shown}`;
}

/** Vertical field of view in radians for a 35 mm gate, matching three.js film height. */
export function verticalFov(focalMm: number, aspect: number): number {
  const filmH = 35 / Math.max(aspect, 1);
  return 2 * Math.atan((0.5 * filmH) / Math.max(1, focalMm));
}

export function horizontalFov(focalMm: number, aspect: number): number {
  const filmW = 35 * Math.min(Math.max(aspect, 0.01), 1);
  return 2 * Math.atan((0.5 * filmW) / Math.max(1, focalMm));
}

export function mixFStop(a: number, b: number, t: number): number {
  return Math.exp(lerp(Math.log(a), Math.log(b), clamp(t, 0, 1)));
}
