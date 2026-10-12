// Fixed deep-link camera shots for visual regression.
// One street or approach per district, plus the dancer, LAX, LAPD, the pyramid and a spinner chase.
// Night rain, seed 2049. Quality and viewport are applied by the runner.
import { pathToFileURL } from 'node:url';
import layout from '../../src/data/city-layout.json' with { type: 'json' };

const LAT0 = layout.meta.origin.lat;
const LON0 = layout.meta.origin.lon;
const M_LAT = 110574;
const M_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);

export const SEED = 2049;
/** Kept in sync with VISUAL_CLOCK_SEC in src/core/rng.ts. The runner asserts the page reports this. */
export const EXPECT_SIM_TIME = 48;
export const TIME = 22.5;
export const WEATHER = 'rain';

export const VIEWS = {
  desktop: { width: 1280, height: 720 },
  phone: { width: 390, height: 844 },
};
export const QUALITIES = ['medium', 'ultra'];

/** Per-pixel YIQ threshold passed to pixelmatch. Higher ignores more shading noise. */
export const PIXEL_THRESHOLD = 0.2;
/** Fraction of pixels that may differ before a shot fails. */
export const MAX_DIFF_RATIO = 0.02;

const COMMON = [
  ['time', String(TIME)],
  ['weather', WEATHER],
  ['freeze', '1'],
  ['seed', String(SEED)],
  ['ui', '0'],
  ['hud', '0'],
  ['webgl', '1'],
  ['refl', '0'],
];

function xz(lat, lon) {
  return [(lon - LON0) * M_LON, (LAT0 - lat) * M_LAT];
}

function place(id) {
  const row = layout.landmarks.find((l) => l.id === id) ?? layout.pois.find((p) => p.id === id);
  if (!row) throw new Error(`unknown place ${id}`);
  const [x, z] = xz(row.lat, row.lon);
  return { id, x, z };
}

function yawToward(from, to) {
  return Math.round((Math.atan2(to.x - from.x, -(to.z - from.z)) * 180) / Math.PI);
}

function meta(spec) {
  return { id: spec.id, district: spec.district, tag: spec.tag ?? null, place: spec.place, at: spec.at, frame: spec.frame ?? null };
}

function walk(spec) {
  const at = place(spec.at);
  const eye = {
    x: spec.x ?? at.x + (spec.east ?? 0),
    z: spec.z ?? at.z + (spec.south ?? 0),
  };
  const look = spec.look ? place(spec.look) : null;
  const yaw = spec.yaw ?? (look ? yawToward(eye, look) : 0);
  return { ...meta(spec), mode: 'walk', x: Math.round(eye.x), z: Math.round(eye.z), yaw };
}

function fly(spec) {
  const at = place(spec.at);
  const eye = { x: at.x + spec.east, z: at.z + spec.south };
  const yaw = spec.yaw ?? yawToward(eye, at);
  return {
    ...meta(spec),
    mode: 'fly',
    x: Math.round(eye.x),
    y: spec.y,
    z: Math.round(eye.z),
    yaw,
    pitch: spec.pitch,
  };
}

/** @type {Array<{id: string, district: string, tag: string | null, place: string, frame: string | null, mode: 'walk' | 'fly', at: string, x: number, z: number, y?: number, yaw: number, pitch?: number}>} */
export const shots = [
  walk({ id: 'little-tokyo', district: 'little-tokyo-market', tag: null, place: 'Little Tokyo noodle bar', at: 'noodle-bar', yaw: 28 }),
  fly({ id: 'financial', district: 'financial-megatowers', tag: null, place: 'Megatower 1 approach', at: 'megatower-1', east: 620, south: 780, y: 380, pitch: 14 }),
  walk({ id: 'dtla', district: 'dtla', tag: null, place: 'Downtown canyon', at: 'dtla-canyon', yaw: 38 }),
  walk({ id: 'lapd', district: 'civic-center', tag: 'lapd', place: 'LAPD steps', at: 'lapd-steps', look: 'lapd-hq' }),
  walk({ id: 'broadway', district: 'historic-core', tag: null, place: 'Broadway at the Bradbury', at: 'bradbury', look: 'bradbury-building' }),
  walk({ id: 'dancer', district: 'historic-core', tag: 'dancer', place: 'Dancer at the canyon bridge', at: 'joi-bridge', frame: 'broadway:bridge' }),
  fly({ id: 'pyramid', district: 'wallace-vernon', tag: 'pyramid', place: 'Wallace pyramid', at: 'wallace-pyramid', east: 700, south: -4200, y: 640, pitch: 12 }),
  walk({ id: 'k-block', district: 'k-megablock', tag: null, place: "K's megablock street", at: 'k-megablock-tower', frame: 'k:street' }),
  walk({ id: 'arts', district: 'arts-district', tag: null, place: 'Arts District street', at: 'arts-foundry', frame: 'arts:street' }),
  fly({ id: 'sea-wall', district: 'coastal-strip', tag: null, place: 'Sepulveda Sea Wall', at: 'sea-wall-fight', east: 320, south: 30, y: 70, pitch: -12 }),
  walk({ id: 'lakewood', district: 'lakewood-megablocks', tag: null, place: 'Lakewood market yard', at: 'lakewood-market', yaw: 8 }),
  walk({ id: 'south-la', district: 'south-la-megablocks', tag: null, place: 'South LA hub', at: 'south-la-hub', yaw: 90 }),
  walk({ id: 'westside', district: 'westside', tag: null, place: 'Westside market yard', at: 'westside-yard', yaw: 180 }),
  walk({ id: 'basin', district: 'basin-sprawl', tag: null, place: 'Basin strip corner', at: 'basin-strip', yaw: 40 }),
  walk({ id: 'southeast', district: 'southeast-industrial', tag: null, place: 'Southeast works street', at: 'southeast-pump', frame: 'southeast:street' }),
  walk({ id: 'south-bay', district: 'south-bay-refineries', tag: null, place: 'South Bay tanks', at: 'south-bay-control', yaw: 200 }),
  walk({ id: 'hollywood', district: 'hollywood', tag: null, place: 'Hollywood boulevard', at: 'hollywood-lobby', frame: 'hollywood:street' }),
  fly({ id: 'lax', district: 'lax-spaceport', tag: 'lax', place: 'LAX gantries', at: 'lax-spaceport-towers', east: 280, south: 860, y: 140, pitch: 8 }),
  walk({ id: 'harbor', district: 'harbor', tag: null, place: 'Harbor street', at: 'harbor-control', frame: 'harbor:street' }),
  walk({ id: 'long-beach', district: 'long-beach', tag: null, place: 'Long Beach canyon', at: 'long-beach-concourse', frame: 'longbeach:canyon' }),
  walk({ id: 'east-la', district: 'east-la', tag: null, place: 'East LA market street', at: 'east-la-market', frame: 'eastla:market' }),
  fly({ id: 'spinner-chase', district: 'dtla', tag: 'spinner-chase', place: 'Spinner chase over downtown', at: 'dtla-canyon', east: -40, south: 80, y: 360, yaw: 38, pitch: -16 }),
];

export function fileName(id, view, quality) {
  return `${id}__${view}__${quality}.png`;
}

/** Query string for one deep link. Quality is part of the link so Medium and Ultra are different URLs. */
export function queryFor(shot, quality) {
  const q = new URLSearchParams();
  q.set('mode', shot.mode);
  q.set('at', shot.at);
  q.set('x', String(shot.x));
  if (shot.y !== undefined) q.set('y', String(shot.y));
  q.set('z', String(shot.z));
  q.set('yaw', String(shot.yaw));
  if (shot.pitch !== undefined) q.set('pitch', String(shot.pitch));
  for (const [k, v] of COMMON) q.set(k, v);
  q.set('quality', quality);
  if (shot.frame) q.set('frame', shot.frame);
  return q.toString();
}

export function districtIds() {
  return [layout.defaultDistrict.id, ...layout.districts.map((d) => d.id)];
}

export function assertCatalog() {
  const errors = [];
  const ids = new Set();
  for (const shot of shots) {
    if (ids.has(shot.id)) errors.push(`duplicate shot id ${shot.id}`);
    ids.add(shot.id);
    if (!shot.district || !shot.at || !shot.mode) errors.push(`${shot.id} is missing district, at, or mode`);
    const href = queryFor(shot, 'medium');
    for (const key of ['seed=2049', 'time=22.5', 'weather=rain', 'freeze=1', 'webgl=1', 'ui=0']) {
      if (!href.includes(key)) errors.push(`${shot.id} link missing ${key}`);
    }
  }
  const counts = new Map();
  for (const shot of shots) counts.set(shot.district, (counts.get(shot.district) ?? 0) + 1);
  for (const id of districtIds()) {
    const n = counts.get(id) ?? 0;
    if (n < 1 || n > 2) errors.push(`district ${id} has ${n} shots (want 1 or 2)`);
  }
  for (const tag of ['dancer', 'lax', 'lapd', 'pyramid', 'spinner-chase']) {
    if (!shots.some((s) => s.tag === tag)) errors.push(`missing landmark shot ${tag}`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
}

function printCatalog() {
  assertCatalog();
  const views = Object.keys(VIEWS).length;
  console.log(`${shots.length} shots × ${views} viewports × ${QUALITIES.length} qualities = ${shots.length * views * QUALITIES.length} images`);
  console.log('');
  for (const shot of shots) {
    const tag = shot.tag ? ` [${shot.tag}]` : '';
    console.log(`${shot.id}${tag}  ${shot.district}  ${shot.place}`);
    console.log(`  ?${queryFor(shot, 'medium')}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  printCatalog();
}
