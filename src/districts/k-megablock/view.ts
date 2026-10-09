// Screenshot and debug cameras for Stage 8 (`__nla.kView`).
import type { CityLayout } from '../../world/layout';
import { bearingToYaw } from '../../world/geo';
import {
  APARTMENT, CORRIDOR, HD, HOVER, K_Y, LOBBY, PAD, localToWorld,
} from './spec';

export type KView = 'street' | 'market' | 'lobby' | 'corridor' | 'apartment' | 'roof' | 'aerial';

export interface KPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  mode: 'walk' | 'fly';
  cockpit?: boolean;
  feet?: { x: number; y: number; z: number };
}

function headingTo(fx: number, fz: number, tx: number, tz: number): number {
  return Math.atan2(tx - fx, -(tz - fz));
}

export function kCamera(layout: CityLayout, kind: KView): KPose | null {
  const l = layout.landmarkById('k-megablock-tower');
  if (!l) return null;
  const bearing = bearingToYaw(l.bearingDeg);
  const g = layout.heightAt(l.x, l.z);
  const world = (lx: number, y: number, lz: number) => {
    const [x, z] = localToWorld(l.x, l.z, bearing, lx, lz);
    return { x, y: g + y, z };
  };
  const inRoom = (ox: number, oz: number, face: number, lx: number, y: number, lz: number) => {
    const [mlx, mlz] = localToWorld(ox, oz, face, lx, lz);
    return world(mlx, y, mlz);
  };
  const walk = (
    feet: { x: number; y: number; z: number },
    look: { x: number; y: number; z: number },
    pitch: number,
  ): KPose => ({
    x: feet.x, y: feet.y + 1.7, z: feet.z,
    heading: headingTo(feet.x, feet.z, look.x, look.z),
    pitch, mode: 'walk', feet,
  });

  if (kind === 'street') {
    // Southeast of the slab, so the long south face and the market base share the frame.
    const feet = world(36, 0.02, HD + 32);
    const look = world(-24, 52, 6);
    return walk(feet, look, 0.4);
  }
  if (kind === 'market') {
    // Back in the aisle. The stall signs stay readable and the slab stays in frame.
    const feet = world(-42, 0.02, HD + 22);
    const look = world(-78, 10, HD + 0.6);
    return walk(feet, look, 0.32);
  }
  if (kind === 'lobby') {
    const feet = inRoom(LOBBY.doorX, LOBBY.doorZ, 0, -1.1, 0.16, -6.4);
    const look = inRoom(LOBBY.doorX, LOBBY.doorZ, 0, 0.2, 1.5, -13.2);
    return walk(feet, look, 0.04);
  }
  if (kind === 'corridor') {
    const feet = inRoom(CORRIDOR.x, CORRIDOR.z, CORRIDOR.yaw, 0.05, K_Y + 0.16, -4.1);
    const look = inRoom(CORRIDOR.x, CORRIDOR.z, CORRIDOR.yaw, -0.15, K_Y + 1.4, -8.6);
    return walk(feet, look, 0.02);
  }
  if (kind === 'apartment') {
    // Just inside the door, looking across the table toward the window and the bench.
    const feet = inRoom(APARTMENT.x, APARTMENT.z, APARTMENT.yaw, -0.2, K_Y + 0.16, -2.15);
    const look = inRoom(APARTMENT.x, APARTMENT.z, APARTMENT.yaw, 1.25, K_Y + 1.2, -4.4);
    return walk(feet, look, -0.1);
  }
  if (kind === 'roof') {
    // Hover just south of the pad centre, looking east along the markings.
    // Chase camera sits behind the spinner, so the amber pad stays in frame.
    const p = world(PAD.x, HOVER, PAD.z + 4.2);
    const look = world(PAD.x + 12, HOVER - 1, PAD.z + 4.2);
    return {
      x: p.x, y: p.y, z: p.z,
      heading: headingTo(p.x, p.z, look.x, look.z),
      pitch: -0.16, mode: 'fly', cockpit: false,
    };
  }
  // South of the slab and just above the roof, so the long face fills the frame.
  const eye = world(55, 200, HD + 210);
  const look = world(-15, 55, 5);
  const dist = Math.hypot(look.x - eye.x, look.z - eye.z) || 1;
  return {
    x: eye.x, y: eye.y, z: eye.z,
    heading: headingTo(eye.x, eye.z, look.x, look.z),
    pitch: Math.atan2(look.y - eye.y, dist),
    mode: 'fly', cockpit: true,
  };
}
