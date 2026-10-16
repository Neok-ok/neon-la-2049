// The spaceport writes this every frame. The field reads it. Keeping the
// struct here means launch.ts does not import the particle pool.
import type { Tier } from '../../core/quality';

export interface LaunchDrive {
  /** Ignition time. 0 before the first launch. */
  id: number;
  /** Seconds since ignition. Keeps climbing after the engine cuts. */
  age: number;
  burning: boolean;
  x: number;
  y: number;
  z: number;
  headY: number;
  wind: number;
  windDir: number;
  tier: Tier;
}

const EMPTY: LaunchDrive = {
  id: 0, age: 0, burning: false, x: 0, y: 0, z: 0, headY: 0, wind: 0, windDir: 0, tier: 'medium',
};

let drive: LaunchDrive = EMPTY;

export function syncLaunchPlume(next: LaunchDrive): void {
  drive = next;
}

export function launchDrive(): LaunchDrive {
  return drive;
}
