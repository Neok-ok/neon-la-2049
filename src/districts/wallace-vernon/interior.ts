// A small water-lit room behind the human door on the north face.
// Original plan: dark stone, a shallow pool, one walkway, caustic patches on the
// existing interior flicker. Not the film atrium, and not the Bradbury stair.
import type { CityLayout } from '../../world/layout';
import { getLayout } from '../../world/layout';
import { bearingToYaw } from '../../world/geo';
import {
  placeCollider, placeInterior, placeVolume, registerInterior,
  type InteriorBox, type InteriorCollider, type InteriorDetail, type InteriorLight, type RGB,
} from '../../world/interiors';
import type { PlaceFrame } from '../../world/interiors';
import { COURT, localToWorld } from './spec';

const STONE: RGB = [0.10, 0.09, 0.08];
const STONE_HI: RGB = [0.16, 0.14, 0.12];
const WATER: RGB = [0.05, 0.08, 0.08];
const CAUSTIC: RGB = [0.28, 0.55, 0.46];
const BRONZE: RGB = [0.55, 0.32, 0.12];

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

/** Local frame: door at the origin, the bridge on +Z, the room toward −Z. */
export function buildAtrium(detail: InteriorDetail): AtriumPlan {
  const boxes: InteriorBox[] = [];
  const cols: InteriorCollider[] = [];
  const far = -8.15;
  const halfW = 3.35;
  const th = 0.28;
  const H = 4.05;
  const open = 1.12;

  box(boxes, 0, -0.2, far / 2, halfW * 2, 0.2, -far, STONE);
  wall(cols, 0, far / 2, halfW * 2, -far, -0.2, 0);
  box(boxes, 0, H, far / 2, halfW * 2 + th, 0.24, -far, STONE_HI);
  wall(cols, 0, far / 2, halfW * 2 + th, -far, H, H + 0.24);

  box(boxes, -halfW, 0, far / 2, th, H, -far, STONE);
  wall(cols, -halfW, far / 2, th, -far, 0, H);
  box(boxes, halfW, 0, far / 2, th, H, -far, STONE);
  wall(cols, halfW, far / 2, th, -far, 0, H);

  box(boxes, 0, 0, far, halfW * 2, H, th, STONE);
  wall(cols, 0, far, halfW * 2, th, 0, H);

  const sideW = halfW - open;
  const sideX = open + sideW / 2;
  box(boxes, -sideX, 0, -0.08, sideW, H, th, STONE);
  wall(cols, -sideX, -0.08, sideW, th, 0, H);
  box(boxes, sideX, 0, -0.08, sideW, H, th, STONE);
  wall(cols, sideX, -0.08, sideW, th, 0, H);
  box(boxes, 0, 2.62, -0.08, open * 2, H - 2.62, th, STONE);
  wall(cols, 0, -0.08, open * 2, th, 2.62, H);

  // Shallow water, either side of one walkway. The floor under it stays walkable.
  box(boxes, -1.85, 0.02, far / 2 - 0.15, 2.5, 0.05, -far - 1.3, WATER, {
    emissive: [0.05, 0.16, 0.14], flick: 0.4,
  });
  box(boxes, 1.85, 0.02, far / 2 - 0.15, 2.5, 0.05, -far - 1.3, WATER, {
    emissive: [0.05, 0.16, 0.14], flick: 1.7,
  });
  box(boxes, 0, 0.04, far / 2, 1.45, 0.16, -far - 1.6, STONE_HI);
  wall(cols, 0, far / 2, 1.45, -far - 1.6, 0.04, 0.2);

  const patches = detail === 0 ? 6 : detail === 1 ? 10 : 14;
  for (let i = 0; i < patches; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -1.1 - ((i / 2) / Math.max(1, patches / 2)) * (-far - 2.2);
    const y = 0.7 + (i % 3) * 0.85;
    // Just proud of the inner face. The wall centre is halfW, thickness th.
    box(boxes, side * (halfW - th / 2 - 0.05), y, z, 0.06, 0.42, 0.7, CAUSTIC, {
      emissive: CAUSTIC, flick: i * 0.73, detail: i < 6 ? 0 : i < 10 ? 1 : 2,
    });
  }
  if (detail >= 1) {
    box(boxes, 0, 0.22, -1.15, 0.08, 0.9, 0.08, BRONZE, { emissive: BRONZE, flick: 2.2, detail: 1 });
    box(boxes, -1.55, 3.55, far / 2, 0.12, 0.08, -far - 1.2, BRONZE, { emissive: [0.35, 0.2, 0.08], flick: -1, detail: 1 });
    box(boxes, 1.55, 3.55, far / 2, 0.12, 0.08, -far - 1.2, BRONZE, { emissive: [0.35, 0.2, 0.08], flick: -1, detail: 1 });
  }

  const lights: InteriorLight[] = [
    { x: -1.7, y: 0.4, z: -3.2, color: [0.45, 0.75, 0.62], intensity: 0.85, range: 7 },
    { x: 1.7, y: 0.4, z: -6.1, color: [0.4, 0.7, 0.58], intensity: 0.7, range: 6.5 },
    { x: 0, y: 2.4, z: -1.2, color: [0.75, 0.42, 0.16], intensity: 0.45, range: 5 },
  ];
  return {
    boxes,
    lights,
    ambient: [0.035, 0.038, 0.034],
    portals: [{ x: 0, y: 1.3, z: 0.02, w: 2.15, h: 2.5 }],
    colliders: cols,
  };
}

export function installWallaceInterior(layout: CityLayout = getLayout()): void {
  const frame = atriumFrame(layout);
  if (!frame) return;
  const plan = buildAtrium(0);
  registerInterior({
    id: 'wallace-atrium',
    volume: placeVolume(frame, 0, -4.25, 3.6, 4.2, -0.25, 4.5),
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
