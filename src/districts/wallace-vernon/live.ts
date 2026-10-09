// Per-frame precinct motion. One face sector in or out, and the causeway haulers.
import type { Vector3 } from 'three/webgpu';
import { updateWallaceFaces } from './faceDetail';
import { updateWallaceHaulers } from './haulers';

export function updateWallace(cam: Vector3, tier: string, dt: number): void {
  updateWallaceFaces(cam, tier);
  updateWallaceHaulers(dt);
}
