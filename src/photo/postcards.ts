// One-tap compositions. Poses come from the district view cameras the cinematic stills already use.
import { Vector3 } from 'three/webgpu';
import { forwardOf } from '../camera/types';
import type { CityLayout } from '../world/layout';
import type { CityQuery } from '../world/CityQuery';
import { broadwayCamera } from '../districts/historic-core/view';
import { marketCamera } from '../districts/little-tokyo-market/view';
import { laxCamera } from '../districts/lax-spaceport/view';
import { coastCamera } from '../districts/coastal-strip/view';
import { harborCamera } from '../districts/harbor/view';
import { apertureFromFStop } from '../camera/lensModel';
import type { GradeId, LetterboxId } from './types';

export interface PhotoPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
}

export interface Postcard {
  id: string;
  name: string;
  focal: number;
  focus: number;
  aperture: number;
  roll: number;
  grade: GradeId;
  grain: number;
  vignette: number;
  bloom: number;
  exposure: number;
  letterbox: LetterboxId;
  rain: number;
  fog: number;
  snow: number;
  hours: number;
  /** After the pose is applied, focus the street subject under the frame instead of the stored distance. */
  lockSubject?: boolean;
  pose: (layout: CityLayout, query: CityQuery) => PhotoPose | null;
}

interface RawPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  mode: 'walk' | 'fly';
  feet?: { x: number; y: number; z: number };
}

/** Walk cameras store the feet. The lens sits 1.7 m above them, the same as walk mode. */
function eyeOf(p: RawPose | null): PhotoPose | null {
  if (!p) return null;
  if (p.mode === 'walk' && p.feet) {
    return { x: p.feet.x, y: p.feet.y + 1.7, z: p.feet.z, heading: p.heading, pitch: p.pitch };
  }
  return { x: p.x, y: p.y, z: p.z, heading: p.heading, pitch: p.pitch };
}

const back = new Vector3();

/** Beyond the near tower, so it can fall soft while the pyramid stays the focus. */
function pyramidPostcard(layout: CityLayout): PhotoPose | null {
  const py = layout.landmarkById('wallace-pyramid');
  if (!py) return null;
  const sat = layout.landmarkById('wallace-satellite-a');
  const near = sat ?? py;
  const dx = py.x - near.x;
  const dz = py.z - near.z;
  const len = Math.hypot(dx, dz) || 1;
  const tx = len < 2 ? 1 : dx / len;
  const tz = len < 2 ? 0 : dz / len;
  const dist = 4700;
  const side = 1300;
  const x = py.x - tx * dist - tz * side;
  const z = py.z - tz * dist + tx * side;
  const y = 190;
  const lookX = py.x * 0.62 + near.x * 0.38;
  const lookZ = py.z * 0.62 + near.z * 0.38;
  const lookY = Math.max(80, py.height * 0.32);
  const heading = Math.atan2(lookX - x, -(lookZ - z));
  const pitch = Math.atan2(lookY - y, Math.hypot(lookX - x, lookZ - z) || 1);
  return { x, y, z, heading, pitch };
}

/** Step back along the street so a long lens still frames the canyon instead of the near wall. */
function pullBack(pose: PhotoPose, meters: number, lift: number, query: CityQuery): PhotoPose {
  forwardOf(pose.heading, 0, back);
  const x = pose.x - back.x * meters;
  const z = pose.z - back.z * meters;
  const y = pose.y + lift;
  if (query.insideSolid(x, y, z, 0.5, true)) return pose;
  return { ...pose, x, y, z };
}

export const POSTCARDS: readonly Postcard[] = [
  {
    id: 'wallace-dusk',
    name: 'Pyramid dusk',
    focal: 28, focus: 1900, aperture: 0.9, roll: 0,
    grade: 'orange', grain: 0.22, vignette: 0.42, bloom: 0.42, exposure: 1.04,
    letterbox: '2.39', rain: 0, fog: 0.0017, snow: 0, hours: 19.7,
    pose: (layout) => pyramidPostcard(layout),
  },
  {
    id: 'broadway-rain',
    name: 'Canyon rain',
    focal: 55, focus: 14, aperture: apertureFromFStop(4), roll: 0, lockSubject: true,
    grade: 'neon', grain: 0.28, vignette: 0.5, bloom: 0.55, exposure: 0.96,
    letterbox: '2.39', rain: 0.72, fog: 0.0016, snow: 0, hours: 22.2,
    pose: (layout, query) => {
      const eye = eyeOf(broadwayCamera(layout, 'street'));
      return eye ? pullBack(eye, 12, 1.4, query) : null;
    },
  },
  {
    id: 'market-stall',
    name: 'Market stall',
    focal: 50, focus: 6, aperture: 0.72, roll: 0,
    grade: 'neon', grain: 0.2, vignette: 0.36, bloom: 0.4, exposure: 1,
    letterbox: '16:9', rain: 0.66, fog: 0.0018, snow: 0, hours: 22.4,
    pose: (layout) => eyeOf(marketCamera(layout, 'crowd')),
  },
  {
    id: 'lax-gantry',
    name: 'Gantry dusk',
    focal: 35, focus: 55, aperture: 0.26, roll: 0,
    grade: 'sodium', grain: 0.16, vignette: 0.32, bloom: 0.5, exposure: 1.45,
    letterbox: '16:9', rain: 0.12, fog: 0.0012, snow: 0, hours: 17.7,
    pose: (layout) => eyeOf(laxCamera(layout, 'gantry')),
  },
  {
    id: 'sea-wall',
    name: 'Sea wall',
    focal: 35, focus: 400, aperture: 0.16, roll: 0,
    grade: 'harbor', grain: 0.18, vignette: 0.44, bloom: 0.28, exposure: 0.96,
    letterbox: '2.39', rain: 0.28, fog: 0.0015, snow: 0, hours: 16.8,
    pose: (layout) => {
      // The coast fly pose is the spinner, 1.22 m under the lens. Photo mode has no cockpit offset.
      const eye = eyeOf(coastCamera(layout, 'aerial'));
      return eye ? { ...eye, y: eye.y + 1.22 } : null;
    },
  },
  {
    id: 'harbor-cranes',
    name: 'Harbor cranes',
    focal: 55, focus: 400, aperture: 0.22, roll: 0,
    grade: 'harbor', grain: 0.2, vignette: 0.38, bloom: 0.34, exposure: 1.02,
    letterbox: '16:9', rain: 0.12, fog: 0.0007, snow: 0, hours: 17.8,
    // The wall lens looks into the sea wall. The aerial is the one that frames the cranes.
    pose: (layout) => eyeOf(harborCamera(layout, 'aerial')),
  },
];

export function postcardById(id: string): Postcard | undefined {
  return POSTCARDS.find((p) => p.id === id);
}
