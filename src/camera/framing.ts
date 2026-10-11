// Place a subject on a third without rolling the camera.
// The look point is offset from the subject so the subject lands on the requested third.
// Screen thirds sit at NDC ±1/3. Offsetting the aim by nx * tan(fov/2) * distance moves the subject the other way.

import { Vector3 } from 'three/webgpu';
import { horizontalFov, verticalFov } from './lensModel';

const up = new Vector3(0, 1, 0);
const view = new Vector3();
const right = new Vector3();
const camUp = new Vector3();

/**
 * Look target that puts `subject` on a rule-of-thirds intersection.
 * `xThird` -1 is the left line, +1 the right, and values in between sit on the blend.
 * `yThird` +1 is the upper line.
 */
export function frameSubject(
  cam: Vector3,
  subject: Vector3,
  focalMm: number,
  aspect: number,
  xThird: number,
  yThird: number,
  out: Vector3,
): Vector3 {
  view.copy(subject).sub(cam);
  const dist = Math.max(0.5, view.length());
  view.multiplyScalar(1 / dist);
  right.crossVectors(view, up);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();
  camUp.crossVectors(right, view).normalize();
  const nx = Math.max(-1, Math.min(1, xThird)) / 3;
  const ny = Math.max(-1, Math.min(1, yThird)) / 3;
  const ox = -nx * dist * Math.tan(horizontalFov(focalMm, aspect) / 2);
  const oy = -ny * dist * Math.tan(verticalFov(focalMm, aspect) / 2);
  return out.copy(subject).addScaledVector(right, ox).addScaledVector(camUp, oy);
}
