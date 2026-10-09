// Bradbury court and the corridor template in the back wing. Registered once at startup.
import type { CityLayout } from '../../world/layout';
import { getLayout } from '../../world/layout';
import { placeCollider, placeInterior, placeVolume, registerInterior, buildCorridorRoom } from '../../world/interiors';
import type { PlaceFrame } from '../../world/interiors';
import { setBradburyCourtShown } from './bradbury';
import { buildCourt, courtColliders } from './courtPlan';
import { FACE_YAW, headingAlong, localToWorld } from './spec';

const H = 22.4;

function frameAt(x: number, y: number, z: number): PlaceFrame {
  return { x, y, z, yaw: FACE_YAW };
}

export function installBradburyInteriors(layout: CityLayout = getLayout()): void {
  const l = layout.landmarkById('bradbury-building');
  if (!l) return;
  const g = layout.heightAt(l.x, l.z);
  const frame = frameAt(l.x, g, l.z);
  const [sx, sz] = localToWorld(l.x, l.z, FACE_YAW, 0, 2);
  const service = frameAt(sx, g, sz);

  const vol = (f: PlaceFrame, z0: number, z1: number, hw: number, y0: number, y1: number) =>
    placeVolume(f, 0, (z0 + z1) / 2, hw, (z1 - z0) / 2, y0, y1);

  const servicePlan = (detail: 0 | 1 | 2 | 3) => buildCorridorRoom({
    warmth: 0.12,
    corridor: { length: 8, width: 1.9, height: 2.5 },
    room: { length: 5.9, width: 5.9, height: 2.5 },
    detail,
  });

  registerInterior({
    id: 'bradbury-court',
    volume: vol(frame, 2.2, 23.7, 6.7, -0.4, H + 0.4),
    doors: [{ id: 'street', exterior: true, box: vol(frame, 15, 25.4, 2.8, -0.2, 7.5) }],
    links: ['bradbury-service'],
    keepLandmarks: ['bradbury-building'],
    showFromOutside: true,
    streamRadius: 90,
    muffle: 0.8,
    colliders: courtColliders().map((c) => placeCollider(frame, c)),
    build: (detail) => placeInterior(frame, buildCourt(detail)),
    onShown: (shown) => setBradburyCourtShown(!shown),
  });

  registerInterior({
    id: 'bradbury-service',
    volume: vol(frame, -12.55, 2.6, 3.35, -0.4, 3.2),
    doors: [{ id: 'court', box: vol(frame, 1.4, 2.7, 1.05, -0.2, 2.6) }],
    links: ['bradbury-court'],
    keepLandmarks: ['bradbury-building'],
    showFromOutside: false,
    streamRadius: 48,
    muffle: 1,
    colliders: servicePlan(0).colliders.map((c) => placeCollider(service, c)),
    build: (detail) => placeInterior(service, servicePlan(detail)),
  });
}

export type InteriorView = 'court' | 'stair' | 'door' | 'service';

export interface InteriorPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  feet: { x: number; y: number; z: number };
}

function shot(
  layout: CityLayout, lx: number, lz: number, feetOff: number,
  lookLx: number, lookLz: number, lookOff: number, pitch: number,
): InteriorPose | null {
  const l = layout.landmarkById('bradbury-building');
  if (!l) return null;
  const [x, z] = localToWorld(l.x, l.z, FACE_YAW, lx, lz);
  const g = layout.heightAt(x, z);
  const [tx, tz] = localToWorld(l.x, l.z, FACE_YAW, lookLx, lookLz);
  return {
    x, y: g + feetOff, z,
    heading: headingAlong(tx - x, tz - z),
    pitch,
    feet: { x, y: g + feetOff, z },
  };
}

/** Walk cameras for the interior stream. Feet sit on the court or the service floor. */
export function interiorCamera(layout: CityLayout, kind: InteriorView): InteriorPose | null {
  if (kind === 'court') return shot(layout, -1.2, 8.2, 0.14, 3.6, 12.2, 3.2, 0.2);
  if (kind === 'stair') return shot(layout, 1.2, 12.2, 0.14, 4.2, 10.4, 5.5, 0.32);
  if (kind === 'door') return shot(layout, -5.5, 33.5, 0, 0.4, 18, 3.2, 0.04);
  return shot(layout, 0, -1.2, 0.12, 0.2, -8.5, 1.35, 0.04);
}
