// City-wide scale measurement. Imports only worker-safe modules. Three.js files are
// read as text so this process never loads WebGPU.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Rng, hashString } from '../../src/core/rng';
import { settingsFor, TIERS, type Tier } from '../../src/core/quality';
import { heroPlan } from '../../src/districts/financial-megatowers/specs';
import { PARAPET_H, PARAPET_T } from '../../src/districts/coastal-strip/profile';
import { planApron } from '../../src/districts/coastal-strip/apronPlan';
import { HQ, STAIR, HALL, HALL_STAIR } from '../../src/districts/civic-center/spec';
import { FLOOR, K_Y, LOBBY, SLAB_H, LIFT, CORRIDOR, APARTMENT, HEAD } from '../../src/districts/k-megablock/spec';
import { COURT, pyramidStepH, PYRAMID_BASE } from '../../src/districts/wallace-vernon/spec';
import { CountingSink } from '../../src/districts/_shared/megatower/sink';
import { buildPyramid } from '../../src/districts/_shared/megatower/pyramid';
import { buildTower } from '../../src/districts/_shared/megatower/tower';
import { CELL_H } from '../../src/world/windows/facade';
import { generateFabric, enumerateBlocks } from '../../src/world/fabric/generator';
import { Style, type Box, type Sign } from '../../src/world/fabric/types';
import { getLayout, type CityLayout, type District, type Landmark } from '../../src/world/layout';
import '../../src/vehicles/traffic-index';
import { freewayRoutes, NO_STREET_GRAPH, streetLattices } from '../../src/vehicles/trafficRegistry';

const ROOT = process.cwd();
const OUT = join(ROOT, 'tools/scale-audit/out/measurements.json');

export type Verdict = 'pass' | 'watch' | 'fail';
export type Severity = '—' | 'low' | 'medium' | 'high';

export interface Row {
  item: string;
  measured: string;
  expected: string;
  verdict: Verdict;
  severity: Severity;
  source: string;
  group: string;
  note?: string;
}

interface Sample {
  x: number;
  z: number;
  ground: number;
  blocks: number;
  boxes: number;
  signs: number;
}

interface DistrictReport {
  id: string;
  name: string;
  stage: number;
  archetype: string;
  sample: Sample | null;
  rows: Row[];
}

const STYLE_NAME: Record<number, string> = {};
for (const [k, v] of Object.entries(Style)) STYLE_NAME[v as number] = k;

const LORE: Record<string, { street: number; lane?: number; mass: [number, number] }> = {
  'little-tokyo-market': { street: 7, mass: [7, 95] },
  'financial-megatowers': { street: 38, lane: 7.2, mass: [90, 305] },
  dtla: { street: 34, lane: 7.2, mass: [90, 250] },
  'civic-center': { street: 40, lane: 7.2, mass: [36, 122] },
  'historic-core': { street: 18, lane: 3.15, mass: [40, 110] },
  'wallace-vernon': { street: 30, mass: [15, 60] },
  'k-megablock': { street: 12, mass: [60, 185] },
  'arts-district': { street: 20, lane: 6.4, mass: [10, 140] },
  'coastal-strip': { street: 20, mass: [15, 60] },
  'lakewood-megablocks': { street: 26, lane: 6.2, mass: [20, 130] },
  'south-la-megablocks': { street: 24, lane: 5.6, mass: [20, 130] },
  westside: { street: 18, lane: 5.4, mass: [10.2, 57.8] },
  'basin-sprawl': { street: 16, lane: 5.1, mass: [6.8, 34] },
  'southeast-industrial': { street: 26, lane: 6.6, mass: [10, 140] },
  hollywood: { street: 22, lane: 6.4, mass: [22, 119] },
  'lax-spaceport': { street: 60, lane: 11.5, mass: [15, 80] },
  'south-bay-refineries': { street: 24, lane: 6.2, mass: [12, 140] },
  harbor: { street: 30, lane: 7.5, mass: [15, 80] },
  'long-beach': { street: 30, lane: 6.8, mass: [60, 180] },
  'east-la': { street: 16, lane: 5.1, mass: [10.2, 57.8] },
  'hills-sparse': { street: 0, mass: [5, 11] },
};

/** Districts whose ground-traffic mix is not the default car-heavy branch. */
const MIX: Record<string, string> = {
  'historic-core': 'canyon',
  'civic-center': 'car+van',
  'lakewood-megablocks': 'car+van',
  'south-la-megablocks': 'car+van',
  'arts-district': 'box',
  westside: 'car+van',
  'basin-sprawl': 'car+van',
  'southeast-industrial': 'box+tanker',
  hollywood: 'car',
  'lax-spaceport': 'van',
  'south-bay-refineries': 'tanker',
  harbor: 'hauler',
  'long-beach': 'car',
  'east-la': 'car+van',
  dtla: 'car',
  'financial-megatowers': 'car',
};

const CROWD: Record<string, number> = {
  'little-tokyo-market': 1,
  dtla: 0.4,
  'financial-megatowers': 0.4,
  'historic-core': 0.72,
  'civic-center': 0.22,
  'k-megablock': 0.32,
  'lakewood-megablocks': 0.12,
  'south-la-megablocks': 0.2,
  westside: 0.14,
  'basin-sprawl': 0.07,
  'east-la': 0.18,
  'arts-district': 0.06,
  'southeast-industrial': 0.04,
  hollywood: 0.22,
  'south-bay-refineries': 0.03,
  harbor: 0.02,
  'long-beach': 0.16,
};

const HALF_LANE = 1.8;

function src(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function must(text: string, needle: string, file: string): void {
  if (!text.includes(needle)) throw new Error(`anchor missing in ${file}: ${needle}`);
}

function m(n: number, d = 2): string {
  if (!Number.isFinite(n)) return '—';
  const p = 10 ** d;
  const v = Math.round(n * p) / p;
  return `${v} m`;
}

function worse(
  a: { verdict: Verdict; severity: Severity },
  b: { verdict: Verdict; severity: Severity },
): { verdict: Verdict; severity: Severity } {
  const rank: Record<Verdict, number> = { pass: 0, watch: 1, fail: 2 };
  const sev: Record<Severity, number> = { '—': 0, low: 1, medium: 2, high: 3 };
  if (rank[a.verdict] !== rank[b.verdict]) return rank[a.verdict] > rank[b.verdict] ? a : b;
  return sev[a.severity] >= sev[b.severity] ? a : b;
}

function scoreRange(v: number, lo: number, hi: number): { verdict: Verdict; severity: Severity } {
  if (v >= lo && v <= hi) return { verdict: 'pass', severity: '—' };
  const span = Math.max(1e-6, hi - lo);
  const over = v < lo ? (lo - v) / span : (v - hi) / span;
  if (over <= 0.25 + 1e-6) return { verdict: 'watch', severity: 'low' };
  if (over <= 0.75 + 1e-6) return { verdict: 'watch', severity: 'medium' };
  return { verdict: 'fail', severity: 'high' };
}

function scoreNear(v: number, expected: number, tol = 0.02): { verdict: Verdict; severity: Severity } {
  const d = Math.abs(v - expected) / Math.max(Math.abs(expected), 1);
  if (d <= tol) return { verdict: 'pass', severity: '—' };
  if (d <= tol * 4) return { verdict: 'watch', severity: 'low' };
  if (d <= 0.08) return { verdict: 'watch', severity: 'medium' };
  return { verdict: 'fail', severity: 'high' };
}

function row(
  item: string, measured: string, expected: string,
  scored: { verdict: Verdict; severity: Severity },
  source: string, group: string, note?: string,
): Row {
  return { item, measured, expected, verdict: scored.verdict, severity: scored.severity, source, group, note };
}

function pass(item: string, measured: string, expected: string, source: string, group: string, note?: string): Row {
  return row(item, measured, expected, { verdict: 'pass', severity: '—' }, source, group, note);
}

function custom(
  item: string, measured: string, expected: string,
  verdict: Verdict, severity: Severity, source: string, group: string, note?: string,
): Row {
  return { item, measured, expected, verdict, severity, source, group, note };
}

function visualH(box: Box, ground: number): number {
  const sunk = ground - box.y0;
  if (sunk > 1) return box.h - sunk;
  return box.h;
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i]! : (s[i - 1]! + s[i]!) / 2;
}

function sliceFn(text: string, name: string): string {
  const i = text.indexOf(name);
  if (i < 0) throw new Error(`missing ${name}`);
  const start = text.indexOf('{', i);
  let depth = 0;
  for (let k = start; k < text.length; k++) {
    if (text[k] === '{') depth++;
    else if (text[k] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, k + 1);
    }
  }
  throw new Error(`unclosed ${name}`);
}

interface Extents { top: number; length: number; width: number; boxes: number }

function boxExtents(block: string): Extents {
  const re = /box\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g;
  let top = 0, minZ = Infinity, maxZ = -Infinity, minX = Infinity, maxX = -Infinity, n = 0;
  for (const hit of block.matchAll(re)) {
    const w = +hit[1]!, h = +hit[2]!, d = +hit[3]!, x = +hit[4]!, y = +hit[5]!, z = +hit[6]!;
    // Lamp slivers (a few centimetres thick) are not the body the player reads.
    if (Math.min(w, h, d) < 0.15) continue;
    top = Math.max(top, y + h / 2);
    minZ = Math.min(minZ, z - d / 2);
    maxZ = Math.max(maxZ, z + d / 2);
    minX = Math.min(minX, x - w / 2);
    maxX = Math.max(maxX, x + w / 2);
    n++;
  }
  if (!n) throw new Error('no boxes parsed');
  return { top, length: maxZ - minZ, width: maxX - minX, boxes: n };
}

function personTop(block: string): { head: number; hat: number } {
  const re = /box\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+)\s*\)/g;
  let head = 0, hat = 0;
  for (const hit of block.matchAll(re)) {
    const y = +hit[2]!, h = +hit[5]!, part = +hit[7]!;
    const top = y + h / 2;
    if (part === 1) head = Math.max(head, top);
    if (part === 10) hat = Math.max(hat, top);
  }
  if (head < 1) throw new Error('person head not parsed');
  return { head, hat };
}

function storeyScore(h: number, style: number): { scored: { verdict: Verdict; severity: Severity }; expected: string; note: string } {
  const name = STYLE_NAME[style] ?? String(style);
  if (style === Style.Industrial) {
    return {
      scored: h >= 6 && h <= 8 ? { verdict: 'watch', severity: 'medium' } : scoreRange(h, 3, 4),
      expected: '3–4 m if it reads as a floor; 6–8 m is a bay',
      note: `${name} cell is a bay height, not a residential storey.`,
    };
  }
  if (style === Style.Slit || style === Style.Monolith) {
    return {
      scored: { verdict: 'fail', severity: 'high' },
      expected: '3–4 m storey',
      note: `${name} panel is a façade module, not a floor a person could stand in.`,
    };
  }
  if (h >= 3 && h <= 4) {
    return { scored: { verdict: 'pass', severity: '—' }, expected: '3–4 m storey', note: `${name} cell sits in the real storey band.` };
  }
  if (h > 4 && h <= 5.5) {
    return {
      scored: { verdict: 'watch', severity: 'medium' },
      expected: '3–4 m floor (bible office/civic band is 4.0–5.5 m)',
      note: `${name} is inside the bible office/civic module and above a 3–4 m floor.`,
    };
  }
  if (h > 5.5 && h <= 6) {
    return {
      scored: { verdict: 'watch', severity: 'medium' },
      expected: '3–4 m floor; bible office/civic band stops at 5.5 m',
      note: `${name} sits just past the office band.`,
    };
  }
  return {
    scored: scoreRange(h, 3, 4),
    expected: '3–4 m storey',
    note: `${name} cell is what the façade shader repeats as a floor.`,
  };
}

function sidewalkVerdict(street: number, lane: number): { implied: number; scored: { verdict: Verdict; severity: Severity }; note: string } {
  const implied = street / 2 - lane - HALF_LANE;
  const note = `street/2 − driving line − ${HALF_LANE} m (half of a 3.6 m lane centred on the driving line). The driving line is not a painted lane width.`;
  if (street >= 30 && implied > 4.5) {
    return {
      implied,
      scored: { verdict: 'watch', severity: 'medium' },
      note: `${note} One tracked lane in a film-wide street; the remainder is carriageway, not a sidewalk slab.`,
    };
  }
  return { implied, scored: scoreRange(implied, 1.5, 4.5), note };
}

function anchors(): void {
  const facade = src('src/world/windows/facade.ts');
  must(facade, 'export const CELL_H = [1, 3.6, 4.0, 3.5, 3.2, 3.4, 3.1, 4.0, 3.2, 3.4, 3.2, 4.0, 13.0, 4.5, 11.7, 3.5, 3.3, 3.9, 3.2, 3.8]', 'facade.ts');
  const gen = src('src/world/fabric/generator.ts');
  must(gen, 'const HILL_ARCHETYPE_THRESHOLD = 45', 'generator.ts');
  must(gen, 'b.y0 -= 8', 'generator.ts');
  const vehicles = src('src/vehicles/vehicleModels.ts');
  must(vehicles, 'export const CAR_L = 4.85', 'vehicleModels.ts');
  must(vehicles, 'export const CAR_W = 1.78', 'vehicleModels.ts');
  must(vehicles, 'export const CAR_H = 1.466', 'vehicleModels.ts');
  must(vehicles, 'export const HAULER_L = 16.159', 'vehicleModels.ts');
  must(vehicles, 'export const HAULER_W = 2.316', 'vehicleModels.ts');
  must(vehicles, 'export const HAULER_H = 3.887', 'vehicleModels.ts');
  must(vehicles, 'car: CAR_L', 'vehicleModels.ts');
  const crowd = src('src/districts/little-tokyo-market/crowd.ts');
  must(crowd, 'box(0, 1.69, 0, 0.17, 0.22, 0.17, 1)', 'crowd.ts');
  must(crowd, 'Body is 1.80 m to the top of the head', 'crowd.ts');
  const walk = src('src/camera/WalkController.ts');
  must(walk, 'export const HUMAN = { eye: 1.7, radius: 0.32, height: 1.8, walk: 1.5, run: 4.2 }', 'WalkController.ts');
  const lamps = src('src/districts/_shared/streetLamps.ts');
  must(lamps, 'const POLE_H = 7.5', 'streetLamps.ts');
  must(lamps, "const NO_LAMPS = new Set(['little-tokyo-market', 'lax-spaceport', 'harbor', 'south-bay-refineries', 'civic-center', 'historic-core', 'wallace-vernon', 'coastal-strip', 'south-la-megablocks', 'hollywood'])", 'streetLamps.ts');
  const spin = src('src/vehicles/spinnerModel.ts');
  must(spin, 'export const SPINNER_DIMS = { length: 5.0, width: 2.3, height: 1.45 }', 'spinnerModel.ts');
  const dress = src('src/districts/historic-core/dress.ts');
  must(dress, 'const RICKSHAW_H = 1.45', 'historic-core/dress.ts');
  must(dress, 'y: b.ground + RICKSHAW_H / 2', 'historic-core/dress.ts');
  must(dress, 'sx: 0.28, sy: 1.6, sz: 0.28', 'historic-core/dress.ts');
  const kit = src('src/districts/_shared/kit/templates.ts');
  must(kit, 'Centered box', 'templates.ts');
  const traffic = src('src/vehicles/groundTraffic.ts');
  must(traffic, 'sx: 0.62, sy: 1.05, sz: 0.59, len: MESH_LEN.car * 0.59', 'groundTraffic.ts');
  must(traffic, 'new BoxGeometry(0.16, 5.45, 0.16).translate(0, 2.72, 0)', 'groundTraffic.ts');
  const apron = src('src/districts/coastal-strip/apronPlan.ts');
  must(apron, 'export const STEP_NOSING = 0.02', 'apronPlan.ts');
  must(apron, 'planFlight(rise)', 'apronPlan.ts');
  const brad = src('src/districts/historic-core/bradbury.ts');
  must(brad, 'const H = 22.4', 'bradbury.ts');
  must(brad, 'const DOOR_H = 2.2', 'bradbury.ts');
  must(brad, 'const JACKET_H = 27', 'bradbury.ts');
  const bridge = src('src/districts/historic-core/bridge.ts');
  must(bridge, 'const DECK = 11.2', 'bridge.ts');
  must(bridge, 'const STEPS = FLIGHT.risers', 'bridge.ts');
  must(bridge, 'const TREAD = FLIGHT.tread', 'bridge.ts');
  must(bridge, 'const DANCER_H = 68', 'bridge.ts');
  const gantry = src('src/districts/lax-spaceport/gantry.ts');
  must(gantry, 'const MAST = 30', 'gantry.ts');
  must(gantry, 'const shaftTop = height - MAST', 'gantry.ts');
  must(gantry, 'top: height', 'gantry.ts');
  const sat = src('src/districts/wallace-vernon/satellite.ts');
  must(sat, 'const mastH = 36', 'satellite.ts');
  must(sat, 'const bodyH = p.height - crownH - mastH', 'satellite.ts');
  const veil = src('src/districts/hollywood/sign.ts');
  must(veil, 'const PYLON_H = 50', 'sign.ts');
  must(veil, 'const PANEL_H = 42', 'sign.ts');
  const market = src('src/districts/little-tokyo-market/dress.ts');
  must(market, 'const SOFFIT = 2.35', 'dress.ts');
  must(market, 'const deckY = 4.05', 'dress.ts');
  must(market, 'const run = flight.tread', 'dress.ts');
  must(market, 'b.ground + 2.05', 'dress.ts');
  const flare = src('src/world/landmarks/Landmarks.ts');
  must(flare, 'const h = l.height * r.range(0.6, 1.1)', 'Landmarks.ts');
  for (const [id, share] of Object.entries(CROWD)) {
    if (id === 'little-tokyo-market') {
      must(crowd, `registerCrowdSource('little-tokyo-market', marketSource, ${share})`, 'crowd.ts');
      continue;
    }
    const file = crowdFile(id);
    const body = src(file);
    if (id === 'east-la') must(body, `}, ${share});`, file);
    else must(body, `registerCrowdSource('${id}'`, file), must(body, `}, ${share});`, file);
  }
}

function crowdFile(id: string): string {
  const map: Record<string, string> = {
    dtla: 'src/districts/dtla/crowd.ts',
    'financial-megatowers': 'src/districts/dtla/crowd.ts',
    'historic-core': 'src/districts/historic-core/crowd.ts',
    'civic-center': 'src/districts/civic-center/crowd.ts',
    'k-megablock': 'src/districts/k-megablock/crowd.ts',
    'lakewood-megablocks': 'src/districts/lakewood-megablocks/crowd.ts',
    'south-la-megablocks': 'src/districts/south-la-megablocks/crowd.ts',
    westside: 'src/districts/westside/crowd.ts',
    'basin-sprawl': 'src/districts/basin-sprawl/crowd.ts',
    'east-la': 'src/districts/east-la/crowd.ts',
    'arts-district': 'src/districts/arts-district/crowd.ts',
    'southeast-industrial': 'src/districts/southeast-industrial/crowd.ts',
    hollywood: 'src/districts/hollywood/crowd.ts',
    'south-bay-refineries': 'src/districts/south-bay-refineries/crowd.ts',
    harbor: 'src/districts/harbor/crowd.ts',
    'long-beach': 'src/districts/long-beach/crowd.ts',
  };
  const f = map[id];
  if (!f) throw new Error(id);
  return f;
}

function numConst(text: string, name: string): number {
  const hit = text.match(new RegExp(`export const ${name} = (\\d+(?:\\.\\d+)?)`));
  if (!hit) throw new Error(`missing ${name}`);
  return +hit[1]!;
}

function agree(name: string, authored: number, measured: number): void {
  if (Math.abs(authored - measured) > 0.05) {
    throw new Error(`${name} authored ${authored} vs bounds ${measured}`);
  }
}

function parseVehicles(): Record<string, Extents> {
  const text = src('src/vehicles/vehicleModels.ts');
  const build = sliceFn(text, 'function build()');
  const ids = ['van', 'box', 'tanker'] as const;
  const out: Record<string, Extents> = {};
  for (const id of ids) {
    const key = id === 'box' ? 'const truck = merged' : `const ${id} = merged`;
    const i = build.indexOf(key);
    if (i < 0) throw new Error(`vehicle block ${id}`);
    const next = build.indexOf('const ', i + key.length);
    out[id] = boxExtents(build.slice(i, next < 0 ? build.length : next));
  }
  const tank = build.match(/CylinderGeometry\((\d+(?:\.\d+)?),\s*\1,\s*(\d+(?:\.\d+)?)\)/);
  const moved = build.match(/shell\.translate\(0,\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/);
  if (tank && moved) {
    const radius = +tank[1]!;
    const y = +moved[1]!;
    out.tanker!.top = Math.max(out.tanker!.top, y + radius);
  }
  const bounds = JSON.parse(readFileSync(join(ROOT, 'public/models/traffic/bounds.json'), 'utf8')) as {
    car: { length: number; width: number; roof: number };
    hauler: { length: number; width: number; roof: number };
  };
  const carL = numConst(text, 'CAR_L');
  const carW = numConst(text, 'CAR_W');
  const carH = numConst(text, 'CAR_H');
  const haulerL = numConst(text, 'HAULER_L');
  const haulerW = numConst(text, 'HAULER_W');
  const haulerH = numConst(text, 'HAULER_H');
  agree('car length', carL, bounds.car.length);
  agree('car width', carW, bounds.car.width);
  agree('car roof', carH, bounds.car.roof);
  agree('hauler length', haulerL, bounds.hauler.length);
  agree('hauler width', haulerW, bounds.hauler.width);
  agree('hauler roof', haulerH, bounds.hauler.roof);
  out.car = { top: bounds.car.roof, length: bounds.car.length, width: bounds.car.width, boxes: 0 };
  out.hauler = { top: bounds.hauler.roof, length: bounds.hauler.length, width: bounds.hauler.width, boxes: 0 };
  return out;
}

function canyonRickshaw(): { sx: number; sy: number; sz: number; lenFactor: number } {
  const text = src('src/vehicles/groundTraffic.ts');
  const hit = text.match(/sx:\s*([\d.]+),\s*sy:\s*([\d.]+),\s*sz:\s*([\d.]+),\s*len:\s*MESH_LEN\.car\s*\*\s*([\d.]+)/);
  if (!hit) throw new Error('canyon rickshaw scale');
  return { sx: +hit[1]!, sy: +hit[2]!, sz: +hit[3]!, lenFactor: +hit[4]! };
}

function parseSpinner(): { length: number; width: number; top: number; authoredH: number } {
  const text = src('src/vehicles/spinnerModel.ts');
  const body = sliceFn(text, 'export function spinnerGeometries()');
  const boxes = [...body.matchAll(/BoxGeometry\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)\.translate\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/g)];
  let top = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const hit of boxes) {
    const w = +hit[1]!, h = +hit[2]!, d = +hit[3]!, x = +hit[4]!, y = +hit[5]!, z = +hit[6]!;
    top = Math.max(top, y + h / 2);
    minX = Math.min(minX, x - w / 2);
    maxX = Math.max(maxX, x + w / 2);
    minZ = Math.min(minZ, z - d / 2);
    maxZ = Math.max(maxZ, z + d / 2);
  }
  const ys = [...body.matchAll(/\[(-?\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\]/g)].map((h) => +h[2]!);
  if (ys.length) top = Math.max(top, ...ys);
  const L = 2.5;
  minZ = Math.min(minZ, -L);
  maxZ = Math.max(maxZ, L);
  // Hull extrude is 2.1 wide, centred. Pods can stick out past that.
  minX = Math.min(minX, -1.05);
  maxX = Math.max(maxX, 1.05);
  return { length: maxZ - minZ, width: maxX - minX, top, authoredH: 1.45 };
}

function flareMax(l: Landmark): number {
  const r = new Rng(hashString(l.id));
  let max = 0;
  for (let i = 0; i < 14; i++) {
    r.range(-l.baseWidth / 2, l.baseWidth / 2);
    r.range(-(l.baseDepth ?? 800) / 2, (l.baseDepth ?? 800) / 2);
    const h = l.height * r.range(0.6, 1.1);
    max = Math.max(max, h);
    if (r.chance(0.6)) r.range(8, 22);
  }
  return max;
}

function doorH(corridorH: number, corridorW: number): { h: number; w: number } {
  return { h: Math.min(2.2, corridorH - 0.2), w: Math.min(1.4, corridorW - 0.3) };
}

interface Seed { x: number; z: number }

function* seeds(layout: CityLayout, id: string): Generator<Seed> {
  if (id === 'hills-sparse') {
    for (const h of layout.hills) yield { x: h.x, z: h.z };
    return;
  }
  if (id === 'basin-sprawl') {
    const p = layout.poiById('basin-strip');
    if (p) {
      yield p;
      for (let r = 250; r <= 2500; r += 250) {
        yield { x: p.x + r, z: p.z };
        yield { x: p.x - r, z: p.z };
        yield { x: p.x, z: p.z + r };
        yield { x: p.x, z: p.z - r };
      }
    }
    return;
  }
  for (const p of layout.pois) {
    if (layout.districtAt(p.x, p.z).id === id && layout.heightAt(p.x, p.z) <= 45 && !layout.isOcean(p.x, p.z)) yield p;
  }
  const d = layout.districts.find((x) => x.id === id);
  if (!d) return;
  const [x0, z0, x1, z1] = d.bbox;
  const step = Math.max(280, Math.min(700, (x1 - x0) / 8));
  for (let x = x0 + step * 0.5; x < x1; x += step) {
    for (let z = z0 + step * 0.5; z < z1; z += step) {
      if (layout.districtAt(x, z).id !== id) continue;
      if (layout.isOcean(x, z)) continue;
      if (layout.heightAt(x, z) > 45) continue;
      yield { x, z };
    }
  }
}

function sampleDistrict(layout: CityLayout, id: string): { sample: Sample; boxes: Box[]; signs: Sign[]; grounds: number[] } | null {
  let tries = 0;
  for (const seed of seeds(layout, id)) {
    if (++tries > 48) break;
    const win = 700;
    const near = enumerateBlocks(layout, seed.x - win / 2, seed.z - win / 2, win).filter((b) =>
      id === 'hills-sparse' ? b.archetype === 'hills-sparse' : b.district.id === id && b.archetype !== 'hills-sparse',
    );
    near.sort((a, b) => Math.hypot(a.cx - seed.x, a.cz - seed.z) - Math.hypot(b.cx - seed.x, b.cz - seed.z));
    const boxes: Box[] = [];
    const signs: Sign[] = [];
    const grounds: number[] = [];
    let used = 0;
    for (const b of near) {
      if (used >= 6 && boxes.length >= 12) break;
      if (used >= 10) break;
      const fab = generateFabric(layout, b.cx - 0.2, b.cz - 0.2, 0.4);
      if (!fab.boxes.length && !fab.signs.length) continue;
      used++;
      boxes.push(...fab.boxes);
      signs.push(...fab.signs);
      for (let i = 0; i < fab.boxes.length; i++) grounds.push(b.ground);
    }
    if (boxes.length >= 4 || (id === 'hills-sparse' && boxes.length >= 1) || (id === 'wallace-vernon' && boxes.length >= 1)) {
      return {
        sample: { x: seed.x, z: seed.z, ground: layout.heightAt(seed.x, seed.z), blocks: used, boxes: boxes.length, signs: signs.length },
        boxes, signs, grounds,
      };
    }
  }
  return null;
}

function freewayLine(): string {
  return freewayRoutes().map((f) => `${f.id} ${f.spacing} m × ${f.lanes}`).join('; ');
}

function vehicleRows(id: string, lane: number | undefined, kind: string | undefined, mesh: Record<string, Extents>): Row[] {
  const rows: Row[] = [];
  const graph = lane !== undefined && !NO_STREET_GRAPH.has(id);
  if (!graph) {
    rows.push(custom(
      'Ground vehicles',
      'no street graph',
      'cars only where a lattice exists',
      'pass', '—',
      'src/vehicles/trafficRegistry.ts NO_STREET_GRAPH',
      'vehicles',
      id === 'little-tokyo-market'
        ? 'The market has no lattice. The bible sends it pedestrians, umbrellas and bikes.'
        : 'This district never receives ground-traffic edges.',
    ));
  } else {
    const mix = kind === 'canyon' || (lane !== undefined && lane < 5) ? 'canyon' : (MIX[id] ?? 'car');
    const car = mesh.car!;
    const showsCar = mix === 'canyon' || mix.includes('car') || id === 'lax-spaceport';
    if (showsCar) {
      const roof = scoreRange(car.top, 1.4, 1.55);
      const len = scoreRange(car.length, 4.5, 5.6);
      const width = car.width <= 1.82
        ? { verdict: 'pass' as const, severity: '—' as const }
        : { verdict: 'fail' as const, severity: 'high' as const };
      rows.push(row(
        'Compact car, visual roof',
        `${m(car.top)} roof, ${m(car.length)} long, ${m(car.width)} wide`,
        'real sedan roof 1.40–1.55 m, length 4.5–5.6 m, width ≤ 1.82 m',
        worse(worse(roof, len), width),
        'public/models/traffic/bounds.json; vehicleModels.ts CAR_L/W/H',
        'vehicles',
        'The glTF is the mesh. Width stays inside the 1.82 m body D7’s driving line assumes.',
      ));
      rows.push(row(
        'Compact car vs bible height',
        m(car.top),
        'bible 1.47 m',
        scoreNear(car.top, 1.47, 0.04),
        'docs/BIBLE.md ground vehicles; vehicleModels.ts',
        'vehicles',
        'Bible height is the measured roof, rounded.',
      ));
    }
    if (mix === 'canyon') {
      const scale = canyonRickshaw();
      const roof = car.top * scale.sy;
      const len = car.length * scale.lenFactor;
      const wid = car.width * scale.sx;
      rows.push(row(
        'Canyon rickshaw scale',
        `${m(roof)} roof, ${m(len)} long, ${m(wid)} wide (28% of cars)`,
        'rickshaw about 1.4–1.8 m tall and 2.5–3.2 m long',
        worse(scoreRange(roof, 1.4, 1.8), scoreRange(len, 2.5, 3.2)),
        'src/vehicles/groundTraffic.ts style() sx 0.62 sy 1.05 sz 0.59',
        'vehicles',
        'Applied when the edge kind is canyon or the driving line is under 5 m. The car mesh is scaled; it is not a second model.',
      ));
    }
    if (mix.includes('van') || mix === 'van') {
      const van = mesh.van!;
      rows.push(row(
        'Van, visual',
        `${m(van.top)} roof, ${m(van.length)} long, ${m(van.width)} wide`,
        'real van roof 1.8–2.6 m, length 5.0–6.2 m',
        scoreRange(van.top, 1.8, 2.6),
        'src/vehicles/vehicleModels.ts van boxes',
        'vehicles',
        'MESH_LEN.van is 5.55 m (bible). Visual length is the merged boxes.',
      ));
    }
    if (mix.includes('box') || mix === 'box') {
      const box = mesh.box!;
      rows.push(row(
        'Box truck, visual',
        `${m(box.top)} roof, ${m(box.length)} long`,
        'real box truck roof 2.8–3.8 m, length 6–10 m',
        scoreRange(box.top, 2.8, 3.8),
        'src/vehicles/vehicleModels.ts box boxes',
        'vehicles',
        'MESH_LEN.box is 7.9 m (bible traffic length).',
      ));
    }
    if (mix.includes('tanker') || mix === 'tanker') {
      const t = mesh.tanker!;
      rows.push(row(
        'Tanker, visual',
        `${m(t.top)} roof, ${m(t.length)} long`,
        'real tanker overall height about 3.2–4.0 m',
        scoreRange(t.top, 3.2, 4.0),
        'src/vehicles/vehicleModels.ts tanker',
        'vehicles',
        'MESH_LEN.tanker is 10.8 m. The shell is a 1.05 m radius cylinder.',
      ));
    }
    if (mix === 'hauler') {
      const h = mesh.hauler!;
      const height = scoreRange(h.top, 3.5, 4.2);
      const length = scoreRange(h.length, 14, 18);
      const half = h.width / 2 <= 1.16
        ? { verdict: 'pass' as const, severity: '—' as const }
        : { verdict: 'fail' as const, severity: 'high' as const };
      const lane = h.width < 3.55
        ? { verdict: 'pass' as const, severity: '—' as const }
        : { verdict: 'fail' as const, severity: 'high' as const };
      rows.push(row(
        'Hauler, visual',
        `${m(h.top)} roof, ${m(h.length)} long, ${m(h.width)} wide`,
        'real articulated truck height 3.5–4.2 m, length 14–18 m, half-width ≤ 1.16 m',
        worse(worse(worse(height, length), half), lane),
        'public/models/traffic/bounds.json; vehicleModels.ts HAULER_L/W/H',
        'vehicles',
        'Half-width stays inside the 1.16 m of asphalt between a driving line and the curb. The body is narrower than a 3.55 m lane.',
      ));
    }
  }
  const sp = parseSpinner();
  const lenScore = scoreRange(sp.length, 4.5, 5.6);
  rows.push(row(
    'Traffic spinner',
    `${m(sp.length)} long, ${m(sp.width)} wide, ${m(sp.top)} high`,
    'length 4.5–5.6 m; cabin about 1.2–1.8 m',
    sp.top >= 1.2 && sp.top <= 1.8 && lenScore.verdict === 'pass' ? { verdict: 'pass', severity: '—' } : lenScore,
    'src/vehicles/spinnerModel.ts spinnerGeometries / SPINNER_DIMS',
    'vehicles',
    `Authored SPINNER_DIMS are 5.0 × 2.3 × 1.45 m. Pods reach about ${m(sp.width)}. The player craft is the glTF spinner; traffic uses this procedural mesh. Width vs the 2.3 m field is ${m(sp.width)}.`,
  ));
  return rows;
}

function peopleRows(id: string, person: { head: number; hat: number }): Row[] {
  const rows: Row[] = [];
  const share = CROWD[id] ?? 0;
  rows.push(row(
    'Pedestrian head',
    m(person.head),
    '1.60–1.90 m',
    scoreRange(person.head, 1.6, 1.9),
    'src/districts/little-tokyo-market/crowd.ts personGeometry',
    'people',
    'One shared mesh. WalkController HUMAN is eye 1.7 m, height 1.8 m, walk 1.5 m/s, run 4.2 m/s.',
  ));
  rows.push(row(
    'Pedestrian hat',
    m(person.hat),
    '1.60–1.90 m to the top of the head; a hat may add a little',
    person.hat <= 1.95 && person.hat >= 1.6 ? { verdict: 'watch', severity: 'low' } : scoreRange(person.hat, 1.6, 1.9),
    'src/districts/little-tokyo-market/crowd.ts hat box',
    'people',
    'The crown box is centred at 1.86 m with height 0.12 m.',
  ));
  if (share > 0) {
    rows.push(pass(
      'Crowd share',
      String(share),
      'registered crowd using the 1.80 m mesh',
      `registerCrowdSource share ${share}`,
      'people',
      'Share scales how many of the tier budget this district keeps. It does not scale the mesh.',
    ));
  } else {
    rows.push(custom(
      'Crowd share',
      'not registered (0)',
      'a street crowd where people should read',
      'watch', 'medium',
      'src/districts/little-tokyo-market/crowd.ts registerCrowdSource',
      'people',
      'No source calls registerCrowdSource for this district, so the player sees none of the 1.80 m mesh here.',
    ));
  }
  return rows;
}

function lampRow(id: string): Row {
  const off = new Set(['little-tokyo-market', 'lax-spaceport', 'harbor', 'south-bay-refineries', 'civic-center', 'historic-core', 'wallace-vernon', 'coastal-strip', 'south-la-megablocks', 'hollywood']);
  if (off.has(id)) {
    return custom(
      'Shared street lamp',
      'suppressed (NO_LAMPS)',
      'a 6–12 m pole where the district has no replacement',
      'watch', 'low',
      'src/districts/_shared/streetLamps.ts NO_LAMPS / POLE_H 7.5',
      'lamps',
      'The shared pole is 7.5 m (head near the top). This district is in NO_LAMPS, so that pole is not drawn.',
    );
  }
  return row(
    'Shared street lamp',
    '7.5 m pole',
    'arterial pole 6–12 m',
    scoreRange(7.5, 6, 12),
    'src/districts/_shared/streetLamps.ts POLE_H',
    'lamps',
    'Spacing 32 m. Curb inset is min(2.2, street × 0.18). The mesh is translated so the pole stands on the ground.',
  );
}

function signRows(signs: Sign[]): Row[] {
  if (!signs.length) {
    return [custom('Street signs', 'none in the fabric sample', 'panels about 0.6–4 m', 'watch', 'low', 'fabric Sign.h', 'signs', 'The sample window had no sign records. Landmark signs are listed with the landmark.')];
  }
  const by = (k: number) => signs.filter((s) => s.kind === k).map((s) => s.h);
  const rows: Row[] = [];
  const flat = by(0);
  const blade = by(1);
  const board = by(2);
  if (flat.length) {
    const h = median(flat);
    rows.push(row('Flat sign panel', `${m(h)} median (${flat.length} in sample)`, '0.6–4 m street panel', scoreRange(h, 0.6, 4), 'fabric Sign.h kind 0', 'signs'));
  }
  if (blade.length) {
    const h = median(blade);
    rows.push(row('Blade sign', `${m(h)} median (${blade.length} in sample)`, '2–8 m blade', scoreRange(h, 2, 8), 'fabric Sign.h kind 1', 'signs'));
  }
  if (board.length) {
    const h = median(board);
    rows.push(row('Billboard panel', `${m(h)} median (${board.length} in sample)`, 'a billboard, not a door or a person', h > 20 ? { verdict: 'watch', severity: 'low' } : { verdict: 'pass', severity: '—' }, 'fabric Sign.h kind 2', 'signs', 'Kind 2 is a figure panel. Height is the board, not a storey.'));
  }
  return rows;
}

function extraRows(id: string, layout: CityLayout): Row[] {
  const rows: Row[] = [];
  if (id === 'little-tokyo-market') {
    rows.push(row('Noodle-bar soffit', '2.62 m', 'door / shop opening 2.0–2.4 m', scoreRange(2.62, 2.0, 2.4), 'src/districts/little-tokyo-market/dress.ts SOFFIT', 'doors', 'Shop opening under the stall, not a leaf door.'));
    const rise = 4.05 / 12;
    rows.push(row('Catwalk stair rise', m(rise, 3), '0.15–0.18 m', scoreRange(rise, 0.15, 0.18), 'src/districts/little-tokyo-market/dress.ts deckY / steps', 'stairs', '12 risers to a 4.05 m deck. Tread run is 0.42 m (real tread about 0.25–0.32 m).'));
    rows.push(row('Catwalk tread', '0.42 m', '0.25–0.32 m', scoreRange(0.42, 0.25, 0.32), 'src/districts/little-tokyo-market/dress.ts run', 'stairs'));
    rows.push(row('Catwalk rail', '0.55 m above the deck', '0.90–1.10 m', scoreRange(0.55, 0.9, 1.1), 'src/districts/little-tokyo-market/dress.ts rail at deckY+0.55', 'rails', 'Centered box, sy 0.08, so the rail occupies about 0.51–0.59 m. Walk mode steps up 0.45 m, so this rail can be stepped over.'));
    rows.push(row('Market lamp', '4.1 m', 'pedestrian lamp 3.5–6 m', scoreRange(4.1, 3.5, 6), 'src/districts/little-tokyo-market/dress.ts cyl sy 4.1 at ground+2.05', 'lamps', 'Cylinder is centered, and the placement adds half the height, so it stands from the ground to 4.1 m.'));
  }
  if (id === 'historic-core') {
    rows.push(row('Bradbury street door', '7.2 m high, 4.8 m wide', 'human door 2.0–2.4 m', scoreRange(7.2, 2.0, 2.4), 'src/districts/historic-core/bradbury.ts DOOR_H / DOOR', 'doors', 'Heritage portal on the street face.'));
    rows.push(row('Bradbury service door', '2.8 m high, 2.1 m wide', '2.0–2.4 m', scoreRange(2.8, 2.0, 2.4), 'src/districts/historic-core/interior.ts service door y −0.2 to 2.6, hw 1.05', 'doors'));
    rows.push(custom('Bradbury masonry front', '22.4 m', 'JSON height 27 m is the jacket, not this stone front', 'watch', 'medium', 'src/districts/historic-core/bradbury.ts H', 'landmarks', 'JACKET_H is 27 m and matches the JSON height. The stone front the player reads from the street is 22.4 m.'));
    rows.push(pass('Bradbury jacket', '27 m', 'JSON height 27 m', 'src/districts/historic-core/bradbury.ts JACKET_H', 'landmarks'));
    const rise = 11.2 / 32;
    rows.push(row('Footbridge stair rise', m(rise, 3), 'real 0.15–0.18 m', scoreRange(rise, 0.15, 0.18), 'src/districts/historic-core/bridge.ts DECK/STEPS', 'stairs', 'Bible records 32 × 0.35 m. That lore row is the next one.'));
    rows.push(pass('Footbridge stair vs bible', `${m(rise, 3)} × 32, tread 0.34 m`, 'bible 32 × 0.35 m', 'src/districts/historic-core/bridge.ts', 'stairs', 'Authored flight matches the bible and not a real riser.'));
    rows.push(row('Footbridge tread', '0.34 m', '0.25–0.32 m', scoreRange(0.34, 0.25, 0.32), 'src/districts/historic-core/bridge.ts TREAD', 'stairs'));
    rows.push(row('Footbridge rail', '1.05 m', '0.90–1.10 m', scoreRange(1.05, 0.9, 1.1), 'src/districts/historic-core/bridge.ts rail box h 1.05', 'rails'));
    rows.push(pass('Footbridge deck', '11.2 m', 'JSON / bible deck 11.2 m', 'src/districts/historic-core/bridge.ts DECK', 'landmarks'));
    rows.push(custom('Dancer hologram', '68 m tall, 15 m wide', 'a pedestrian is 1.6–1.9 m; this is a billboard', 'watch', 'low', 'src/districts/historic-core/bridge.ts DANCER_H', 'people', 'Bible: the figure is not on the deck. It stands in the Broadway intersection. Not a person mesh.'));
    const rickshawH = numConst(src('src/districts/historic-core/dress.ts').replace('const RICKSHAW_H', 'export const RICKSHAW_H'), 'RICKSHAW_H');
    rows.push(row('Parked rickshaw prop', `${m(rickshawH)} above the ground`, 'rickshaw body about 1.2–1.6 m', scoreRange(rickshawH, 1.2, 1.6), 'src/districts/historic-core/dress.ts RICKSHAW_H at y ground + half', 'vehicles', 'Kit boxes are centered. The prop is lifted by half its height, so the body stands on the street and the lamp sits on the roof.'));
    const bollard = src('src/districts/historic-core/dress.ts').match(/sx: 0\.28, sy: (\d+(?:\.\d+)?), sz: 0\.28/);
    const bollardTop = bollard ? +bollard[1]! / 2 : NaN;
    rows.push(row('Canyon bollard', `${m(bollardTop)} above the ground`, 'bollard 0.6–1.0 m', scoreRange(bollardTop, 0.6, 1.0), 'src/districts/historic-core/dress.ts cyl sy 1.6 at y ground', 'lamps', 'Same centered-mesh placement. Visible height is sy/2.'));
  }
  if (id === 'civic-center') {
    const riser = (STAIR.y1 - STAIR.y0) / STAIR.n;
    const tread = Math.abs(STAIR.z0 - STAIR.z1) / STAIR.n;
    rows.push(row('LAPD stair rise', m(riser, 3), '0.15–0.18 m', scoreRange(riser, 0.15, 0.18), 'src/districts/civic-center/spec.ts STAIR', 'stairs'));
    rows.push(row('LAPD stair tread', m(tread, 3), '0.25–0.32 m', scoreRange(tread, 0.25, 0.32), 'src/districts/civic-center/spec.ts STAIR', 'stairs', `${STAIR.n} treads from z ${STAIR.z0} to ${STAIR.z1}.`));
    const hr = (HALL_STAIR.y1 - HALL_STAIR.y0) / HALL_STAIR.n;
    const ht = Math.abs(HALL_STAIR.z0 - HALL_STAIR.z1) / HALL_STAIR.n;
    rows.push(row('City Hall stair rise', m(hr, 3), '0.15–0.18 m', scoreRange(hr, 0.15, 0.18), 'src/districts/civic-center/spec.ts HALL_STAIR', 'stairs'));
    rows.push(row('City Hall stair tread', m(ht, 3), '0.25–0.32 m', scoreRange(ht, 0.25, 0.32), 'src/districts/civic-center/spec.ts HALL_STAIR', 'stairs'));
    rows.push(row('LAPD lobby opening', `${HQ.doorHalf * 2} m wide, headroom to ${HQ.lobbyCeil} m`, 'human door 2.0–2.4 m', scoreRange(HQ.doorHalf * 2, 2.0, 2.4), 'src/districts/civic-center/spec.ts HQ.doorHalf', 'doors', `Lobby floor is ${HQ.lobbyFloor} m. The opening is a mouth, not a leaf.`));
    rows.push(pass('LAPD height', `${HQ.height} m`, 'JSON / bible 216 m', 'src/districts/civic-center/spec.ts HQ.height', 'landmarks'));
    rows.push(pass('City Hall height', `${HALL.height} m`, 'JSON / bible 138 m to the lamp', 'src/districts/civic-center/spec.ts HALL.height', 'landmarks'));
  }
  if (id === 'k-megablock') {
    const lobby = LOBBY.backDoor;
    rows.push(row('Lobby back door', `${lobby.width} × ${lobby.height} m`, '2.0–2.4 m high', scoreRange(lobby.height, 2.0, 2.4), 'src/districts/k-megablock/spec.ts LOBBY.backDoor', 'doors'));
    const apt = doorH(APARTMENT.corridor.height, APARTMENT.corridor.width);
    rows.push(row('Apartment template door', `${m(apt.w)} × ${m(apt.h)}`, '2.0–2.4 m high, about 0.8–1.0 m wide', scoreRange(apt.h, 2.0, 2.4), 'src/world/interiors/template.ts doorH; k spec APARTMENT.corridor', 'doors', `Corridor is ${APARTMENT.corridor.height} m, so the template caps the leaf at min(2.2, height − 0.2). Width is min(1.4, width − 0.3) = ${m(apt.w)}.`));
    rows.push(row('Lift door', `${LIFT.w} × ${LIFT.h} m`, 'lift opening about 2.0–2.3 m', scoreRange(LIFT.h, 2.0, 2.3), 'src/districts/k-megablock/spec.ts LIFT', 'doors'));
    rows.push(pass('Slab height', `${SLAB_H} m`, 'JSON / bible 185 m', 'src/districts/k-megablock/spec.ts SLAB_H', 'landmarks'));
    rows.push(pass("K's floor", `${K_Y} m (floor 40 × ${FLOOR} m)`, 'bible 136 m', 'src/districts/k-megablock/spec.ts K_Y', 'storeys'));
    rows.push(custom('Roof vs 54 modules', `${54 * FLOOR} m vs slab ${SLAB_H} m`, 'a whole number of 3.4 m floors', 'watch', 'low', 'src/districts/k-megablock/spec.ts FLOOR / SLAB_H', 'storeys', '54 × 3.4 = 183.6 m. The roof is 185 m, so the last band is not one module.'));
    rows.push(row('Floor module', `${FLOOR} m`, 'residential 3.1–3.6 m (bible) and about 3–4 m', scoreRange(FLOOR, 3, 4), 'src/districts/k-megablock/spec.ts FLOOR', 'storeys'));
    rows.push(custom('Corridor headroom', `${CORRIDOR.height} m`, 'a corridor can be 2.4 m', 'pass', '—', 'src/districts/k-megablock/spec.ts CORRIDOR.height', 'doors'));
    rows.push(row('Head house door', `${HEAD.backDoor.width} × ${HEAD.backDoor.height} m`, '2.0–2.4 m', scoreRange(HEAD.backDoor.height, 2.0, 2.4), 'src/districts/k-megablock/spec.ts HEAD.backDoor', 'doors'));
  }
  if (id === 'wallace-vernon') {
    rows.push(row('Court door', `${COURT.doorHalfW * 2} m × ${COURT.doorH} m`, '2.0–2.4 m', scoreRange(COURT.doorH, 2.0, 2.4), 'src/districts/wallace-vernon/spec.ts COURT.doorH', 'doors', 'Human door in front of the portal, on the 3 m deck.'));
    rows.push(row('Court stair rise', `${COURT.stairRise} m`, 'real 0.15–0.18 m', scoreRange(COURT.stairRise, 0.15, 0.18), 'src/districts/wallace-vernon/spec.ts COURT.stairRise', 'stairs', `${COURT.stairN} risers, tread ${COURT.stairTread} m. Bible allows this under the 0.45 m step-up.`));
    rows.push(pass('Court stair vs bible', `${COURT.stairRise} m`, 'bible under 0.45 m', 'src/districts/wallace-vernon/spec.ts COURT.stairRise', 'stairs'));
    rows.push(row('Court tread', `${COURT.stairTread} m`, '0.25–0.32 m', scoreRange(COURT.stairTread, 0.25, 0.32), 'src/districts/wallace-vernon/spec.ts COURT.stairTread', 'stairs', 'A ceremonial run, much deeper than a step.'));
    rows.push(row('Causeway bridge rail', '1.05 m', '0.90–1.10 m', scoreRange(1.05, 0.9, 1.1), 'src/districts/wallace-vernon/plaza.ts rail h 1.05', 'rails'));
    const step = pyramidStepH();
    const portalH = step * 1.25;
    const portalW = PYRAMID_BASE * 0.09;
    rows.push(custom(
      'Pyramid portal',
      `${m(portalW, 1)} wide, ${m(portalH, 1)} tall`,
      'monumental entrance, not a 2.0–2.4 m door',
      'watch', 'medium',
      'src/districts/_shared/megatower/pyramid.ts portalW / portalH',
      'doors',
      'The court door in front of it is the human opening. This glow is the north portal.',
    ));
  }
  if (id === 'hollywood') {
    rows.push(row('Lobby door', '2.4 m high, 2.1 m wide', '2.0–2.4 m', scoreRange(2.4, 2.0, 2.4), 'src/districts/hollywood/interior.ts placeVolume height 2.4, hw 1.05', 'doors'));
    rows.push(row('Street lobby mouth', '5.4 m wide', 'a door leaf is about 0.9–2.1 m; a lobby mouth can be wider', { verdict: 'watch', severity: 'medium' }, 'src/districts/hollywood/plan.ts DOOR_HALF_T 2.7', 'doors', 'The interior door is 2.1 m wide. The street gap is DOOR_HALF_T × 2.'));
    rows.push(row('Strip floor module', '4.4 m', '3–4 m floor; bible office band 4.0–5.5 m', { verdict: 'watch', severity: 'medium' }, 'src/districts/hollywood/spec.ts FLOOR', 'storeys'));
  }
  if (id === 'long-beach') {
    rows.push(row('Concourse door', '2.6 m high, 2.1 m wide', '2.0–2.4 m', scoreRange(2.6, 2.0, 2.4), 'src/districts/long-beach/interior.ts door y 0 to 2.6, hw 1.05', 'doors'));
    rows.push(row('Floor module', '5.0 m', '3–4 m floor; bible office band 4.0–5.5 m', { verdict: 'watch', severity: 'medium' }, 'src/districts/long-beach/spec.ts MODULE', 'storeys'));
  }
  if (id === 'lax-spaceport') {
    rows.push(row('Office module', '5.0 m', '3–4 m floor; bible office band 4.0–5.5 m', { verdict: 'watch', severity: 'medium' }, 'src/districts/lax-spaceport/spec.ts FLOOR', 'storeys'));
    rows.push(row('Flood mast', '16.5 m', 'apron floodlight 12–25 m', scoreRange(16.5, 12, 25), 'src/districts/lax-spaceport/spec.ts PYLON_H = 3 × BAY', 'lamps', 'Shared sodium is off. This is the apron mast, placed with its centre at half height so it stands on the ground.'));
  }
  if (id === 'south-bay-refineries') {
    rows.push(row('Control-room door', '2.4 m high, 1.5 m wide', '2.0–2.4 m', scoreRange(2.4, 2.0, 2.4), 'src/districts/south-bay-refineries/interior.ts placeVolume y 0 to 2.4, hw 0.75', 'doors'));
  }
  if (id === 'coastal-strip' || id === 'harbor') {
    const wall = layout.seaWalls.find((w) => (id === 'harbor' ? w.crestHeight === 75 : w.crestHeight === 90));
    if (wall) {
      rows.push(pass(
        id === 'harbor' ? 'Harbor wall crest' : 'Sepulveda wall crest',
        `${wall.crestHeight} m`,
        id === 'harbor' ? 'bible 75 m' : 'bible 90 m',
        'city-layout.json seaWalls.crestHeight',
        'landmarks',
      ));
    }
    rows.push(row('Sea-wall parapet', `${PARAPET_H} m × ${PARAPET_T} m`, 'crest parapet about 0.9–1.3 m', scoreRange(PARAPET_H, 0.9, 1.3), 'src/districts/coastal-strip/profile.ts PARAPET_H', 'rails', 'Sits on the crest. It is a wall, not a handrail. Bible: 1.15 m, above the 0.45 m step-up.'));
    if (id === 'coastal-strip') {
      const plan = planApron(layout);
      const steps = plan.solids.filter((s) => s.role === 'step');
      const risers = steps.map((s) => s.h);
      const maxR = Math.max(...risers);
      const med = median(risers);
      const goings = steps.map((s) => s.w - 0.02);
      const minG = Math.min(...goings);
      const maxG = Math.max(...goings);
      rows.push(row('Apron stair rise', `${m(med, 3)} median, ${m(maxR, 3)} max (${risers.length} treads)`, 'real 0.15–0.18 m', scoreRange(maxR, 0.15, 0.18), 'src/districts/coastal-strip/apronPlan.ts planFlight', 'stairs', 'Switchbacks run along the wall. Each riser is planFlight’s rise. Landings are decks, so they are not treads.'));
      rows.push(row('Apron stair going', `${m(minG, 3)} min, ${m(maxG, 3)} max`, '0.28–0.32 m', worse(scoreRange(minG, 0.28, 0.32), scoreRange(maxG, 0.28, 0.32)), 'src/districts/coastal-strip/apronPlan.ts STEP_NOSING', 'stairs', 'Going is the tread length along the wall, step width minus the 0.02 m nosing.'));
      rows.push(row('Terrace rail', '0.98 m to the top of an 0.08 m bar', '0.90–1.10 m', scoreRange(0.98, 0.9, 1.1), 'src/districts/coastal-strip/surface.ts rail at t.y+0.9', 'rails'));
    }
  }
  return rows;
}

function landmarkRows(layout: CityLayout): Map<string, Row[]> {
  const by = new Map<string, Row[]>();
  const add = (id: string, r: Row) => {
    const list = by.get(id) ?? [];
    list.push(r);
    by.set(id, list);
  };
  const homeOf = (l: Landmark): string => layout.districtAt(l.x, l.z).id;
  for (const l of layout.landmarks) {
    const home = homeOf(l);
    const homes = new Set<string>([home]);
    if (l.id.startsWith('wallace-') || l.type === 'old-pyramid') homes.add('wallace-vernon');
    if (l.type === 'skybridge' || l.type === 'megatower' || l.type === 'legacy-tower') homes.add('financial-megatowers');
    if (l.type === 'veil-mark') homes.add('hollywood');
    if (l.id === 'k-megablock-tower') homes.add('k-megablock');
    if (l.type === 'spaceport') homes.add('lax-spaceport');
    if (l.type === 'flare-field') homes.add('south-bay-refineries');

    const pushAll = (r: Row) => { for (const id of homes) add(id, r); };

    if (l.type === 'megatower' || l.type === 'legacy-tower') {
      const { plan, spec } = heroPlan(l.id, l.height, l.baseWidth, l.baseDepth ?? l.baseWidth);
      const parts = buildTower(plan, new CountingSink(3, true));
      const mast = spec.mast ?? 0;
      const loreTop = l.height + mast;
      pushAll(row(
        `${l.name} visual top`,
        m(parts.top, 1),
        mast > 0 ? `bible roof ${l.height} m + mast ${mast} m = ${loreTop} m` : `bible ${l.height} m (mast 0; flames sit above)`,
        scoreNear(parts.top, mast > 0 ? loreTop : l.height, 0.01),
        'src/districts/_shared/megatower/tower.ts buildTower parts.top',
        'landmarks',
        `JSON height is ${l.height} m. The mast is added on top of that roof. Sited in ${home}.`,
      ));
      if (mast > 0) {
        pushAll(custom(
          `${l.name} height field`,
          `JSON ${l.height} m, mesh top ${m(parts.top, 1)}`,
          'the height field is the roof; the mast is extra and listed in the bible',
          'watch', 'low',
          'src/data/city-layout.json height; tower.ts mast()',
          'landmarks',
          'Anyone reading only the height field will undershoot the silhouette by the mast.',
        ));
      }
    } else if (l.type === 'wallace-pyramid' || l.type === 'old-pyramid') {
      const look = l.type === 'wallace-pyramid' ? 'wallace' : 'old';
      const parts = buildPyramid({
        seed: 0.2,
        height: l.height,
        base: l.baseWidth,
        top: l.topWidth ?? (look === 'wallace' ? 420 : 140),
        tiers: look === 'wallace' ? 7 : 6,
        steps: 3,
        look,
        entrance: look === 'wallace' ? 2 : 3,
      }, new CountingSink(3, true));
      const expected = look === 'wallace' ? l.height + 110 : l.height + 70;
      pushAll(row(
        `${l.name} visual top`,
        m(parts.top, 1),
        look === 'wallace' ? `3500 m roof + 110 m mast = ${expected} m` : `published ${l.height} m + 70 m spire = ${expected} m`,
        scoreNear(parts.top, expected, 0.005),
        'src/districts/_shared/megatower/pyramid.ts parts.top',
        'landmarks',
        look === 'wallace'
          ? 'Bible calls the pyramid 3.5 km and also describes the 110 m mast. The mesh tip is the sum. Sited in ' + home + '.'
          : 'Bible height is the penthouse. The spire is parts.top = height + 70. Flame stacks sit near height + 46. Sited in ' + home + '.',
      ));
      pushAll(custom(
        `${l.name} height field`,
        `JSON ${l.height} m, mesh top ${m(parts.top, 1)}`,
        'published height versus the silhouette',
        'watch', 'low',
        'city-layout.json height; pyramid.ts',
        'landmarks',
      ));
    } else if (l.type === 'wallace-tower') {
      pushAll(pass(
        `${l.name} mast`,
        `inside published ${l.height} m (36 m mast subtracted before the body)`,
        `bible ${l.height} m with a 36 m mast inside that height`,
        'src/districts/wallace-vernon/satellite.ts bodyH = height − crown − mast',
        'landmarks',
        `Sited in ${home}, just outside the Wallace polygon if that is not the home district.`,
      ));
    } else if (l.type === 'spaceport') {
      pushAll(pass(
        'LAX gantry',
        `${l.height} m including the 30 m mast`,
        'bible 420 m including a 30 m mast',
        'src/districts/lax-spaceport/gantry.ts shaftTop = height − MAST; top = height',
        'landmarks',
      ));
    } else if (l.type === 'flare-field') {
      const max = flareMax(l);
      pushAll(row(
        'El Segundo stacks',
        `${m(max, 1)} tallest of 14 (published ${l.height} m)`,
        'bible stacks to 140 m',
        max <= l.height ? { verdict: 'pass', severity: '—' } : { verdict: 'watch', severity: 'medium' },
        'src/world/landmarks/Landmarks.ts flare-field h = height × range(0.6, 1.1)',
        'landmarks',
        'The loop can draw 1.1 × the published height, then a flare sprite 4 m above that.',
      ));
    } else if (l.type === 'veil-mark') {
      pushAll(row(
        'Veil Mark pylons',
        '50 m pylons on a 1.6 m plinth; pylon top 51.2 m above ground',
        'bible 50 m pylons; JSON height 52 m',
        scoreNear(51.2, 52, 0.02),
        'src/districts/hollywood/sign.ts PYLON_H',
        'landmarks',
        'Panels are 10.5 × 42 m. Beacons sit at ground + 52.4 m. The 52 m JSON field is the beacon band, not the panel.',
      ));
    } else if (l.type === 'skybridge') {
      pushAll(pass(
        `${l.name} deck`,
        `${l.height} m underside`,
        'JSON height is the deck, not a roof',
        'src/districts/financial-megatowers/landmarks.ts y: l.height',
        'landmarks',
        'Enclosure height is the landmark baseDepth (fallback 12 m) plus a 1.6 m roof on the tube.',
      ));
    } else if (l.type === 'lapd-hq') {
      pushAll(pass('LAPD JSON height', `${l.height} m`, 'bible 216 m', 'city-layout.json lapd-hq', 'landmarks'));
    } else if (l.type === 'heritage-tower') {
      pushAll(pass('City Hall JSON height', `${l.height} m`, 'bible 138 m', 'city-layout.json city-hall', 'landmarks'));
    } else if (l.type === 'bradbury-building') {
      pushAll(pass('Bradbury JSON height', `${l.height} m`, 'jacket 27 m', 'city-layout.json bradbury-building', 'landmarks'));
    } else if (l.type === 'canyon-bridge') {
      pushAll(pass('Bridge JSON deck', `${l.height} m`, '11.2 m', 'city-layout.json canyon-bridge', 'landmarks'));
    } else if (l.type === 'megablock-slab') {
      pushAll(pass('K slab JSON height', `${l.height} m`, 'bible 185 m', 'city-layout.json k-megablock-tower', 'landmarks'));
    }
  }
  return by;
}

function qualityNote(): { tiers: Array<Record<string, number | string>>; text: string } {
  const tiers = TIERS.map((t: Tier) => {
    const s = settingsFor(t);
    return {
      tier: t,
      detailScale: s.detailScale,
      farRadius: s.farRadius,
      groundTraffic: s.groundTraffic,
      crowd: s.crowd,
      crowdRadius: s.crowdRadius,
      landmarkLod: s.landmarkLod,
    };
  });
  return {
    tiers,
    text: 'Quality changes density and draw distance. It does not rescale metres. Low draws no ground cars (groundTraffic 0) and shortens farRadius to 4500 m; the map stays about 50 × 53 km. detailScale is 0.30 / 0.55 / 0.82 / 1 from low to ultra and only drops street-kit props. Phones never auto-pick high (medium or low). There is no world-scale factor.',
  };
}

function fabricRows(id: string, dStreet: number, got: { boxes: Box[]; signs: Sign[]; grounds: number[] } | null): Row[] {
  const rows: Row[] = [];
  const lore = LORE[id];
  if (!got) {
    rows.push(custom('Fabric sample', 'no masses found', 'a street of this district', 'watch', 'medium', 'src/world/fabric/generator.ts generateFabric', 'storeys', 'Reserves or ocean may have eaten the blocks that were searched.'));
    return rows;
  }
  const masses: Array<{ h: number; style: number }> = [];
  const hist = new Map<number, number>();
  for (let i = 0; i < got.boxes.length; i++) {
    const b = got.boxes[i]!;
    const g = got.grounds[i] ?? 0;
    const h = visualH(b, g);
    if (b.detail !== 0 || b.style === Style.Ground || h < 4) continue;
    masses.push({ h, style: b.style });
    hist.set(b.style, (hist.get(b.style) ?? 0) + 1);
  }
  let best = 0, bestN = 0;
  for (const [st, n] of hist) if (n > bestN) { best = st; bestN = n; }
  if (bestN > 0) {
    const ranked = [...hist.entries()].sort((a, b) => b[1] - a[1]);
    for (const [st, n] of ranked) {
      if (n < 5) continue;
      const cell = CELL_H[st] ?? 0;
      const sc = storeyScore(cell, st);
      if (st !== best && sc.scored.verdict === 'pass') continue;
      rows.push(row(
        st === best ? 'Façade storey' : `Façade storey (${STYLE_NAME[st]})`,
        `${STYLE_NAME[st]} ${m(cell)} (${n} masses)`,
        sc.expected,
        sc.scored,
        'src/world/windows/facade.ts CELL_H',
        'storeys',
        sc.note,
      ));
    }
    const hs = masses.map((x) => x.h);
    const med = median(hs);
    const band = lore?.mass ?? [3, 400];
    rows.push(row(
      'Sampled mass height',
      `${m(med, 1)} median of ${hs.length} detail-0 boxes`,
      `${band[0]}–${band[1]} m fabric band`,
      med >= band[0] && med <= band[1] ? { verdict: 'pass', severity: '—' } : { verdict: 'watch', severity: 'low' },
      'generateFabric visual height (slope sink of 8 m removed)',
      'storeys',
      `Sample range ${m(Math.min(...hs), 1)} to ${m(Math.max(...hs), 1)}. Heroes are landmarks and are not in this fabric sample.`,
    ));
  }
  rows.push(...signRows(got.signs));
  if (lore && id !== 'hills-sparse') {
    rows.push(row(
      'Street width',
      m(dStreet, 1),
      `bible ${lore.street} m`,
      scoreNear(dStreet, lore.street, 0.01),
      'src/data/city-layout.json grid.street',
      'lanes',
    ));
  }
  return rows;
}

function streetRows(id: string, street: number, lane: number | undefined, blockA: number | undefined, blockB: number | undefined, gridBlock: [number, number] | undefined, kind: string | undefined): Row[] {
  const rows: Row[] = [];
  const lore = LORE[id];
  if (lane === undefined) {
    rows.push(custom(
      'Driving line',
      'no lattice',
      'a centreline offset where cars are spawned',
      NO_STREET_GRAPH.has(id) || id === 'little-tokyo-market' || id === 'hills-sparse' ? 'pass' : 'watch',
      NO_STREET_GRAPH.has(id) || id === 'little-tokyo-market' || id === 'hills-sparse' ? '—' : 'low',
      'src/vehicles/trafficRegistry.ts',
      'lanes',
      id === 'hills-sparse' ? 'Hills keep the host district grid and do not add a lattice.' : 'No cars are placed on a driving line here.',
    ));
  } else {
    const loreLane = lore?.lane;
    rows.push(row(
      'Driving-line offset',
      `${m(lane)} from the centreline${kind === 'canyon' ? ' (canyon)' : ''}`,
      loreLane ? `bible ±${loreLane} m; not a 3.5–3.7 m painted lane` : 'centreline offset, not painted lane width',
      loreLane ? scoreNear(lane, loreLane, 0.01) : { verdict: 'pass', severity: '—' },
      'streetLattices().lane',
      'lanes',
      'The constant is metres from the street centreline to the car. Freeway spacing is the painted-lane module.',
    ));
    const side = sidewalkVerdict(street, lane);
    rows.push(row(
      'Implied sidewalk',
      m(side.implied),
      '1.5–4.5 m',
      side.scored,
      'derived: street/2 − lane − 1.8',
      'lanes',
      side.note,
    ));
    if (gridBlock && blockA && blockB && (Math.abs(gridBlock[0] - blockA) > 1 || Math.abs(gridBlock[1] - blockB) > 1)) {
      rows.push(custom(
        'Traffic grid vs fabric grid',
        `lattice ${blockA} × ${blockB} m, fabric ${gridBlock[0]} × ${gridBlock[1]} m`,
        'the same block the buildings use',
        'watch', 'medium',
        'street lattice blockA/blockB vs district.grid.block',
        'lanes',
        'Cars and façades are not on one grid if these differ.',
      ));
    }
  }
  const fw = freewayLine();
  const spacings = freewayRoutes().map((f) => f.spacing);
  const ok = spacings.every((s) => s >= 3.5 && s <= 3.7) || spacings.every((s) => s >= 3.45 && s <= 3.7);
  rows.push(row(
    'Freeway lane spacing',
    fw,
    '3.5–3.7 m',
    ok ? { verdict: 'pass', severity: '—' } : { verdict: 'watch', severity: 'low' },
    'src/vehicles/trafficBuiltins.ts spacing',
    'lanes',
    'Shared by the basin. US-101 is 3.45 m, just under the 3.5 m band. This is the only painted-lane module in the city.',
  ));
  // 3.45 is slightly under. If every other is inside and 101 is 3.45, scoreRange on 3.45.
  if (spacings.some((s) => s < 3.5)) {
    rows[rows.length - 1] = row(
      'Freeway lane spacing',
      fw,
      '3.5–3.7 m',
      { verdict: 'watch', severity: 'low' },
      'src/vehicles/trafficBuiltins.ts spacing',
      'lanes',
      'I-110 is 3.5, I-10 is 3.55, I-405 / I-5 / I-105 / I-710 are 3.6. US-101 is 3.45, a tenth under the band.',
    );
  }
  rows.push(pass(
    'Signal pole',
    '5.45 m pole, head centred at 5.52 m',
    'bible about 5.5 m; real signal about 4.5–6.5 m',
    'src/vehicles/groundTraffic.ts BoxGeometry 0.16 × 5.45',
    'lamps',
  ));
  rows.push(pass(
    'Quality rescale',
    'none',
    'metres stay put at every tier',
    'src/core/quality.ts settingsFor',
    'storeys',
    'detailScale, farRadius, crowd count and groundTraffic change. The city is not shrunk for a phone.',
  ));
  return rows;
}

function fixesOf(districts: DistrictReport[]): Array<Row & { districts: string[] }> {
  const map = new Map<string, Row & { districts: string[] }>();
  for (const d of districts) {
    for (const r of d.rows) {
      if (r.verdict === 'pass') continue;
      const key = [r.group, r.item, r.source, r.measured, r.expected, r.verdict, r.severity].join('|');
      const hit = map.get(key);
      if (hit) hit.districts.push(d.id);
      else map.set(key, { ...r, districts: [d.id] });
    }
  }
  const sev: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const group: Record<string, number> = { vehicles: 0, doors: 1, stairs: 2, rails: 3, storeys: 4, lanes: 5, signs: 6, people: 7, landmarks: 8, lamps: 9 };
  return [...map.values()].sort((a, b) =>
    (group[a.group] ?? 9) - (group[b.group] ?? 9)
    || (sev[a.severity] ?? 9) - (sev[b.severity] ?? 9)
    || b.districts.length - a.districts.length
    || a.item.localeCompare(b.item),
  );
}

export async function main(): Promise<void> {
  anchors();
  const layout = getLayout();
  const mesh = parseVehicles();
  const personBlock = sliceFn(src('src/districts/little-tokyo-market/crowd.ts'), 'function personGeometry()');
  const person = personTop(personBlock);
  if (Math.abs(person.head - 1.8) > 0.02) throw new Error(`head ${person.head}`);
  const laneBy = new Map<string, { lane: number; kind: string; blockA: number; blockB: number }>();
  for (const s of streetLattices()) {
    for (const id of s.districts) laneBy.set(id, { lane: s.lane, kind: s.kind, blockA: s.blockA, blockB: s.blockB });
  }
  const marks = landmarkRows(layout);
  const districts: DistrictReport[] = [];
  const list: Array<{ id: string; name: string; stage: number; archetype: string; street: number; block?: [number, number] }> = [
    ...layout.districts.map((d) => ({ id: d.id, name: d.name, stage: d.stage, archetype: d.archetype, street: d.grid.street, block: d.grid.block })),
    { id: layout.defaultDistrict.id, name: layout.defaultDistrict.name, stage: layout.defaultDistrict.stage, archetype: layout.defaultDistrict.archetype, street: layout.defaultDistrict.grid.street, block: layout.defaultDistrict.grid.block },
    { id: 'hills-sparse', name: 'Hills (sparse overlay)', stage: 22, archetype: 'hills-sparse', street: 0 },
  ];
  list.sort((a, b) => a.stage - b.stage || a.id.localeCompare(b.id));

  for (const d of list) {
    const t0 = Date.now();
    const got = sampleDistrict(layout, d.id);
    const spec = laneBy.get(d.id);
    const rows: Row[] = [];
    rows.push(...fabricRows(d.id, d.street, got));
    rows.push(...streetRows(d.id, d.id === 'hills-sparse' ? (got ? 0 : 0) : d.street, spec?.lane, spec?.blockA, spec?.blockB, d.block, spec?.kind));
    if (d.id === 'hills-sparse' && got) {
      rows.push(custom('Host street', 'hills replace the archetype above 45 m and keep the host grid', 'overlay, not a 21st polygon', 'pass', '—', 'src/world/fabric/generator.ts HILL_ARCHETYPE_THRESHOLD', 'lanes'));
    }
    rows.push(...vehicleRows(d.id, spec?.lane, spec?.kind, mesh));
    rows.push(...peopleRows(d.id, person));
    rows.push(lampRow(d.id));
    rows.push(...extraRows(d.id, layout));
    rows.push(...(marks.get(d.id) ?? []));
    districts.push({
      id: d.id,
      name: d.name,
      stage: d.stage,
      archetype: d.archetype,
      sample: got?.sample ?? null,
      rows,
    });
    console.log(`${d.id}: ${rows.length} rows, boxes ${got?.sample.boxes ?? 0} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  if (districts.length !== 21) throw new Error(`expected 21 places, got ${districts.length}: ${districts.map((d) => d.id).join(', ')}`);

  const quality = qualityNote();
  const doc = {
    generated: '2026-10-11',
    commit: process.env.AUDIT_COMMIT ?? '',
    places: districts.length,
    method: [
      'Engine units are metres. Origin 34.0522 N, 118.2437 W. +X east, +Z south, +Y up.',
      'Fabric is the same generateFabric the chunk worker runs. Each measured block is a window that contains only that block centre, so the boxes belong to one district.',
      'On slopes the generator sinks a grounded box by 8 m and adds 8 m to its height. Reported mass height subtracts that sink.',
      'Façade storey is CELL_H for the style that dominates detail-0 masses at least 4 m tall.',
      'A driving line is metres from the street centreline to the car. It is not a painted lane. Painted lanes exist on freeways as spacing 3.45–3.6 m.',
      'Implied sidewalk = street/2 − driving line − 1.8 m, assuming one 3.6 m lane centred on the driving line. On streets 30 m and wider that remainder is mostly unused carriageway.',
      'Kit props are centered meshes. A box placed at ground height is half buried.',
      'Landmark tops for megatowers and pyramids are buildTower / buildPyramid parts.top. Other landmarks are the constants those builders add, checked against the source.',
      'Vehicle and pedestrian sizes are parsed from the geometry calls. Those files import three.js and are not loaded here.',
      'Quality tiers do not multiply world metres. The low tier draws no ground cars and shortens view distance.',
    ],
    quality,
    districts,
    fixes: fixesOf(districts),
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(doc));
  const fails = doc.fixes.filter((f) => f.severity === 'high').length;
  console.log(`wrote ${OUT} (${districts.length} places, ${doc.fixes.length} fix rows, ${fails} high)`);
}
