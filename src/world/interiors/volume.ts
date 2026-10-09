import type { OrientedBox } from './types';

export function localOf(b: OrientedBox, x: number, z: number): [number, number] {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  const dx = x - b.x, dz = z - b.z;
  return [dx * c - dz * s, dx * s + dz * c];
}

export function containsBox(b: OrientedBox, x: number, y: number, z: number, pad = 0): boolean {
  if (y < b.y0 - pad || y > b.y1 + pad) return false;
  const [lx, lz] = localOf(b, x, z);
  return Math.abs(lx) <= b.hw + pad && Math.abs(lz) <= b.hd + pad;
}

/** 0 inside the box, otherwise the distance to it. */
export function distToBox(b: OrientedBox, x: number, y: number, z: number): number {
  const [lx, lz] = localOf(b, x, z);
  const dx = Math.max(Math.abs(lx) - b.hw, 0);
  const dz = Math.max(Math.abs(lz) - b.hd, 0);
  const dy = y < b.y0 ? b.y0 - y : y > b.y1 ? y - b.y1 : 0;
  return Math.hypot(dx, dz, dy);
}

export function boxVolume(b: OrientedBox): number {
  return (b.hw * 2) * (b.hd * 2) * Math.max(0.01, b.y1 - b.y0);
}
