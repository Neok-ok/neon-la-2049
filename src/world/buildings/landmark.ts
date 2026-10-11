// Three original hero megastructures in the financial district.
// They are landmarks so sky lanes step over them and the spinner collides above the fabric ceiling.
// LAPD, City Hall and the Wallace pyramid are not built here.
import { Mesh } from 'three/webgpu';
import { hashString } from '../../core/rng';
import { bearingToDir } from '../geo';
import { GeoWriter } from '../landmarks/GeoWriter';
import type { Landmark } from '../layout';
import { registerLandmarkType, type LandmarkCollider, type LandmarkEnv } from '../landmarks/registry';
import { getCityMaterial } from '../materials/cityMaterial';
import { HERO_KINDS } from './parts';
import { placeHero } from './place';

const LOD_DIST = [1600, 5200];

const KIND_OF: Record<string, (typeof HERO_KINDS)[number]> = {
  'b1-gate': 'hero-gate',
  'b1-step': 'hero-step',
  'b1-obelisk': 'hero-obelisk',
};

function worldOf(x: number, z: number, bearing: number, s: number, t: number): [number, number] {
  const [ax, az] = bearingToDir(bearing);
  const [bx, bz] = bearingToDir(bearing + 90);
  return [x + ax * s + bx * t, z + az * s + bz * t];
}

registerLandmarkType('b1-hero', (l: Landmark, env: LandmarkEnv) => {
  const kind = KIND_OF[l.id] ?? 'hero-step';
  const w = l.baseWidth;
  const d = l.baseDepth ?? l.baseWidth * 0.7;
  const placed = placeHero(kind, w, d, l.height, (hashString(l.id) % 1000) / 1000);
  const ground = env.layout.heightAt(l.x, l.z);
  const bearing = l.bearingDeg;
  // Same yaw the fabric mesher uses, so local width stays on the block B axis.
  const yaw = Math.PI - (bearing * Math.PI) / 180;
  const levels = [2, 1, 0].map((cap) => {
    const writer = new GeoWriter();
    for (const b of placed.boxes) {
      if (b.detail > cap) continue;
      if (b.ornament !== undefined && b.ornament > cap) continue;
      const [wx, wz] = worldOf(l.x, l.z, bearing, b.s, b.t);
      writer.box(wx, wz, ground + b.base, b.lb, b.la, b.h, yaw, {
        style: b.style,
        lit: b.lit,
        tint: b.tint,
        seed: (hashString(`${l.id}:${b.s.toFixed(2)}:${b.t.toFixed(2)}:${b.base.toFixed(1)}`) % 997) / 997,
      });
    }
    const mesh = new Mesh(writer.build(), getCityMaterial());
    mesh.name = `${l.id}-l${cap}`;
    mesh.matrixAutoUpdate = false;
    return mesh;
  });
  const top = ground + placed.boxes.reduce((m, b) => Math.max(m, b.base + b.h), 0);
  const r = Math.hypot(w, d) * 0.5;
  const object = env.lods.add(l.id, levels, LOD_DIST, l.x, l.z, ground, top, r);
  const colliders: LandmarkCollider[] = [];
  for (const b of placed.boxes) {
    if (b.detail > 0) continue;
    if (b.ornament !== undefined && b.ornament > 0) continue;
    if (Math.min(b.lb, b.la) < 1.2) continue;
    const [wx, wz] = worldOf(l.x, l.z, bearing, b.s, b.t);
    colliders.push({
      x: wx, z: wz, hw: b.lb / 2, hd: b.la / 2, yaw,
      y0: ground + b.base, top: ground + b.base + b.h,
    });
  }
  return { object, colliders };
});
