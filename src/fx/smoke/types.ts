// Metres. A person is 1.80. A stall wisp is about that tall. A launch billow is tens of metres across.

export const KIND = {
  launch: 0,
  ground: 1,
  stack: 2,
  vent: 3,
  grate: 4,
  stall: 5,
  exhaust: 6,
} as const;

export type KindId = (typeof KIND)[keyof typeof KIND];

export const KIND_NAME = ['launch', 'ground', 'stack', 'vent', 'grate', 'stall', 'exhaust'] as const;

export interface Mouth {
  x: number;
  y: number;
  z: number;
  kind: KindId;
  /** Share of this kind's spawn budget. */
  weight: number;
  life: number;
  size0: number;
  size1: number;
  heat: number;
  /** Disc the puff is born inside, metres. */
  radius: number;
  rise: number;
  spread: number;
  floor: number;
  /** Fraction of the weather wind this mouth takes. */
  wind: number;
  turb: number;
  aspect: number;
  alpha: number;
  /** Initial velocity. Exhaust uses this to lag the bumper. */
  vx: number;
  vz: number;
  /** Car forward, for the exhaust trail. Zero on a fixed mouth. */
  fx: number;
  fz: number;
}

export interface Puff {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size0: number;
  size1: number;
  seed: number;
  spin: number;
  spinRate: number;
  heat: number;
  kind: KindId;
  floor: number;
  alpha: number;
  turb: number;
  aspect: number;
  rise: number;
  wind: number;
  ox: number;
  oz: number;
  /** 0..1 brightness so some billows sit in shadow. */
  shade: number;
  /** Fraction along the flame card. Launch only. */
  along: number;
  /** Metres across the flame card, and through it. Launch only. */
  offS: number;
  offD: number;
}

export interface SmokeSnapshot {
  alive: number;
  mouths: number;
  launch: number;
  ground: number;
  stack: number;
  vent: number;
  grate: number;
  stall: number;
  exhaust: number;
  warm: number;
}
