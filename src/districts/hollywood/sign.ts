// Veil Mark. An original hillside wordmark: five atlas panels on pylons, facing the strip.
// Not a famous sign, not a real name. Copy is the shared atlas.
import { Group, Mesh } from 'three/webgpu';
import { GeoWriter } from '../../world/landmarks/GeoWriter';
import { getCityMaterial } from '../../world/materials/cityMaterial';
import { makeSignMesh } from '../../world/materials/signMesh';
import { phraseSeed } from '../../world/materials/signPhrases';
import { Style, SignColor, type Sign } from '../../world/fabric/types';
import { registerLandmarkType, type LandmarkCollider, type LandmarkEnv } from '../../world/landmarks/registry';
import { LightKind } from '../../world/landmarks/Beacons';
import type { Landmark } from '../../world/layout';

const PANELS: Array<{ phrase: number; color: number }> = [
  { phrase: 51, color: SignColor.Violet },
  { phrase: 53, color: SignColor.Cyan },
  { phrase: 2, color: SignColor.Yellow },
  { phrase: 4, color: SignColor.Pink },
  { phrase: 62, color: SignColor.Amber },
];

const SPAN = 13;
const PANEL_W = 10.5;
const PANEL_H = 42;
const PYLON_H = 50;

const stone = { style: Style.Masonry, lit: 0.16, tint: 0.72, seed: 0.21 };
const gold = { style: Style.Glow, lit: 0.88, tint: 1.45, seed: 0.64 };
const frame = { style: Style.Deco, lit: 0.34, tint: 1.05, seed: 0.4 };

function build(l: Landmark, g: number): { mesh: Mesh; signs: Sign[]; cols: LandmarkCollider[] } {
  const w = new GeoWriter();
  const cols: LandmarkCollider[] = [];
  w.box(l.x, l.z, g - 0.4, SPAN * 4 + 8, 7, 1.6, 0, stone);
  cols.push({ x: l.x, z: l.z, hw: (SPAN * 4 + 8) / 2, hd: 3.5, yaw: 0, y0: g - 0.4, top: g + 1.2 });
  const signs: Sign[] = [];
  PANELS.forEach((panel, i) => {
    const x = l.x + (i - 2) * SPAN;
    w.box(x, l.z, g + 1.2, 2.1, 1.5, PYLON_H, 0, stone);
    w.box(x, l.z + 0.9, g + 6, PANEL_W + 0.8, 0.35, PANEL_H + 1.2, 0, frame);
    w.box(x, l.z + 0.9, g + 6 + PANEL_H, PANEL_W + 1.4, 0.4, 0.45, 0, gold);
    cols.push({ x, z: l.z, hw: 1.2, hd: 1.1, yaw: 0, y0: g + 1.2, top: g + 1.2 + PYLON_H });
    signs.push({
      x, y: g + 6 + PANEL_H / 2, z: l.z + 1.25,
      yaw: 0, w: PANEL_W, h: PANEL_H, color: panel.color, seed: phraseSeed(panel.phrase), kind: 0,
    });
  });
  const mesh = new Mesh(w.build(), getCityMaterial());
  mesh.name = l.id;
  return { mesh, signs, cols };
}

export function buildVeilMark(l: Landmark, env: LandmarkEnv) {
  const g = env.layout.heightAt(l.x, l.z);
  const built = build(l, g);
  const signs = makeSignMesh(built.signs);
  signs.name = `${l.id}-signs`;
  const object = new Group();
  object.name = l.id;
  object.add(built.mesh, signs);
  PANELS.forEach((_, i) => {
    const x = l.x + (i - 2) * SPAN;
    env.beacons.add(x, g + 1.2 + PYLON_H + 1.2, l.z, LightKind.Warm, 9, i * 0.17);
  });
  return { object, colliders: built.cols };
}

registerLandmarkType('veil-mark', buildVeilMark);
