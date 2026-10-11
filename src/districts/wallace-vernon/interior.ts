// One hall behind the human door on the north face.
// Dark stone, ankle-deep gold water, one overhead shaft. Still a single mesh.
// Not a copied film set, and not the Bradbury stair.
import type { CityLayout } from '../../world/layout';
import { getLayout } from '../../world/layout';
import { bearingToYaw } from '../../world/geo';
import {
  placeCollider, placeInterior, placeVolume, registerInterior,
  type InteriorBox, type InteriorCollider, type InteriorDetail, type InteriorLight, type RGB,
} from '../../world/interiors';
import type { PlaceFrame } from '../../world/interiors';
import { COURT, localToWorld } from './spec';

const STONE: RGB = [0.035, 0.032, 0.03];
const STONE_HI: RGB = [0.07, 0.062, 0.05];
const WATER: RGB = [0.05, 0.032, 0.012];
const GOLD: RGB = [0.48, 0.26, 0.07];
const SHAFT: RGB = [0.22, 0.12, 0.04];

export function atriumFrame(layout: CityLayout): PlaceFrame | null {
  const l = layout.landmarkById('wallace-pyramid');
  if (!l) return null;
  const yaw = bearingToYaw(l.bearingDeg);
  const [x, z] = localToWorld(l.x, l.z, yaw, 0, COURT.doorZ);
  return { x, y: layout.heightAt(l.x, l.z) + COURT.deckY, z, yaw: yaw + Math.PI };
}

function box(
  boxes: InteriorBox[], x: number, y: number, z: number, w: number, h: number, d: number, color: RGB,
  extra?: Partial<InteriorBox>,
): void {
  boxes.push({ x, y, z, w, h, d, color, ...extra });
}

function wall(cols: InteriorCollider[], x: number, z: number, w: number, d: number, y0: number, top: number): void {
  cols.push({ x, z, hw: w / 2, hd: d / 2, y0, top, yaw: 0 });
}

interface AtriumPlan {
  boxes: InteriorBox[];
  lights: InteriorLight[];
  ambient: RGB;
  portals: Array<{ x: number; y: number; z: number; w: number; h: number; yaw?: number }>;
  colliders: InteriorCollider[];
}

/**
 * Local frame: door at the origin, the bridge on +Z, the hall toward −Z.
 * Depth stays in the gap in front of the first terrace collider (~34 m).
 */
export function buildAtrium(detail: InteriorDetail): AtriumPlan {
  const boxes: InteriorBox[] = [];
  const cols: InteriorCollider[] = [];
  const far = -24;
  const halfW = 11;
  const th = 0.42;
  const H = 11.2;
  const open = 2.15;
  const depth = -far;

  box(boxes, 0, -0.35, far / 2, halfW * 2, 0.35, depth, STONE);
  wall(cols, 0, far / 2, halfW * 2, depth, -0.35, 0);
  box(boxes, 0, H, far / 2, halfW * 2 + th, 0.4, depth, STONE);
  wall(cols, 0, far / 2, halfW * 2 + th, depth, H, H + 0.4);

  box(boxes, -halfW, 0, far / 2, th, H, depth, STONE);
  wall(cols, -halfW, far / 2, th, depth, 0, H);
  box(boxes, halfW, 0, far / 2, th, H, depth, STONE);
  wall(cols, halfW, far / 2, th, depth, 0, H);

  box(boxes, 0, 0, far, halfW * 2, H, th, STONE);
  wall(cols, 0, far, halfW * 2, th, 0, H);

  const sideW = halfW - open;
  const sideX = open + sideW / 2;
  box(boxes, -sideX, 0, -0.1, sideW, H, th, STONE);
  wall(cols, -sideX, -0.1, sideW, th, 0, H);
  box(boxes, sideX, 0, -0.1, sideW, H, th, STONE);
  wall(cols, sideX, -0.1, sideW, th, 0, H);
  box(boxes, 0, 2.7, -0.1, open * 2, H - 2.7, th, STONE);
  wall(cols, 0, -0.1, open * 2, th, 2.7, H);

  // Dry sill, then ankle-deep water across the hall. The stone under it stays walkable.
  box(boxes, 0, 0.02, -0.85, open * 1.7, 0.08, 1.5, STONE_HI);
  const waterZ = (far - 2.2) / 2;
  const waterD = -far - 2.4;
  box(boxes, 0, 0.02, waterZ, halfW * 2 - 1.4, 0.1, waterD, WATER, {
    emissive: GOLD, flick: -1,
  });

  // One shaft, mid-hall. The column is emissive geometry; the light is baked, not a scene light.
  const sz = -14;
  box(boxes, 0, H - 0.06, sz, 2.6, 0.08, 2.6, STONE_HI, { emissive: [0.55, 0.3, 0.08], flick: -1 });
  box(boxes, 0, 0.2, sz, 1.15, H - 0.45, 0.04, [0.01, 0.008, 0.006], { emissive: SHAFT, flick: -1 });
  box(boxes, 0, 0.2, sz, 0.04, H - 0.45, 1.15, [0.01, 0.008, 0.006], { emissive: [0.16, 0.09, 0.03], flick: -1 });
  const glints = detail === 0 ? 3 : detail === 1 ? 5 : 7;
  for (let i = 0; i < glints; i++) {
    const a = (i / glints) * Math.PI * 2;
    box(boxes, Math.cos(a) * 1.6, 0.12, sz + Math.sin(a) * 1.6, 0.55, 0.02, 0.55, WATER, {
      emissive: [0.7, 0.38, 0.1], flick: i * 0.6, detail: i < 3 ? 0 : i < 5 ? 1 : 2,
    });
  }

  const lights: InteriorLight[] = [
    { x: 0, y: H - 1.4, z: sz, color: [1, 0.58, 0.22], intensity: 2.4, range: 16 },
  ];
  return {
    boxes,
    lights,
    ambient: [0.012, 0.011, 0.01],
    portals: [{ x: 0, y: 1.35, z: 0.04, w: 2.2, h: 2.55 }],
    colliders: cols,
  };
}

export function installWallaceInterior(layout: CityLayout = getLayout()): void {
  const frame = atriumFrame(layout);
  if (!frame) return;
  const plan = buildAtrium(0);
  registerInterior({
    id: 'wallace-atrium',
    volume: placeVolume(frame, 0, -12, 11.6, 12.3, -0.4, 11.8),
    doors: [{
      id: 'plaza',
      exterior: true,
      box: placeVolume(frame, 0, 0.55, 1.05, 0.85, 0, 2.7),
    }],
    links: [],
    keepLandmarks: [],
    showFromOutside: false,
    streamRadius: 48,
    muffle: 0.9,
    hum: 0.45,
    colliders: plan.colliders.map((c) => placeCollider(frame, c)),
    build: (detail) => placeInterior(frame, buildAtrium(detail)),
  });
}
