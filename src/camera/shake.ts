// Rig vibration for the spinner and for storms. A sum of incommensurate sines, not a noise texture.
// Reduced motion (OS setting or the calm switch) forces the amplitude to zero.

import type { PerspectiveCamera } from 'three/webgpu';
import { stormEnergy } from './disturbance';
import { reducedMotion } from './reducedMotion';

let clock = 0;

export function advanceShake(dt: number): void {
  clock += Math.max(0, dt);
}

/** 0 when the picture should stay locked. Speed is m/s, boost is the craft's top speed. */
export function flightAmp(speed: number, boost: number): number {
  if (reducedMotion()) return 0;
  const move = Math.min(1, speed / Math.max(40, boost));
  return move * 0.42 + stormEnergy() * 0.9;
}

/** Metres / radians. Small on purpose: a chase camera, not a handheld fight. */
export function applyFlightShake(camera: PerspectiveCamera, heading: number, amp: number): void {
  if (amp <= 0.001) return;
  const t = clock;
  const side = Math.sin(t * 11.3) * amp * 0.055;
  camera.position.x += Math.cos(heading) * side;
  camera.position.z += Math.sin(heading) * side;
  camera.position.y += Math.sin(t * 17.2 + 0.6) * amp * 0.028;
  camera.rotateZ(Math.sin(t * 9.1) * amp * 0.008);
  camera.rotateX(Math.sin(t * 13.7 + 2.1) * amp * 0.004);
}

/** Extra street-level offset in a storm. Zero in calm weather and when motion is reduced. */
export function walkStormOffset(): { x: number; y: number; z: number } {
  const e = reducedMotion() ? 0 : stormEnergy();
  if (e < 0.38) return { x: 0, y: 0, z: 0 };
  const k = (e - 0.38) * 0.045;
  const t = clock;
  return {
    x: Math.sin(t * 9.2) * k,
    y: Math.sin(t * 14.1 + 1.1) * k * 0.55,
    z: Math.cos(t * 8.4) * k,
  };
}
