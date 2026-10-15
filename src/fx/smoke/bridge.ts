// Launch state written by the far-district module and read by the plume.
// Keeping the write here means the smoke chunk does not pull the launch mesh into the opening bundle.

export interface LaunchPlume {
  live: boolean;
  x: number;
  y: number;
  z: number;
  base: number;
  head: number;
  env: number;
  leanX: number;
  leanZ: number;
  halfW: number;
}

const empty: LaunchPlume = {
  live: false, x: 0, y: 0, z: 0, base: 0, head: 0, env: 0, leanX: 0, leanZ: 0, halfW: 18,
};

let plume: LaunchPlume = empty;

export function writeLaunchPlume(next: LaunchPlume): void {
  plume = next;
}

export function readLaunchPlume(): LaunchPlume {
  return plume;
}
