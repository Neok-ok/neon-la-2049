// One glyph board on the terminal face. DEPART / CALDERA sit beside it.
// The colony line is a kind-0 sign in the old lease slot. The glyphs are noise.
import { Group } from 'three/webgpu';
import { SignColor, type Sign } from '../../world/fabric/types';
import type { CityLayout } from '../../world/layout';
import { registerHologram } from '../../world/holograms/api';
import { makeSignMesh } from '../../world/materials/signMesh';
import { CELL, phraseSeed } from '../../world/materials/signPhrases';
import { doorSite } from './spec';

export function installLaxHolos(layout: CityLayout): Group {
  const door = doorSite();
  const y = layout.heightAt(door.x, door.z);
  const z = door.z - 1.6;
  registerHologram({
    id: 'lax-glyph',
    x: door.x - 46, y: y + 36, z,
    yaw: Math.PI,
    w: 18, h: 44,
    design: 'glyph-loop',
    color: SignColor.White,
    seed: 0.23,
    rank: 0,
    band: 'tower',
    spill: 22,
  });
  const plate = (x: number, yy: number, w: number, h: number, seed: number, color: number): Sign => ({
    x, y: yy, z, yaw: Math.PI, w, h, color, seed, kind: 0,
  });
  const signs = makeSignMesh([
    plate(door.x - 62, y + 32, 12, 3.4, phraseSeed(CELL.DEPART), SignColor.White),
    plate(door.x - 30, y + 26, 12, 3.2, phraseSeed(CELL.CALDERA), SignColor.Cyan),
    plate(door.x + 52, y + 56, 36, 12, phraseSeed(CELL.COLONY), SignColor.Cyan),
  ]);
  signs.name = 'lax-wayfinding';
  const group = new Group();
  group.name = 'lax-wayfinding';
  group.add(signs);
  return group;
}
