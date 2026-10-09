// Lobby, three lift cars, the floor corridor, K's apartment and the roof head-house.
// All of them go through registerInterior. The cars do not move: a ride fades, then the app
// sets the walker down in the car at the other stop.
import type { CityLayout } from '../../world/layout';
import { getLayout } from '../../world/layout';
import { bearingToYaw } from '../../world/geo';
import {
  buildCorridorRoom, placeCollider, placeInterior, placeVolume, registerInterior,
  type InteriorCollider, type PlaceFrame,
} from '../../world/interiors';
import {
  APARTMENT, CORRIDOR, HEAD, K_Y, LIFT, LOBBY, localToWorld,
} from './spec';
import {
  apartmentColliders, apartmentExtras, apartmentLamp, buildLift, corridorExtras, lobbyExtras,
} from './rooms';

function frameAt(ox: number, oz: number, bearing: number, face: number, g: number, lx: number, lz: number, y: number): PlaceFrame {
  const [x, z] = localToWorld(ox, oz, bearing, lx, lz);
  return { x, y: g + y, z, yaw: bearing + face };
}

function vol(f: PlaceFrame, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) {
  return placeVolume(f, (x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, y0, y1);
}

export function installKInteriors(layout: CityLayout = getLayout()): void {
  const l = layout.landmarkById('k-megablock-tower');
  if (!l) return;
  const g = layout.heightAt(l.x, l.z);
  const yaw = bearingToYaw(l.bearingDeg);
  const at = (lx: number, lz: number, y: number, face: number) => frameAt(l.x, l.z, yaw, face, g, lx, lz, y);

  const lobbyF = at(LOBBY.doorX, LOBBY.doorZ, 0, 0);
  const lobbyPlan = (detail: 0 | 1 | 2 | 3) => buildCorridorRoom({
    warmth: 0.08,
    corridor: LOBBY.corridor,
    room: LOBBY.room,
    backDoor: LOBBY.backDoor,
    window: false,
    detail,
    extras: lobbyExtras(detail),
  });

  const corridorF = at(CORRIDOR.x, CORRIDOR.z, K_Y, CORRIDOR.yaw);
  const corridorPlan = (detail: 0 | 1 | 2 | 3) => buildCorridorRoom({
    warmth: 0.02,
    corridor: { length: CORRIDOR.length, width: CORRIDOR.width, height: CORRIDOR.height },
    room: CORRIDOR.end,
    sideDoors: [{ side: -1, at: CORRIDOR.doorAt, width: 0.96, height: 2.08 }],
    window: false,
    detail,
    extras: corridorExtras(detail),
  });

  const aptF = at(APARTMENT.x, APARTMENT.z, K_Y, APARTMENT.yaw);
  const aptPlan = (detail: 0 | 1 | 2 | 3) => {
    const plan = buildCorridorRoom({
      warmth: 0.2,
      corridor: APARTMENT.corridor,
      room: APARTMENT.room,
      detail,
      extras: apartmentExtras(detail),
    });
    plan.lights.push(apartmentLamp());
    plan.colliders.push(...apartmentColliders());
    return plan;
  };

  const headF = at(HEAD.x, HEAD.z, HEAD.y, HEAD.yaw);
  const headPlan = (detail: 0 | 1 | 2 | 3) => buildCorridorRoom({
    warmth: 0.06,
    corridor: HEAD.corridor,
    room: HEAD.room,
    backDoor: HEAD.backDoor,
    window: false,
    detail,
  });

  const cols = (f: PlaceFrame, list: InteriorCollider[]) => list.map((c) => placeCollider(f, c));

  registerInterior({
    id: 'k-lobby',
    volume: vol(lobbyF, -5.5, 5.5, -14.7, 0.9, -0.2, 3.55),
    doors: [{ id: 'street', exterior: true, box: vol(lobbyF, -1.2, 1.2, -0.45, 1.45, -0.15, 2.7) }],
    links: ['k-lift-lobby'],
    showFromOutside: true,
    streamRadius: 88,
    muffle: 0.8,
    hum: 0.55,
    colliders: cols(lobbyF, lobbyPlan(0).colliders),
    build: (detail) => placeInterior(lobbyF, lobbyPlan(detail)),
  });

  registerInterior({
    id: 'k-corridor',
    volume: vol(corridorF, -1.35, 1.05, -11.05, 0.85, -0.08, 2.55),
    doors: [{ id: 'hall', box: vol(corridorF, -1.15, -0.15, -9.4, -8.3, 0, 2.1) }],
    links: ['k-apartment', 'k-lift-floor'],
    showFromOutside: false,
    streamRadius: 36,
    muffle: 0.92,
    hum: 0.7,
    colliders: cols(corridorF, corridorPlan(0).colliders),
    build: (detail) => placeInterior(corridorF, corridorPlan(detail)),
  });

  const apt = aptPlan(0);
  registerInterior({
    id: 'k-apartment',
    volume: vol(aptF, -2.05, 2.0, -6.5, 0.55, -0.08, 2.6),
    doors: [{ id: 'hall', box: vol(aptF, -0.55, 0.55, -0.15, 0.55, 0, 2.15) }],
    links: ['k-corridor'],
    showFromOutside: false,
    streamRadius: 28,
    muffle: 0.88,
    hum: 0.45,
    colliders: cols(aptF, apt.colliders),
    build: (detail) => {
      const plan = aptPlan(detail);
      return placeInterior(aptF, {
        ...plan,
        openSky: { x: 1.83, z: -3.71, hw: 0.28, hd: 0.62, y0: 1.05, y1: 1.95 },
      });
    },
  });

  registerInterior({
    id: 'k-head',
    volume: vol(headF, -1.45, 1.45, -4.15, 1.2, -0.05, 2.7),
    doors: [{ id: 'pad', exterior: true, box: vol(headF, -0.85, 0.85, -0.15, 1.45, -0.02, 2.35) }],
    links: ['k-lift-roof'],
    showFromOutside: true,
    streamRadius: 70,
    muffle: 0.55,
    hum: 0.2,
    colliders: cols(headF, headPlan(0).colliders),
    build: (detail) => placeInterior(headF, headPlan(detail)),
  });

  const lift = (
    id: string, hall: string, pose: { x: number; z: number; yaw: number; y: number },
    upTo: string, downTo: string,
  ) => {
    const f = at(pose.x, pose.z, pose.y, pose.yaw);
    const plan = buildLift(0);
    registerInterior({
      id,
      volume: vol(f, -1.2, 1.2, -2.35, 0.75, -0.05, 2.48),
      doors: [
        { id: 'out', box: vol(f, -0.62, 0.62, -0.15, 0.65, 0, 2.15) },
        { id: 'call-up', box: vol(f, 0.16, 0.82, -2.02, -1.28, 0, 1.65) },
        { id: 'call-down', box: vol(f, -0.82, -0.16, -2.02, -1.28, 0, 1.65) },
      ],
      rides: [
        { door: 'call-up', to: upTo, toDoor: 'out' },
        { door: 'call-down', to: downTo, toDoor: 'out' },
      ],
      links: [hall],
      showFromOutside: false,
      streamRadius: 26,
      muffle: 0.9,
      hum: 0.8,
      colliders: cols(f, plan.colliders),
      build: (detail) => placeInterior(f, buildLift(detail)),
    });
  };

  lift('k-lift-lobby', 'k-lobby', LIFT.lobby, 'k-lift-floor', 'k-lift-roof');
  lift('k-lift-floor', 'k-corridor', LIFT.floor, 'k-lift-roof', 'k-lift-lobby');
  lift('k-lift-roof', 'k-head', LIFT.roof, 'k-lift-floor', 'k-lift-lobby');
}
