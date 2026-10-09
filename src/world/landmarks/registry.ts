// Landmark builder registry. District modules register builders here (through src/districts/landmark-index.ts)
// without importing Landmarks.ts, so there is no import cycle.
import type { Object3D } from 'three/webgpu';
import type { CityLayout, Landmark } from '../layout';
import type { Beacons } from './Beacons';
import type { Flares } from './Flares';
import type { LandmarkLods } from './LandmarkLods';

export interface LandmarkCollider {
  x: number; z: number; hw: number; hd: number; yaw: number; y0: number; top: number;
}

export interface LandmarkBuild {
  object: Object3D;
  colliders: LandmarkCollider[];
}

export interface LandmarkEnv {
  layout: CityLayout;
  /** Aviation, pad, police and warm point lights (one draw for the whole city). */
  beacons: Beacons;
  flares: Flares;
  /** Distance-switched detail levels for big landmarks. */
  lods: LandmarkLods;
}

export type LandmarkBuilder = (l: Landmark, env: LandmarkEnv) => LandmarkBuild;

const builders = new Map<string, LandmarkBuilder>();

/** Registering a type again replaces the builder (a district stage overriding the blockout). */
export function registerLandmarkType(type: string, b: LandmarkBuilder): void {
  builders.set(type, b);
}

/** Blockout builders: used only when no district stage registered the type (import order does not matter). */
export function registerLandmarkDefault(type: string, b: LandmarkBuilder): void {
  if (!builders.has(type)) builders.set(type, b);
}

export function landmarkBuilder(type: string): LandmarkBuilder | undefined {
  return builders.get(type);
}
