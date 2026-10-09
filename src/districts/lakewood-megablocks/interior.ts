// One corner shop at the Lakewood Center yard. Corridor template, no rides, no scene lights.
import type { CityLayout } from '../../world/layout';
import { getLayout } from '../../world/layout';
import {
  buildCorridorRoom, placeCollider, placeInterior, placeVolume, registerInterior,
} from '../../world/interiors';
import type { PlaceFrame } from '../../world/interiors';
import { shopOrigin } from './locate';

const CORRIDOR = { length: 4.2, width: 1.7, height: 2.6 };
const ROOM = { length: 4.6, width: 3.8, height: 2.6 };

function vol(f: PlaceFrame, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) {
  return placeVolume(f, (x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, y0, y1);
}

export function installLakewoodInterior(layout: CityLayout = getLayout()): void {
  const origin = shopOrigin(layout);
  if (!origin) return;
  const f: PlaceFrame = origin;
  const plan = (detail: 0 | 1 | 2 | 3) => buildCorridorRoom({
    warmth: 0.75,
    corridor: CORRIDOR,
    room: ROOM,
    window: false,
    detail,
  });
  registerInterior({
    id: 'lakewood-shop',
    volume: vol(f, -2.15, 2.15, -9.4, 1.15, -0.2, 2.9),
    doors: [{ id: 'yard', exterior: true, box: vol(f, -0.72, 0.72, -0.25, 1.4, 0, 2.35) }],
    showFromOutside: true,
    streamRadius: 42,
    muffle: 0.84,
    hum: 0,
    colliders: plan(0).colliders.map((c) => placeCollider(f, c)),
    build: (detail) => placeInterior(f, plan(detail)),
  });
}
