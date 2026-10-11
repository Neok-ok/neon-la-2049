// Camera-following swell, the breaker spray, and the overtopping sheets.
// Low tier draws none of this. The far ocean stays the flat mesh in Landmarks.
// One clock (`waveClock`) drives the spray and `Ambience.setSurf`.
import {
  BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, FrontSide, Group, InstancedMesh, Matrix4, Mesh,
  MeshStandardNodeMaterial, PlaneGeometry, Quaternion, Vector3,
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TSL from 'three/tsl';
import type { CityLayout } from '../../world/layout';
import { U } from '../../atmosphere/uniforms';
import { setOceanStorm } from '../../world/materials/oceanMaterial';
import { planApron } from './apronPlan';
import {
  SEA_Y,
  coastBudget,
  framePoint,
  nearestWall,
  waterlineAcross,
  type WallFrame,
  type WallProfile,
  type WaveState,
} from './profile';
import { seawardAcross, type StormDrive } from './storm';

const T = TSL as any;
const {
  Fn, attribute, cameraPosition, cos, dot, exp, float, max, mix, normalize, positionLocal, positionWorld, pow, sin, smoothstep, step, uniform, vec3,
} = T;

const uTime = uniform(0);
const uAmp = uniform(0.4);
const uImpact = uniform(0);
const uStorm = uniform(0);
const uWet = uniform(0.2);
const uOvertop = uniform(0);
const uWaves = uniform(3);
/** Scales the per-wave steepness shares. 1 spends the full budget. */
const uSteep = uniform(1);

// Deep-water Gerstner sum. Travel is toward the wall (local −Z).
// ω = sqrt(g k). Each `steep` is that wave's share of Σ Q k A, so the sum stays under 1
// and crests fold (Jacobian drops) without the mesh looping through itself.
const G = 9.81;
function gw(x: number, z: number, k: number, a: number, steep: number) {
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l, k, a, s: Math.sqrt(G * k), steep };
}
const GERSTNER = [
  gw(0.05, -1, 0.02, 0.48, 0.2),
  gw(0.34, -0.94, 0.041, 0.32, 0.16),
  gw(-0.4, -0.92, 0.078, 0.21, 0.13),
  gw(0.16, -0.99, 0.13, 0.14, 0.1),
  gw(-0.22, -0.97, 0.23, 0.09, 0.07),
  gw(0.55, -0.84, 0.4, 0.055, 0.05),
];

let host: Group | null = null;
let root: Group | null = null;
let decor: Group | null = null;
let swell: Mesh | null = null;
let spray: InstancedMesh | null = null;
let wet: Mesh | null = null;
let sheet: Mesh | null = null;
let swellKey = '';
let wetKey = '';
let sheetKey = '';
let anchorX = 0;
let anchorZ = 0;
let anchorYaw = 0;
let sprayCount = 0;
let drawCount = 0;
let triCount = 0;

const sprayLocal: { x: number; seed: number }[] = [];
const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();

const CALM: StormDrive = { on: false, intensity: 0, overtop: false, windDir: 0, paused: false };

function smooth01(t: number, a: number, b: number): number {
  const x = Math.min(1, Math.max(0, (t - a) / ((b - a) || 1)));
  return x * x * (3 - 2 * x);
}

function waveNodes() {
  const p = positionLocal;
  const edge = attribute('edge', 'float');
  let dx = float(0);
  let dy = float(0);
  let dz = float(0);
  let dxx = float(0);
  let dzz = float(0);
  let dxz = float(0);
  let dyx = float(0);
  let dyz = float(0);
  for (let i = 0; i < GERSTNER.length; i++) {
    const w = GERSTNER[i]!;
    const use = step(float(i).add(0.5), uWaves);
    const amp = uAmp.mul(w.a).mul(use).mul(edge);
    const steep = float(w.steep).mul(uSteep).mul(use).mul(edge);
    const k = float(w.k);
    const phase = p.x.mul(w.x).add(p.z.mul(w.z)).mul(k).sub(uTime.mul(w.s));
    const s = sin(phase);
    const c = cos(phase);
    const slide = steep.div(k);
    dx = dx.add(float(w.x).mul(slide).mul(c));
    dz = dz.add(float(w.z).mul(slide).mul(c));
    dy = dy.add(amp.mul(s));
    const fold = steep.mul(s);
    dxx = dxx.sub(fold.mul(w.x * w.x));
    dzz = dzz.sub(fold.mul(w.z * w.z));
    dxz = dxz.sub(fold.mul(w.x * w.z));
    dyx = dyx.add(amp.mul(c).mul(k).mul(w.x));
    dyz = dyz.add(amp.mul(c).mul(k).mul(w.z));
  }
  const exx = float(1).add(dxx);
  const ezz = float(1).add(dzz);
  // Upward normal is the negated cross product of the displaced tangents.
  const nx = dyx.mul(ezz).sub(dxz.mul(dyz)).negate();
  const ny = dxz.mul(dxz).sub(exx.mul(ezz)).negate();
  const nz = exx.mul(dyz).sub(dyx.mul(dxz)).negate();
  const j = exx.mul(ezz).sub(dxz.mul(dxz));
  return { p, dx, dy, dz, nx, ny, nz, j, edge };
}

function foamOf(w: { j: any; dy: any; p: any; edge: any }) {
  const jac = float(1).sub(smoothstep(float(0.4), float(0.88), w.j));
  const crest = smoothstep(float(-0.08), max(uAmp.mul(0.2), float(0.25)), w.dy);
  const shore = float(1).sub(smoothstep(float(1.4), float(28), w.p.z)).mul(smoothstep(float(-0.5), float(5), w.p.z));
  return max(jac.mul(crest), shore.mul(float(0.4).add(uImpact.mul(0.6)))).mul(w.edge);
}

let swellMat: MeshStandardNodeMaterial | null = null;
let sheetMat: MeshStandardNodeMaterial | null = null;
let wetMatShared: MeshStandardNodeMaterial | null = null;
let sprayMat: MeshStandardNodeMaterial | null = null;

function swellMaterial(): MeshStandardNodeMaterial {
  if (swellMat) return swellMat;
  const m = new MeshStandardNodeMaterial();
  m.roughness = 0.55;
  m.metalness = 0.02;
  m.transparent = true;
  m.depthWrite = false;
  m.fog = true;
  m.side = FrontSide;
  m.positionNode = Fn(() => {
    const w = waveNodes();
    return vec3(w.p.x.add(w.dx), w.dy, w.p.z.add(w.dz));
  })();
  m.normalNode = Fn(() => {
    const w = waveNodes();
    return normalize(T.transformNormalToView(vec3(w.nx, w.ny, w.nz)));
  })();
  m.colorNode = Fn(() => {
    const w = waveNodes();
    const depth = max(w.p.z, float(0)).mul(0.04).add(float(1.1)).add(max(w.dy.negate(), float(0)).mul(0.4));
    const deep = vec3(0.004, 0.009, 0.016);
    const shallow = vec3(0.035, 0.062, 0.07);
    const beer = mix(deep, shallow, exp(depth.mul(-0.22)));
    const nW = normalize(vec3(w.nx, w.ny, w.nz));
    const vW = normalize(cameraPosition.sub(positionWorld));
    const ndv = max(dot(nW, vW), float(0));
    const fres = float(0.02).add(float(0.98).mul(pow(float(1).sub(ndv), float(5))));
    const mirror = mix(U.fogColor, U.skyHorizon, float(0.7));
    const lit = mix(beer, mirror, fres.mul(0.45));
    return mix(lit, vec3(0.8, 0.85, 0.88), foamOf(w));
  })();
  m.emissiveNode = Fn(() => {
    const w = waveNodes();
    return vec3(0.75, 0.82, 0.86).mul(foamOf(w)).mul(float(0.28).add(uImpact.mul(0.7)).add(uStorm.mul(0.15)));
  })();
  m.opacityNode = Fn(() => {
    const edge = attribute('edge', 'float');
    return edge.mul(0.97);
  })();
  swellMat = m;
  return m;
}

function sheetBand() {
  const kind = attribute('kind', 'float');
  const flow = attribute('flow', 'float');
  const crest = sin(positionLocal.z.mul(0.85).add(uTime.mul(1.1))).mul(0.5).add(0.5);
  const face = sin(flow.mul(24).sub(uTime.mul(1.55))).mul(0.5).add(0.5);
  return mix(crest, face, step(0.5, kind));
}

function overtopMaterial(): MeshStandardNodeMaterial {
  if (sheetMat) return sheetMat;
  const m = new MeshStandardNodeMaterial();
  m.transparent = true;
  m.depthWrite = false;
  m.fog = true;
  m.roughness = 0.22;
  m.metalness = 0.06;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -4;
  m.colorNode = Fn(() => mix(vec3(0.1, 0.12, 0.13), vec3(0.84, 0.88, 0.9), sheetBand()))();
  m.emissiveNode = Fn(() => vec3(0.72, 0.78, 0.82).mul(sheetBand()).mul(float(0.18).add(uImpact.mul(0.62))))();
  m.opacityNode = Fn(() => {
    const band = sheetBand();
    const sheet = float(0.16).add(band.mul(0.46)).add(uImpact.mul(0.28));
    return sheet.mul(uOvertop);
  })();
  sheetMat = m;
  return m;
}

function wetMaterial(): MeshStandardNodeMaterial {
  if (wetMatShared) return wetMatShared;
  const m = new MeshStandardNodeMaterial();
  m.transparent = true;
  m.depthWrite = false;
  m.fog = true;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1;
  m.polygonOffsetUnits = -2;
  const flow = sin(positionLocal.x.mul(0.35).add(positionLocal.z.mul(0.8)).add(uTime.mul(0.9))).mul(0.5).add(0.5);
  m.colorNode = Fn(() => mix(vec3(0.14, 0.16, 0.17), vec3(0.74, 0.8, 0.82), flow.mul(float(0.35).add(uOvertop.mul(0.65)))))();
  m.roughnessNode = mix(float(0.62), float(0.08), uWet.add(uOvertop.mul(0.4)));
  m.metalnessNode = mix(float(0.08), float(0.35), uWet.mul(0.5));
  m.opacityNode = Fn(() => {
    const calm = uWet.mul(0.55).add(0.08);
    const rush = calm.add(flow.mul(0.22)).add(uImpact.mul(0.34));
    return mix(calm, rush, uOvertop);
  })();
  wetMatShared = m;
  return m;
}

function sprayMaterial(): MeshStandardNodeMaterial {
  if (sprayMat) return sprayMat;
  const m = new MeshStandardNodeMaterial();
  m.transparent = true;
  m.depthWrite = false;
  m.fog = true;
  m.side = DoubleSide;
  m.roughness = 0.45;
  m.colorNode = vec3(0.94, 0.96, 0.97);
  m.emissiveNode = vec3(0.92, 0.95, 0.97).mul(uImpact.mul(0.9).add(uStorm.mul(0.28)));
  m.opacityNode = uImpact.mul(0.78).add(uStorm.mul(0.14));
  sprayMat = m;
  return m;
}

function gridGeo(
  nx: number, nz: number, x0: number, x1: number, z0: number, z1: number, fadeFar: boolean, fadeNear: boolean,
): BufferGeometry {
  const g = new BufferGeometry();
  const cols = nx + 1;
  const pos = new Float32Array(cols * (nz + 1) * 3);
  const edge = new Float32Array(cols * (nz + 1));
  const idx = new Uint32Array(nx * nz * 6);
  let v = 0;
  for (let j = 0; j <= nz; j++) {
    const tz = j / nz;
    const z = z0 + (z1 - z0) * tz;
    for (let i = 0; i <= nx; i++) {
      const tx = i / nx;
      const x = x0 + (x1 - x0) * tx;
      pos[v++] = x;
      pos[v++] = 0;
      pos[v++] = z;
      const along = 1 - smooth01(Math.abs(tx * 2 - 1), 0.72, 1);
      const far = fadeFar ? 1 - smooth01(tz, 0.45, 1) : 1;
      const near = fadeNear ? smooth01(tz, 0, 0.2) : 1;
      edge[j * cols + i] = Math.min(along, far, near);
    }
  }
  let k = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * cols + i;
      idx[k++] = a;
      idx[k++] = a + cols;
      idx[k++] = a + 1;
      idx[k++] = a + 1;
      idx[k++] = a + cols;
      idx[k++] = a + cols + 1;
    }
  }
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('edge', new BufferAttribute(edge, 1));
  g.setIndex(new BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  if (g.boundingSphere) g.boundingSphere.radius += 14;
  return g;
}

function quad(along: number, z0: number, z1: number, y: number, kind: number): BufferGeometry {
  const hw = along / 2;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([
    -hw, y, z0, hw, y, z0, hw, y, z1, -hw, y, z1,
  ]), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array([
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
  ]), 3));
  g.setAttribute('kind', new BufferAttribute(new Float32Array([kind, kind, kind, kind]), 1));
  g.setAttribute('flow', new BufferAttribute(new Float32Array([0, 0, 1, 1]), 1));
  g.setIndex(new BufferAttribute(new Uint16Array([0, 2, 1, 0, 3, 2]), 1));
  g.computeBoundingSphere();
  return g;
}

function faceStrip(profile: WallProfile, along: number): BufferGeometry {
  const top = profile.H - 0.5;
  const bot = Math.max(SEA_Y + 6, profile.H - 24);
  const rows = 6;
  const cols = 8;
  const pos = new Float32Array((cols + 1) * (rows + 1) * 3);
  const kind = new Float32Array((cols + 1) * (rows + 1));
  const flow = new Float32Array((cols + 1) * (rows + 1));
  const nrm = new Float32Array((cols + 1) * (rows + 1) * 3);
  const idx = new Uint32Array(cols * rows * 6);
  const samples: { y: number; z: number }[] = [];
  for (let j = 0; j <= rows; j++) {
    const y = top + (bot - top) * (j / rows);
    samples.push({ y, z: seawardAcross(profile, y) });
  }
  let v = 0;
  for (let j = 0; j <= rows; j++) {
    const a = samples[Math.max(0, j - 1)]!;
    const b = samples[Math.min(rows, j + 1)]!;
    let tz = b.z - a.z;
    let ty = b.y - a.y;
    const len = Math.hypot(tz, ty) || 1;
    tz /= len;
    ty /= len;
    // Outward (seaward) offset so the sheet clears the formwork boards.
    const oz = -ty * 0.28;
    const oy = tz * 0.28;
    for (let i = 0; i <= cols; i++) {
      const x = -along / 2 + (i / cols) * along;
      const s = samples[j]!;
      pos[v++] = x;
      pos[v++] = s.y + oy;
      pos[v++] = s.z + oz;
      const vi = j * (cols + 1) + i;
      kind[vi] = 1;
      flow[vi] = j / rows;
      const nl = Math.hypot(oy, oz) || 1;
      nrm[vi * 3] = 0;
      nrm[vi * 3 + 1] = oy / nl;
      nrm[vi * 3 + 2] = oz / nl;
    }
  }
  let k = 0;
  const stride = cols + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * stride + i;
      idx[k++] = a;
      idx[k++] = a + stride;
      idx[k++] = a + 1;
      idx[k++] = a + 1;
      idx[k++] = a + stride;
      idx[k++] = a + stride + 1;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nrm, 3));
  g.setAttribute('kind', new BufferAttribute(kind, 1));
  g.setAttribute('flow', new BufferAttribute(flow, 1));
  g.setIndex(new BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

function flatSheet(along: number, across: number): BufferGeometry {
  const g = new BufferGeometry();
  const hw = along / 2;
  const hd = across / 2;
  g.setAttribute('position', new BufferAttribute(new Float32Array([
    -hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd,
  ]), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array([
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
  ]), 3));
  g.setIndex(new BufferAttribute(new Uint16Array([0, 2, 1, 0, 3, 2]), 1));
  g.computeBoundingSphere();
  return g;
}

function crossedCards(): BufferGeometry {
  const a = new PlaneGeometry(1, 1);
  const b = new PlaneGeometry(1, 1);
  b.rotateY(Math.PI / 2);
  const g = mergeGeometries([a, b]);
  if (!g) return a;
  g.computeBoundingSphere();
  if (g.boundingSphere) g.boundingSphere.radius += 4;
  return g;
}

function trisOf(g: BufferGeometry | null | undefined, n = 1): number {
  if (!g?.index) return 0;
  return (g.index.count / 3) * n;
}

export function attachWaves(group: Group): void {
  host = group;
  root = new Group();
  root.name = 'sea-wall-waves';
  group.add(root);
  decor = new Group();
  decor.name = 'sea-wall-sheets';
  group.add(decor);
  swellMaterial();
  wetMaterial();
  overtopMaterial();
}

function placeWater(frame: WallFrame, across: number): void {
  if (!root) return;
  const p = framePoint(frame, across, 0);
  root.position.set(p.x, SEA_Y + 0.2, p.z);
  root.rotation.y = frame.yaw;
  anchorX = p.x;
  anchorZ = p.z;
  anchorYaw = frame.yaw;
}

function placeDecor(frame: WallFrame): void {
  if (!decor) return;
  decor.position.set(frame.x, 0, frame.z);
  decor.rotation.y = frame.yaw;
}

function dropMesh(mesh: Mesh | null): void {
  if (!mesh) return;
  mesh.geometry.dispose();
  mesh.removeFromParent();
  mesh.dispose();
}

function ensureSwell(nx: number, nz: number, half: number, depth: number, skirt: number): void {
  if (!root) return;
  const key = `${nx}x${nz}:${half}:${depth}:${skirt}`;
  if (swell && swellKey === key) return;
  dropMesh(swell);
  const inner = gridGeo(nx, nz, -half, half, 1.4, depth, skirt <= 0, false);
  let geo = inner;
  if (skirt > 0) {
    const outer = gridGeo(
      Math.max(8, Math.round(nx * 0.4)),
      Math.max(4, Math.round(nz * 0.35)),
      -half * 1.35, half * 1.35, depth, depth + skirt, true, false,
    );
    geo = mergeGeometries([inner, outer]) ?? inner;
    if (geo !== inner) inner.dispose();
    if (geo !== outer) outer.dispose();
  }
  swell = new Mesh(geo, swellMaterial());
  swell.name = 'swell';
  swell.renderOrder = 1;
  swell.frustumCulled = false;
  root.add(swell);
  swellKey = key;
}

function ensureSpray(n: number): void {
  if (!root || n <= 0) {
    if (spray) spray.visible = false;
    return;
  }
  if (spray && sprayLocal.length === n) return;
  if (spray) {
    spray.geometry.dispose();
    spray.removeFromParent();
    spray.dispose();
    spray = null;
  }
  sprayLocal.length = 0;
  spray = new InstancedMesh(crossedCards(), sprayMaterial(), n);
  spray.name = 'spray';
  spray.frustumCulled = false;
  spray.renderOrder = 3;
  spray.instanceMatrix.setUsage(DynamicDrawUsage);
  const span = 32;
  for (let i = 0; i < n; i++) {
    const x = -span + (i / Math.max(1, n - 1)) * span * 2;
    sprayLocal.push({ x, seed: (i * 17 % 10) / 10 });
  }
  root.add(spray);
}

function ensureSheet(profile: WallProfile, along: number): void {
  if (!decor) return;
  const key = `${profile.id}:${along.toFixed(0)}:${profile.H.toFixed(0)}`;
  if (sheet && sheetKey === key) return;
  dropMesh(sheet);
  const crest = quad(along, -profile.crest / 2 + 0.7, profile.crest / 2 - 0.7, profile.H + 0.12, 0);
  const face = faceStrip(profile, along);
  const geo = mergeGeometries([crest, face]) ?? crest;
  if (geo !== crest) crest.dispose();
  if (geo !== face) face.dispose();
  sheet = new Mesh(geo, overtopMaterial());
  sheet.name = 'overtop';
  sheet.renderOrder = 2;
  sheet.frustumCulled = false;
  decor.add(sheet);
  sheetKey = key;
}

function moveWet(frame: WallFrame, y: number, along: number, across: number, acrossCentre: number, key: string): void {
  if (!host) return;
  if (!wet || wetKey !== key) {
    dropMesh(wet);
    wet = new Mesh(flatSheet(along, across), wetMaterial());
    wet.name = 'wet-terrace';
    wet.renderOrder = 2;
    wet.frustumCulled = false;
    host.add(wet);
    wetKey = key;
  }
  const p = framePoint(frame, acrossCentre, 0);
  wet.position.set(p.x, y + 0.06, p.z);
  wet.rotation.y = frame.yaw;
}

function hideAll(): void {
  if (swell) swell.visible = false;
  if (spray) spray.visible = false;
  if (wet) wet.visible = false;
  if (sheet) sheet.visible = false;
  sprayCount = 0;
  drawCount = 0;
  triCount = 0;
}

function slopeClimb(profile: WallProfile): { run: number; rise: number } {
  const water = waterlineAcross(profile);
  const lip = profile.crest / 2;
  const run = Math.max(6, water - lip);
  const rise = Math.max(8, profile.H - SEA_Y);
  const climb = Math.min(46, rise * 0.46);
  return { run: Math.min(16, run * (climb / rise)), rise: climb };
}

export function waveStats(): { draws: number; tris: number; spray: number } {
  return { draws: drawCount, tris: triCount, spray: sprayCount };
}

export function updateWaves(
  layout: CityLayout,
  camX: number,
  camY: number,
  camZ: number,
  tier: 'low' | 'medium' | 'high' | 'ultra',
  state: WaveState,
  rain: number,
  time: number,
  wind: number,
  drive: StormDrive = CALM,
): void {
  if (!root) return;
  const budget = coastBudget(tier);
  const hit = nearestWall(layout, camX, camZ);
  const apron = planApron(layout);
  const dApron = Math.hypot(camX - apron.frame.x, camZ - apron.frame.z);
  const far = hit.dist > 1400 && dApron > 1400;
  const intensity = drive.intensity;
  uTime.value = time;
  uAmp.value = state.amp * (drive.on ? 1.05 + 0.7 * intensity : 0.36 + 0.28 * intensity);
  uSteep.value = drive.on ? 0.75 + 0.25 * intensity : 0.42 + 0.2 * state.storm;
  uImpact.value = state.impact;
  uStorm.value = Math.max(state.storm, drive.on ? intensity : 0);
  uWaves.value = budget.gerstner;
  const overtop = drive.overtop && budget.sheets > 0 ? 1 : 0;
  uOvertop.value = overtop;
  const wetAmt = (0.1 + rain * 0.4) * (0.3 + state.impact * 0.7);
  uWet.value = wetAmt;
  setOceanStorm(budget.waves && drive.on ? intensity * Math.max(0, 1 - Math.min(hit.dist, dApron) / 8000) : 0);

  if (!budget.waves || far) {
    hideAll();
    return;
  }

  ensureSwell(budget.ribbonX, budget.ribbonZ, budget.half, budget.depth, budget.skirt);
  ensureSpray(budget.spray);
  if (swell) swell.visible = true;

  const useApron = dApron < 1200;
  let frame: WallFrame;
  let across: number;
  if (useApron) {
    frame = { ...apron.frame };
    const dx = camX - frame.x;
    const dz = camZ - frame.z;
    const along = Math.max(-36, Math.min(36, dx * frame.tx + dz * frame.tz));
    frame = {
      ...frame,
      x: apron.frame.x + frame.tx * along,
      z: apron.frame.z + frame.tz * along,
    };
    across = apron.across1;
  } else {
    frame = hit.frame;
    across = waterlineAcross(hit.piece.profile);
  }
  const at = framePoint(frame, across, 0);
  const moved = Math.hypot(anchorX - at.x, anchorZ - at.z);
  if (moved > 6 || Math.abs(anchorYaw - frame.yaw) > 0.05) placeWater(frame, across);
  placeDecor(hit.frame);

  const climb = slopeClimb(hit.piece.profile);
  const sprayProfile = hit.piece.profile;
  const wx = Math.cos(drive.windDir) * wind;
  const wz = Math.sin(drive.windDir) * wind;
  const alongWind = wx * frame.tx + wz * frame.tz;
  sprayCount = 0;
  if (spray) {
    const show = (rain > 0.25 || drive.on) && (state.storm > 0.35 || state.impact > 0.05 || drive.on);
    spray.visible = show;
    const start = 0.62;
    const span = 0.34;
    for (let i = 0; i < sprayLocal.length; i++) {
      const s = sprayLocal[i]!;
      const travel = Math.max(0, Math.min(1, (state.phase - start - s.seed * 0.05) / span));
      const y = 1.2 + travel * climb.rise * (0.55 + s.seed * 0.45);
      const faceZ = seawardAcross(sprayProfile, SEA_Y + y) - across;
      const z = faceZ + 2.6 + s.seed * 0.9;
      const x = s.x + alongWind * travel * 0.35;
      const sc = (4.2 + state.storm * 1.4 + state.impact * 3.2) * (0.62 + s.seed * 0.7) * (0.45 + travel * 0.7);
      _p.set(x, y, z);
      _s.set(sc, sc * (1.15 + state.impact * 0.35), sc);
      spray.setMatrixAt(i, _m.compose(_p, _q.identity(), _s));
    }
    spray.count = show ? sprayLocal.length : 0;
    spray.instanceMatrix.needsUpdate = true;
    sprayCount = spray.count;
  }

  const nearApron = dApron < 650 && dApron < hit.dist + 80;
  const wantCrest = overtop > 0 && budget.sheets >= 1 && !nearApron && hit.dist < 900;
  const wantApronSheet = overtop > 0 && dApron < 1100 && (nearApron || budget.sheets >= 2);
  if (wantCrest) {
    const along = budget.sheets >= 2 ? 84 : 46;
    ensureSheet(hit.piece.profile, along);
    if (sheet) sheet.visible = true;
  } else if (sheet) sheet.visible = false;

  if (wantApronSheet || (useApron && overtop === 0)) {
    moveWet(
      apron.frame,
      apron.deckY + (wantApronSheet ? 0.1 : 0.06),
      apron.along1 - apron.along0,
      apron.across1 - apron.across0,
      (apron.across0 + apron.across1) / 2,
      'apron',
    );
    if (wet) wet.visible = true;
  } else if (!wantCrest) {
    const tread = hit.piece.profile.treads.find((t) => t.y >= 12 && t.y <= 20) ?? hit.piece.profile.treads[0];
    if (tread && camY < hit.piece.profile.H + 40 && hit.dist < budget.reach) {
      moveWet(hit.frame, tread.y + 0.08, 42, tread.outer - tread.inner, (tread.inner + tread.outer) / 2, `t-${tread.y.toFixed(0)}`);
      if (wet) wet.visible = true;
    } else if (wet) wet.visible = false;
  } else if (wet) wet.visible = false;

  drawCount = (swell?.visible ? 1 : 0) + (sprayCount > 0 ? 1 : 0) + (sheet?.visible ? 1 : 0) + (wet?.visible ? 1 : 0);
  triCount = trisOf(swell?.visible ? swell.geometry : null)
    + trisOf(spray?.geometry, sprayCount)
    + trisOf(sheet?.visible ? sheet.geometry : null)
    + trisOf(wet?.visible ? wet.geometry : null);
}
