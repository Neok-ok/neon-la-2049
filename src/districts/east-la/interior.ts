// One food counter in the covered market hall. Corridor template, tungsten, no window,
// no rides, no scene lights. The name stays off the signs.
import type { InteriorBox } from '../../world/interiors';
import type { CityLayout } from '../../world/layout';
import { getLayout } from '../../world/layout';
import {
  buildCorridorRoom, placeCollider, placeInterior, placeVolume, registerInterior,
} from '../../world/interiors';
import type { PlaceFrame } from '../../world/interiors';
import { counterOrigin } from './locate';

const CORRIDOR = { length: 2.6, width: 1.7, height: 2.55 };
const ROOM = { length: 5.6, width: 4.4, height: 2.6 };

function vol(f: PlaceFrame, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) {
  return placeVolume(f, (x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, y0, y1);
}

function counter(): InteriorBox[] {
  const tile: InteriorBox['color'] = [0.46, 0.28, 0.14];
  const steel: InteriorBox['color'] = [0.52, 0.48, 0.42];
  const out: InteriorBox[] = [];
  out.push({
    x: -1.15, y: 0, z: -5.6, w: 0.78, h: 1.08, d: 3.6,
    color: tile,
  });
  out.push({
    x: -1.15, y: 1.08, z: -5.6, w: 0.86, h: 0.06, d: 3.6,
    color: steel, emissive: [0.35, 0.16, 0.05],
  });
  out.push({
    x: -1.7, y: 1.14, z: -6.6, w: 0.42, h: 0.28, d: 0.42,
    color: steel, emissive: [0.9, 0.34, 0.08], flick: 0.45,
  });
  out.push({
    x: -1.55, y: 1.14, z: -4.8, w: 0.28, h: 0.22, d: 0.28,
    color: [0.32, 0.18, 0.1], emissive: [0.55, 0.2, 0.05], flick: 0.2,
  });
  for (let i = 0; i < 4; i++) {
    out.push({
      x: -0.4, y: 0, z: -4.35 - i * 0.85, w: 0.36, h: 0.72, d: 0.36,
      color: [0.2, 0.14, 0.1], detail: 1,
    });
  }
  return out;
}

export function installEastLaInterior(layout: CityLayout = getLayout()): void {
  const origin = counterOrigin(layout);
  if (!origin) return;
  const f: PlaceFrame = origin;
  const extras = counter();
  const plan = (detail: 0 | 1 | 2 | 3) => buildCorridorRoom({
    warmth: 0.96,
    corridor: CORRIDOR,
    room: ROOM,
    window: false,
    detail,
    extras,
  });
  registerInterior({
    id: 'east-la-counter',
    volume: vol(f, -2.5, 2.5, -8.7, 1.15, -0.2, 3.0),
    doors: [{ id: 'yard', exterior: true, box: vol(f, -0.7, 0.7, -0.2, 1.35, 0, 2.3) }],
    showFromOutside: true,
    streamRadius: 42,
    muffle: 0.8,
    hum: 0,
    colliders: plan(0).colliders.map((c) => placeCollider(f, c)),
    build: (detail) => placeInterior(f, plan(detail)),
  });
}
