// Invented plan for the hero slab. Bearing 0, so slab +X is east and slab +Z is south.
// Numbers are metres in that frame, origin at the landmark centre, y above the ground.
// The bible records each of these as invented.

export const SLAB_W = 230;
export const SLAB_D = 85;
export const SLAB_H = 185;
export const HW = SLAB_W / 2;
export const HD = SLAB_D / 2;

/** Residential module. 54 floors reach the roof; floor 40 is K's. */
export const FLOOR = 3.4;
export const K_FLOOR = 40;
export const K_Y = K_FLOOR * FLOOR;

export const SHAFT = { x: -102, z: 27.2, hx: 1.7, hz: 1.65 };

export const LOBBY = {
  doorX: -102,
  doorZ: HD,
  corridor: { length: 4.5, width: 3.05, height: 3.12 },
  room: { length: 9.25, width: 10.2, height: 3.28 },
  backDoor: { width: 1.35, height: 2.2 },
};

export const CORRIDOR = {
  x: -103.85,
  z: 27.05,
  yaw: Math.PI / 2,
  length: 9.6,
  width: 1.72,
  height: 2.4,
  /** Side door on local −X, metres from the lift. Stays inside `length`. */
  doorAt: 8.85,
  /** Dead end past the last door, so the hall stops inside the west wall. */
  end: { length: 1.25, width: 1.72, height: 2.4 },
};

export const APARTMENT = {
  x: -112.75,
  z: 27.88,
  yaw: Math.PI,
  corridor: { length: 1.55, width: 1.12, height: 2.38 },
  room: { length: 4.7, width: 3.7, height: 2.46 },
};

export const HEAD = {
  x: -96.6,
  z: 27.2,
  yaw: Math.PI / 2,
  y: SLAB_H,
  corridor: { length: 1.65, width: 1.75, height: 2.5 },
  room: { length: 2.25, width: 2.55, height: 2.52 },
  backDoor: { width: 1.2, height: 2.15 },
};

/** Lift door origins. Yaw puts local +Z out of the car toward the hall. */
export const LIFT = {
  w: 2.05,
  d: 2.15,
  h: 2.32,
  lobby: { x: SHAFT.x, z: 28.7, yaw: 0, y: 0 },
  floor: { x: -103.65, z: SHAFT.z, yaw: -Math.PI / 2, y: K_Y },
  roof: { x: -100.45, z: SHAFT.z, yaw: Math.PI / 2, y: SLAB_H },
};

export const PAD = { x: -84, z: 27.2, size: 16 };
/** 6 m over the roof, clear of the head-house. */
export const HOVER = SLAB_H + 6;

export const LOD_DIST = [480, 1600];

export interface SlabRect { x0: number; x1: number; z0: number; z1: number }

/** Walkable holes the landmark collider must leave open. */
export function slabHoles(band: 'ground' | 'shaft' | 'floor'): SlabRect[] {
  const shaft: SlabRect = {
    x0: SHAFT.x - SHAFT.hx, x1: SHAFT.x + SHAFT.hx,
    z0: SHAFT.z - SHAFT.hz, z1: SHAFT.z + SHAFT.hz,
  };
  if (band === 'shaft') return [shaft];
  if (band === 'ground') {
    return [
      shaft,
      { x0: -108.2, x1: -95.8, z0: 27.6, z1: HD + 0.6 },
    ];
  }
  return [
    shaft,
    { x0: -115.6, x1: -99.6, z0: 25.3, z1: 28.7 },
    { x0: -115.6, x1: -109.8, z0: 26.8, z1: 35.6 },
  ];
}

/** Landmark-local point to city metres. Yaw 0 keeps +X east and +Z south. */
export function localToWorld(ox: number, oz: number, yaw: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [ox + lx * c + lz * s, oz - lx * s + lz * c];
}
