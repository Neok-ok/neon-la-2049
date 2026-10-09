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
    const feet = world(-8, 0.02, HD + 26);
    const look = world(-4, 48, 10);
    return walk(feet, look, 0.38);
  }
  if (kind === 'market') {
    const feet = world(-68, 0.02, HD + 3.8);
    const look = world(-70, 1.4, HD + 1.2);
    return walk(feet, look, 0.02);
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
    const feet = inRoom(APARTMENT.x, APARTMENT.z, APARTMENT.yaw, 0.55, K_Y + 0.16, -3.15);
    const look = inRoom(APARTMENT.x, APARTMENT.z, APARTMENT.yaw, 1.7, K_Y + 1.5, -3.71);
    return walk(feet, look, 0.06);
  }
  if (kind === 'roof') {
    const p = world(PAD.x, HOVER, PAD.z + 4.2);
    const look = world(PAD.x + 12, HOVER - 1, PAD.z + 4.2);
    return {
      x: p.x, y: p.y, z: p.z,
      heading: headingTo(p.x, p.z, look.x, look.z),
      pitch: -0.16, mode: 'fly', cockpit: false,
    };
  }
  const eye = world(18, 520, HD + 380);
  const look = world(0, 70, 0);
  const dist = Math.hypot(look.x - eye.x, look.z - eye.z) || 1;
  return {
    x: eye.x, y: eye.y, z: eye.z,
    heading: headingTo(eye.x, eye.z, look.x, look.z),
    pitch: Math.atan2(look.y - eye.y, dist),
    mode: 'fly', cockpit: true,
  };
}
