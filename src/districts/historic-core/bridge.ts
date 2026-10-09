// Hologram footbridge on the Spring-side street, one block east of Broadway.
// The figure is Veil House's dancer: a geometric pink body in the shared hologram shader.
// The deck is concrete. Pink is the hologram and one atlas sign, not a painted character.
import { Mesh } from 'three/webgpu';
import { GeoWriter } from '../../world/landmarks/GeoWriter';
import { getCityMaterial } from '../../world/materials/cityMaterial';
import { makeSignMesh } from '../../world/materials/signMesh';
import { phraseSeed } from '../../world/materials/signPhrases';
import { Style, SignColor, type Sign } from '../../world/fabric/types';
import { registerHologram } from '../../world/holograms/api';
import { registerLandmarkType, type LandmarkEnv } from '../../world/landmarks/registry';
import { LightKind } from '../../world/landmarks/Beacons';
import type { Landmark } from '../../world/layout';
import { levelGroup } from '../_shared/megatower/place';
import { Mass, type Detail } from './mass';
import { AX, AZ, BRIDGE_YAW, localToWorld } from './spec';

export const BRIDGE_LOD = [160, 520];
export const bridgeTris: number[] = [];

const DECK = 11.2;
const SPAN = 16.4;
const WIDTH = 3.6;
const PIER = 7.4;
const STEPS = 32;
const TREAD = 0.34;

/** Panel normal faces +A (north), so a camera up the street looks at the figure. */
const DANCER_YAW = Math.atan2(AX, AZ);
const DANCER_H = 46;
const DANCER_W = 14;

const concrete = { style: Style.Civic, lit: 0.06, tint: 0.62, seed: 0.31 };
const dark = { style: Style.Solid, lit: 0.02, tint: 0.4, seed: 0.18 };
const warm = { style: Style.Glow, lit: 0.7, tint: 1.05, seed: 0.52 };

function structure(m: Mass, g: number): void {
  for (const x of [-PIER, PIER]) {
    m.box(0, x, 0, g, 1.45, 1.45, DECK - 0.45, concrete);
    m.solid(x, 0, 1.45, 1.45, g, g + DECK - 0.45);
  }
  m.box(0, 0, 0, g + DECK - 0.45, SPAN, WIDTH, 0.45, concrete);
  m.solid(0, 0, SPAN, WIDTH, g + DECK - 0.45, g + DECK);

  // Rails. The street side of the deck is open where the stairs meet it.
  m.box(1, 0, -WIDTH / 2 + 0.12, g + DECK, SPAN, 0.16, 1.05, dark);
  m.box(1, 0, WIDTH / 2 - 0.12, g + DECK, 8.2, 0.16, 1.05, dark);

  const n = m.max >= 2 ? STEPS : m.max === 1 ? 8 : 0;
  const rise = DECK / Math.max(1, n);
  const tread = TREAD * (STEPS / Math.max(1, n));
  const zFar = WIDTH / 2 + tread * n;
  for (const x of [-PIER, PIER]) {
    for (let i = 0; i < n; i++) {
      const y0 = g + rise * i;
      const z = zFar - tread * (i + 0.5);
      m.box(m.max >= 2 ? 2 : 1, x, z, y0, 1.55, tread * 0.96, rise, i % 2 ? concrete : dark);
      if (m.max >= 2) m.solid(x, z, 1.55, tread * 0.96, y0, y0 + rise);
    }
    if (m.max >= 1) {
      m.box(1, x - 0.85, (WIDTH / 2 + zFar) / 2, g, 0.12, zFar - WIDTH / 2, 1.05, dark);
      m.box(1, x + 0.85, (WIDTH / 2 + zFar) / 2, g, 0.12, zFar - WIDTH / 2, 1.05, dark);
    }
    // Landing so the last tread meets the deck.
    m.box(1, x, WIDTH / 2 + 0.2, g + DECK - 0.45, 1.55, 0.7, 0.45, concrete);
    m.solid(x, WIDTH / 2 + 0.2, 1.55, 0.7, g + DECK - 0.45, g + DECK);
  }

  if (m.max >= 2) {
    m.box(2, 0, 0.2, g + DECK + 0.85, 2.4, 0.08, 0.55, warm);
  }
}

function signsFor(l: Landmark, g: number): Sign[] {
  const [x, z] = localToWorld(l.x, l.z, BRIDGE_YAW, 0, -WIDTH / 2);
  return [{
    x, y: g + DECK + 1.35, z, yaw: BRIDGE_YAW,
    w: 2.2, h: 0.7, color: SignColor.Pink, seed: phraseSeed(48), kind: 0,
  }];
}

function placeDancer(l: Landmark, g: number): void {
  registerHologram({
    id: 'joi-bridge-dancer',
    x: l.x,
    y: g + DECK + DANCER_H / 2,
    z: l.z,
    yaw: DANCER_YAW,
    w: DANCER_W,
    h: DANCER_H,
    design: 'veil-dancer',
    color: SignColor.Pink,
    seed: 0.37,
    rank: 0,
    band: 'tower',
    spill: 28,
  });
}

export function buildCanyonBridge(l: Landmark, env: LandmarkEnv) {
  const g = env.layout.heightAt(l.x, l.z);
  const levels: Array<{ mesh: Mesh; tris: number; cols: Mass['cols'] }> = [];
  for (const d of [2, 1, 0] as Detail[]) {
    const w = new GeoWriter();
    const m = new Mass(w, l.x, l.z, BRIDGE_YAW, d);
    structure(m, g);
    const mesh = new Mesh(w.build(), getCityMaterial());
    mesh.name = `${l.id}-d${d}`;
    levels.push({ mesh, tris: (mesh.geometry.index?.count ?? 0) / 3, cols: m.cols });
  }
  bridgeTris.splice(0, bridgeTris.length, ...levels.map((lv) => lv.tris));
  const full = levels[0]!;
  const signMesh = makeSignMesh(signsFor(l, g));
  signMesh.name = `${l.id}-signs`;
  const object = env.lods.add(
    l.id,
    [levelGroup(full.mesh, signMesh), levels[1]!.mesh, levels[2]!.mesh],
    BRIDGE_LOD, l.x, l.z, g, g + DECK + DANCER_H, Math.hypot(SPAN, 14),
  );
  placeDancer(l, g);
  for (const x of [-PIER, PIER]) {
    const [wx, wz] = localToWorld(l.x, l.z, BRIDGE_YAW, x, 0);
    env.beacons.add(wx, g + DECK + 1.4, wz, LightKind.Warm, 2.2);
  }
  return { object, colliders: full.cols };
}

registerLandmarkType('canyon-bridge', buildCanyonBridge);
