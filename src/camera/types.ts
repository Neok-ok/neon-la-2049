import type { Vector3 } from 'three/webgpu';

export type ModeId = 'fly' | 'walk' | 'cine';

/** heading: compass radians (0 = north/-Z, +PI/2 = east/+X). pitch: radians, + = up. */
export interface Pose {
  position: Vector3;
  heading: number;
  pitch: number;
}

export interface Controller {
  readonly id: ModeId;
  enter(from: Pose): void;
  exit(): void;
  update(dt: number): void;
  pose(): Pose;
}

export function forwardOf(heading: number, pitch: number, out: Vector3): Vector3 {
  const cp = Math.cos(pitch);
  return out.set(Math.sin(heading) * cp, Math.sin(pitch), -Math.cos(heading) * cp);
}
