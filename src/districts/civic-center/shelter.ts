// The LAPD lobby stays a soffit. This is not registerInterior: the street comes back
// when you face the door. Rain stops for the whole recess. City draws drop only
// while the walker is looking into the hall, so the threshold still shows the mall.
import type { CityLayout } from '../../world/layout';
import { HQ, yawOf } from './spec';

function toLocal(layout: CityLayout, x: number, y: number, z: number): { lx: number; ly: number; lz: number } | null {
  const l = layout.landmarkById('lapd-hq');
  if (!l) return null;
  const yaw = yawOf(l.bearingDeg);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const dx = x - l.x;
  const dz = z - l.z;
  const g = layout.heightAt(l.x, l.z);
  return { lx: dx * c - dz * s, ly: y - g, lz: dx * s + dz * c };
}

/** Feet inside the recess, past the door plane and short of the back wall. */
export function inLapdLobby(layout: CityLayout, x: number, y: number, z: number): boolean {
  const p = toLocal(layout, x, y, z);
  if (!p) return false;
  const face = -HQ.podiumD / 2;
  return Math.abs(p.lx) < HQ.doorHalf - 0.45
    && p.lz > face + 0.85
    && p.lz < -43.2
    && p.ly > HQ.lobbyFloor - 0.35
    && p.ly < HQ.lobbyCeil - 0.2;
}

/**
 * True when `heading` points deeper into the hall (local +Z), away from the street face.
 * heading 0 looks toward world −Z. Local +Z is (sin yaw, cos yaw).
 */
export function lapdLobbyLooksIn(layout: CityLayout, heading: number): boolean {
  const l = layout.landmarkById('lapd-hq');
  if (!l) return false;
  const yaw = yawOf(l.bearingDeg);
  const fx = Math.sin(heading);
  const fz = -Math.cos(heading);
  const into = fx * Math.sin(yaw) + fz * Math.cos(yaw);
  return into > 0.2;
}
