// One food counter in the covered market hall. Corridor template, tungsten, no window,
// no rides, no scene lights. The name stays off the signs.
import type { InteriorBox } from '../../world/interiors';
import type { CityLayout } from '../../world/layout';
import { getLayout } from '../../world/layout';
import {
  buildCorridorRoom, placeCollider, placeInterior, placeVolume, registerInterior,
  type InteriorLight,
} from '../../world/interiors';
import type { PlaceFrame } from '../../world/interiors';
import { counterOrigin } from './locate';

const CORRIDOR = { length: 2.6, width: 1.7, height: 2.55 };
const ROOM = { length: 5.6, width: 4.4, height: 2.6 };

function vol(f: PlaceFrame, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) {
  return placeVolume(f, (x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, y0, y1);
}

function counter(): InteriorBox[] {
  const tile: InteriorBox['color'] = [0.28, 0.14, 0.08];
  const steel: InteriorBox['color'] = [0.34, 0.3, 0.26];
  const stain: InteriorBox['color'] = [0.1, 0.06, 0.04];
  const out: InteriorBox[] = [];
  // Long stall: dark tile base, a steel top, a hood, and a backsplash. Not the template desk.
  out.push({ x: -1.2, y: 0, z: -5.5, w: 0.92, h: 1.02, d: 4.4, color: tile });
  out.push({
    x: -1.2, y: 1.02, z: -5.5, w: 1.02, h: 0.05, d: 4.4,
    color: steel, emissive: [0.28, 0.12, 0.03],
  });
  out.push({ x: -1.72, y: 1.07, z: -5.5, w: 0.08, h: 1.15, d: 4.2, color: stain });
  out.push({ x: -1.45, y: 2.15, z: -5.5, w: 0.7, h: 0.08, d: 3.6, color: stain });
  for (let i = 0; i < 6; i++) {
    out.push({
      x: -1.68, y: 1.2 + (i % 3) * 0.22, z: -7.2 + i * 0.55, w: 0.06, h: 0.1, d: 0.16,
      color: [0.45, 0.18 + (i % 3) * 0.08, 0.08],
      emissive: [0.35, 0.12, 0.04], detail: 1,
    });
  }
  // Three pendants. The warm practicals, not a ceiling tube.
  for (let i = 0; i < 3; i++) {
    const z = -4.3 - i * 1.15;
    out.push({ x: -0.55, y: 2.05, z, w: 0.06, h: 0.42, d: 0.06, color: stain });
    out.push({
      x: -0.55, y: 1.72, z, w: 0.28, h: 0.16, d: 0.28,
      color: [0.4, 0.22, 0.08], emissive: [1.05, 0.48, 0.12], flick: 0.4 + i,
    });
  }
  out.push({
    x: -1.55, y: 1.12, z: -6.7, w: 0.36, h: 0.22, d: 0.36,
    color: steel, emissive: [0.85, 0.32, 0.06], flick: 0.5,
  });
  out.push({
    x: -1.4, y: 1.1, z: -4.55, w: 0.22, h: 0.16, d: 0.22,
    color: [0.22, 0.1, 0.06], emissive: [0.4, 0.14, 0.04], flick: 1.2,
  });
  // A board of color blocks. No words.
  out.push({ x: 1.55, y: 1.15, z: -5.4, w: 0.06, h: 0.9, d: 1.5, color: [0.08, 0.05, 0.04], detail: 1 });
  for (let i = 0; i < 4; i++) {
    out.push({
      x: 1.5, y: 1.35 + (i % 2) * 0.28, z: -5.9 + i * 0.28, w: 0.03, h: 0.16, d: 0.2,
      color: [0.55, 0.22, 0.08], emissive: [0.3, 0.1, 0.03], detail: 1,
    });
  }
  out.push({ x: 0.2, y: 0.02, z: -5.2, w: 1.6, h: 0.02, d: 3.2, color: [0.12, 0.07, 0.04], detail: 1 });
  for (let i = 0; i < 4; i++) {
    out.push({
      x: 0.15, y: 0, z: -4.15 - i * 0.9, w: 0.34, h: 0.62, d: 0.34,
      color: [0.14, 0.08, 0.05], detail: 1,
    });
  }
  return out;
}

export function installEastLaInterior(layout: CityLayout = getLayout()): void {
  const origin = counterOrigin(layout);
  if (!origin) return;
  const f: PlaceFrame = origin;
  const extras = counter();
  const pendants: InteriorLight[] = [
    { x: -0.55, y: 1.85, z: -4.3, color: [1.1, 0.52, 0.16], intensity: 3.4, range: 3.6 },
    { x: -0.55, y: 1.85, z: -5.45, color: [1.05, 0.46, 0.14], intensity: 3.1, range: 3.4 },
    { x: -0.55, y: 1.85, z: -6.6, color: [0.95, 0.4, 0.12], intensity: 2.4, range: 3.1 },
  ];
  const plan = (detail: 0 | 1 | 2 | 3) => {
    const built = buildCorridorRoom({
      warmth: 0.96,
      shell: {
        wall: [0.11, 0.06, 0.04],
        floor: [0.06, 0.04, 0.03],
        ceil: [0.08, 0.045, 0.03],
        trim: [0.16, 0.09, 0.05],
        ambient: [0.04, 0.02, 0.012],
      },
      tube: 0,
      table: false,
      corridor: CORRIDOR,
      room: ROOM,
      window: false,
      detail,
      extras,
    });
    built.lights.push(...pendants);
    return built;
  };
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
