// Bradbury Building, 304 S Broadway, exterior and a walk-in court. The iron atrium of the
// real building is not copied: galleries, a plain column, and an open beam grid over the court.
// The pin is the centre of the 48 m depth. BRADBURY_FRONT shifts the street wall onto the
// Broadway façade; a panel jacket climbs the back and the south side so that face stays masonry.
// No wordmark. Signs are atlas cells.
import { Mesh } from 'three/webgpu';
import { GeoWriter } from '../../world/landmarks/GeoWriter';
import { getCityMaterial } from '../../world/materials/cityMaterial';
import { makeSignMesh } from '../../world/materials/signMesh';
import { phraseSeed } from '../../world/materials/signPhrases';
import { Style, SignColor, type Sign } from '../../world/fabric/types';
import { registerLandmarkType, type LandmarkEnv } from '../../world/landmarks/registry';
import { LightKind } from '../../world/landmarks/Beacons';
import type { Landmark } from '../../world/layout';
import { levelGroup } from '../_shared/megatower/place';
import { buildHeritage, type HeritageSign } from '../_shared/heritage/build';
import { Mass, type Detail } from './mass';
import { BRADBURY_FRONT, FACE_YAW, localToWorld } from './spec';

export const BRADBURY_LOD = [220, 700];
export const bradburyTris: number[] = [];

const W = 38;
const D = BRADBURY_FRONT * 2;
const H = 22.4;
/** Added to every depth authored with the wall at z = 0, so the pin stays the centre of the volume. */
const F = BRADBURY_FRONT;
const DOOR = 4.8;
const DOOR_H = 7.2;
const TUNNEL = 8;
const COURT = 14;
const JACKET_H = 27;

const stone = { style: Style.Masonry, lit: 0.22, tint: 0.96, seed: 0.44 };
const panel = { style: Style.Panel, lit: 0.38, tint: 0.7, seed: 0.22 };
const dark = { style: Style.Solid, lit: 0.03, tint: 0.38, seed: 0.11 };
const warm = { style: Style.Glow, lit: 0.8, tint: 1.15, seed: 0.66 };

function volume(m: Mass, g: number): void {
  const wingW = (W - COURT) / 2;
  const wingX = COURT / 2 + wingW / 2;
  const cz = F - D / 2;
  m.box(0, -wingX, cz, g, wingW, D, H, stone);
  m.box(0, wingX, cz, g, wingW, D, H, stone);
  m.solid(-wingX, cz, wingW, D, g, g + H);
  m.solid(wingX, cz, wingW, D, g, g + H);

  const backD = D - TUNNEL - COURT;
  const backZ = F - (TUNNEL + COURT + backD / 2);
  m.box(0, 0, backZ, g, COURT, backD, H, stone);
  m.solid(0, backZ, COURT, backD, g, g + H);

  // Lintel over the tunnel, and the jambs beside the 4.8 m door.
  m.box(0, 0, F - TUNNEL / 2, g + DOOR_H, COURT, TUNNEL, H - DOOR_H, stone);
  m.solid(0, F - TUNNEL / 2, COURT, TUNNEL, g + DOOR_H, g + H);
  const jambW = (COURT - DOOR) / 2;
  const jambX = DOOR / 2 + jambW / 2;
  m.box(1, -jambX, F - TUNNEL / 2, g, jambW, TUNNEL, DOOR_H, stone);
  m.box(1, jambX, F - TUNNEL / 2, g, jambW, TUNNEL, DOOR_H, stone);
  m.solid(-jambX, F - TUNNEL / 2, jambW, TUNNEL, g, g + DOOR_H);
  m.solid(jambX, F - TUNNEL / 2, jambW, TUNNEL, g, g + DOOR_H);

  // Court and tunnel floor. Thin, so a walker steps in rather than falling through a hole.
  m.box(0, 0, F - (TUNNEL + COURT) / 2, g, COURT - 0.4, TUNNEL + COURT, 0.14, dark);
  m.solid(0, F - (TUNNEL + COURT) / 2, COURT - 0.4, TUNNEL + COURT, g, g + 0.14);
  m.box(1, 0, F - TUNNEL / 2, g, DOOR, TUNNEL, 0.14, dark);

  if (m.max < 1) return;

  // Galleries. Visual only — there is no stair up from the court.
  const levels = [4.4, 8.8, 13.2, 17.6];
  const inner = COURT / 2 - 0.9;
  for (const y of levels) {
    m.box(1, -inner, F - (TUNNEL + COURT / 2), g + y, 1.7, COURT, 0.22, stone);
    m.box(1, inner, F - (TUNNEL + COURT / 2), g + y, 1.7, COURT, 0.22, stone);
    m.box(1, 0, F - (TUNNEL + COURT) + 0.85, g + y, COURT, 1.7, 0.22, stone);
  }

  const cols: Array<[number, number]> = [
    [-6.3, F - 9.2], [6.3, F - 9.2],
    [-6.3, F - 15], [6.3, F - 15],
    [-6.3, F - 21], [6.3, F - 21],
    [-3.1, F - 21.2], [3.1, F - 21.2],
  ];
  for (const [x, z] of cols) {
    m.box(1, x, z, g, 0.62, 0.62, H - 0.3, stone);
    m.solid(x, z, 0.62, 0.62, g, g + H - 0.3);
  }

  // Open beam grid. Not a roof, and not the real building's iron pattern.
  if (m.max >= 2) {
    for (let i = 0; i < 4; i++) {
      const z = F - TUNNEL - 2.2 - i * 3.2;
      m.box(2, 0, z, g + H - 0.35, COURT - 1.2, 0.38, 0.32, dark);
    }
    for (const x of [-3.6, 0, 3.6]) {
      m.box(2, x, F - (TUNNEL + COURT / 2), g + H - 0.15, 0.32, COURT - 1.4, 0.28, dark);
    }
    for (const x of [-5.2, 5.2]) {
      m.box(2, x, F - 15, g + 2.1, 0.18, 0.35, 1.1, warm);
      m.box(2, x, F - 15, g + 6.6, 0.18, 0.35, 1.1, warm);
    }
  }

  // Newer cladding on the back and the south side, tall enough to peek past the masonry.
  m.box(0, 0, F - D - 1.25, g, W + 1.6, 2.1, JACKET_H, panel);
  m.solid(0, F - D - 1.25, W + 1.6, 2.1, g, g + JACKET_H);
  m.box(0, W / 2 + 1.25, F - D / 2, g, 2.1, D, JACKET_H, panel);
  m.solid(W / 2 + 1.25, F - D / 2, 2.1, D, g, g + JACKET_H);
}

function ornament(m: Mass, g: number): HeritageSign[] {
  const built = buildHeritage({
    seed: 0.41,
    width: W,
    depth: 2,
    frontH: H,
    height: H + 3,
    family: 'roman',
    wrap: 0,
    marquee: false,
    door: DOOR,
    crown: 'none',
    blades: 1,
    billboard: false,
    lit: 0.3,
    tint: 0.94,
    compact: false,
    skin: true,
  });
  for (const p of built.pieces) {
    const proud = p.z > 0.15;
    m.box(p.detail, p.x, p.z + F + 0.06, g + p.y - p.h / 2, p.w, p.d, p.h, {
      style: p.style,
      lit: proud ? Math.max(p.lit, 0.16) : p.lit,
      tint: proud ? p.tint * 1.45 : p.tint,
      seed: p.seed,
    });
  }
  // A stepped parapet and a door frame, lighter than the wall, so the entry reads at night.
  // Not the real building's brick crown.
  const pale = { style: Style.Masonry, lit: 0.28, tint: 2.15, seed: 0.73 };
  m.box(1, 0, F + 0.7, g + H + 0.2, 22, 1.05, 5.4, pale);
  m.box(1, -10.4, F + 0.58, g + H - 0.7, 8.4, 0.85, 2.6, pale);
  m.box(1, 10.4, F + 0.58, g + H - 0.7, 8.4, 0.85, 2.6, pale);
  const jamb = DOOR / 2 + 0.7;
  m.box(1, -jamb, F + 0.55, g, 1.15, 0.7, DOOR_H + 0.5, pale);
  m.box(1, jamb, F + 0.55, g, 1.15, 0.7, DOOR_H + 0.5, pale);
  m.box(1, 0, F + 0.62, g + DOOR_H, DOOR + 2.4, 0.8, 0.9, pale);
  // Warm lobby light inside the tunnel, so the entry reads as a door rather than another window.
  m.box(1, 0, F - 1.4, g + 0.35, DOOR * 0.7, 0.22, DOOR_H - 0.8, warm);
  return built.signs;
}

function signsFor(l: Landmark, g: number, blades: HeritageSign[]): Sign[] {
  const out: Sign[] = [];
  const push = (lx: number, y: number, w: number, h: number, color: number, phrase: number, kind: 0 | 1) => {
    const [x, z] = localToWorld(l.x, l.z, FACE_YAW, lx, F + 0.55);
    out.push({
      x, y: g + y, z, yaw: FACE_YAW + (kind === 1 ? Math.PI / 2 : 0),
      w, h, color, seed: phraseSeed(phrase), kind,
    });
  };
  push(-6.2, 4.2, 3.4, 0.9, SignColor.Amber, 39, 0);
  push(6.2, 4.2, 3.4, 0.9, SignColor.White, 62, 0);
  for (const s of blades) push(s.x, s.y, s.w, s.h, s.color, s.phrase, s.kind === 1 ? 1 : 0);
  return out;
}

export function buildBradbury(l: Landmark, env: LandmarkEnv) {
  const g = env.layout.heightAt(l.x, l.z);
  const levels: Array<{ mesh: Mesh; tris: number; cols: Mass['cols']; signs: HeritageSign[] }> = [];
  for (const d of [2, 1, 0] as Detail[]) {
    const w = new GeoWriter();
    const m = new Mass(w, l.x, l.z, FACE_YAW, d);
    volume(m, g);
    const signs = ornament(m, g);
    const mesh = new Mesh(w.build(), getCityMaterial());
    mesh.name = `${l.id}-d${d}`;
    levels.push({ mesh, tris: (mesh.geometry.index?.count ?? 0) / 3, cols: m.cols, signs });
  }
  bradburyTris.splice(0, bradburyTris.length, ...levels.map((lv) => lv.tris));
  const full = levels[0]!;
  const signMesh = makeSignMesh(signsFor(l, g, full.signs));
  signMesh.name = `${l.id}-signs`;
  const r = Math.hypot(W, D) / 2 + 8;
  const object = env.lods.add(
    l.id,
    [levelGroup(full.mesh, signMesh), levels[1]!.mesh, levels[2]!.mesh],
    BRADBURY_LOD, l.x, l.z, g, g + JACKET_H, r,
  );
  env.beacons.add(l.x, g + H + 2.6, l.z, LightKind.Warm, 0.55);
  const [sx, sz] = localToWorld(l.x, l.z, FACE_YAW, 3.1, F + 0.9);
  env.beacons.add(sx, g + DOOR_H + 0.4, sz, LightKind.Warm, 0.42);
  return { object, colliders: full.cols };
}

registerLandmarkType('bradbury-building', buildBradbury);
