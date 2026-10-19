// Metres. A person is 1.80. A stall plume is about that tall. A launch cloud is hundreds.

export const KIND = {
  vent: 0,
  manhole: 1,
  roof: 2,
  stall: 3,
  barrel: 4,
  stack: 5,
  exhaust: 6,
  column: 7,
  ground: 8,
} as const;

export type SmokeKind = (typeof KIND)[keyof typeof KIND];

/** 0 street, 1 launch ground cloud, 2 launch column. Budgets are separate so a plume cannot eat the street. */
export type Slot = 0 | 1 | 2;

export interface Emitter {
  x: number;
  y: number;
  z: number;
  kind: SmokeKind;
  /** Particles per second at ultra. The field scales this by tier. */
  rate: number;
  life: number;
  size0: number;
  size1: number;
  /** 0 steam .. 1 a flame core. */
  heat: number;
  /** Emission disc, metres. */
  radius: number;
  /** Horizontal speed of the puff as it leaves, metres per second. */
  spread: number;
  /** Initial upward speed, metres per second. */
  rise: number;
  /** Distance at which the sprite has faded out, metres. */
  fade: number;
  /** Height / width of the card. */
  aspect: number;
  /** Floor the puff may not sink through. */
  floorY: number;
  acc: number;
}

export interface Tailpipe {
  x: number;
  y: number;
  z: number;
  /** 0 idle, 1 hard. */
  drive: number;
  /** 0 car, 1 truck, 2 spinner. */
  heavy: number;
  /** Wake, metres per second, opposite travel. Omitted wakes drift with the wind. */
  wx?: number;
  wz?: number;
}

export interface Wind {
  dir: number;
  speed: number;
  rain: number;
}

export interface Pool {
  cap: number;
  n: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  age: Float32Array;
  life: Float32Array;
  size0: Float32Array;
  size1: Float32Array;
  seed: Float32Array;
  kind: Float32Array;
  heat: Float32Array;
  fade: Float32Array;
  aspect: Float32Array;
  floorY: Float32Array;
  slot: Uint8Array;
  slotN: [number, number, number];
  /** Live cards per kind, so a vent cannot fill the street budget. */
  kindN: number[];
}

export function createPool(cap: number): Pool {
  const n = Math.max(0, cap);
  return {
    cap: n,
    n: 0,
    x: new Float32Array(n),
    y: new Float32Array(n),
    z: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    vz: new Float32Array(n),
    age: new Float32Array(n),
    life: new Float32Array(n),
    size0: new Float32Array(n),
    size1: new Float32Array(n),
    seed: new Float32Array(n),
    kind: new Float32Array(n),
    heat: new Float32Array(n),
    fade: new Float32Array(n),
    aspect: new Float32Array(n),
    floorY: new Float32Array(n),
    slot: new Uint8Array(n),
    slotN: [0, 0, 0],
    kindN: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  };
}
