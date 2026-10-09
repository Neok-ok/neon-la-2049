// A short swell ribbon that follows the camera along the toe.
// Low tier draws nothing. The ocean mesh itself is not displaced.
import {
  BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, InstancedMesh, Matrix4, Mesh, MeshStandardNodeMaterial,
  PlaneGeometry, Quaternion, Vector3,
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TSL from 'three/tsl';
import type { CityLayout } from '../../world/layout';
import { planApron } from './apronPlan';
import {
  SEA_Y,
  coastBudget,
  framePoint,
  nearestWall,
  waterlineAcross,
  type WallFrame,
  type WaveState,
} from './profile';

const T = TSL as any;
const { Fn, mix, positionLocal, sin, smoothstep, uniform, vec3 } = T;

const uPhase = uniform(0);
const uAmp = uniform(0.4);
const uImpact = uniform(0);
const uWet = uniform(0.2);

let host: Group | null = null;
let root: Group | null = null;
let ribbon: Mesh | null = null;
let spray: InstancedMesh | null = null;
let wet: Mesh | null = null;
let ribbonKey = '';
let wetKey = '';
let anchorX = 0;
let anchorZ = 0;
let anchorYaw = 0;

const sprayLocal: { x: number; z: number; seed: number }[] = [];
const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();

function ribbonGeo(nx: number, nz: number, half: number, depth: number): BufferGeometry {
  const g = new BufferGeometry();
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
  const idx = new Uint32Array(nx * nz * 6);
  let v = 0;
  for (let j = 0; j <= nz; j++) {
    const z = (j / nz) * depth;
    for (let i = 0; i <= nx; i++) {
      const x = -half + (i / nx) * half * 2;
      pos[v++] = x;
      pos[v++] = 0;
      pos[v++] = z;
    }
  }
  let k = 0;
  const stride = nx + 1;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * stride + i;
      idx[k++] = a;
      idx[k++] = a + stride;
      idx[k++] = a + 1;
      idx[k++] = a + 1;
      idx[k++] = a + stride;
      idx[k++] = a + stride + 1;
    }
  }
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setIndex(new BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  if (g.boundingSphere) g.boundingSphere.radius += 12;
  return g;
}

function waveMat(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();
  m.roughness = 0.22;
  m.metalness = 0.35;
  m.fog = true;
  m.positionNode = Fn(() => {
    const p = positionLocal;
    const lip = smoothstep(0.0, 3.0, p.z).mul(smoothstep(14.0, 4.0, p.z));
    const swell = sin(uPhase.mul(6.28318).add(p.z.mul(0.11)).add(p.x.mul(0.02))).mul(uAmp).mul(0.35);
    const crest = uImpact.mul(uAmp).mul(1.25).mul(lip);
    return vec3(p.x, swell.add(crest), p.z);
  })();
  m.colorNode = Fn(() => {
    const p = positionLocal;
    const lip = smoothstep(0.0, 2.4, p.z).mul(smoothstep(12.0, 3.2, p.z));
    const foam = lip.mul(smoothstep(0.15, 0.85, uImpact));
    return mix(vec3(0.04, 0.06, 0.08), vec3(0.84, 0.88, 0.9), foam);
  })();
  return m;
}

function wetMat(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();
  m.transparent = true;
  m.depthWrite = false;
  m.fog = true;
  m.colorNode = vec3(0.42, 0.48, 0.52);
  m.roughnessNode = mix(T.float(0.62), T.float(0.07), uWet);
  m.metalnessNode = mix(T.float(0.12), T.float(0.7), uWet);
  m.opacityNode = uWet.mul(0.55).add(0.04);
  return m;
}

function sheetGeo(along: number, across: number): BufferGeometry {
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

let ribbonMat: MeshStandardNodeMaterial | null = null;
let sheetMat: MeshStandardNodeMaterial | null = null;
let sprayMat: MeshStandardNodeMaterial | null = null;

function sprayMaterial(): MeshStandardNodeMaterial {
  if (sprayMat) return sprayMat;
  const m = new MeshStandardNodeMaterial();
  m.transparent = true;
  m.depthWrite = false;
  m.fog = true;
  m.roughness = 0.4;
  m.colorNode = vec3(0.82, 0.86, 0.88);
  m.opacityNode = uImpact.mul(0.55);
  sprayMat = m;
  return m;
}

export function attachWaves(group: Group): void {
  host = group;
  root = new Group();
  root.name = 'sea-wall-waves';
  group.add(root);
  ribbonMat = waveMat();
  sheetMat = wetMat();
}

function place(frame: WallFrame, across: number): void {
  if (!root) return;
  const p = framePoint(frame, across, 0);
  root.position.set(p.x, SEA_Y, p.z);
  root.rotation.y = frame.yaw;
  anchorX = p.x;
  anchorZ = p.z;
  anchorYaw = frame.yaw;
}

function ensureRibbon(nx: number, nz: number): void {
  if (!root || !ribbonMat) return;
  const key = `${nx}x${nz}`;
  if (ribbon && ribbonKey === key) return;
  if (ribbon) {
    ribbon.geometry.dispose();
    ribbon.removeFromParent();
  }
  const half = 18 + nx * 0.55;
  const depth = 16 + nz * 0.7;
  ribbon = new Mesh(ribbonGeo(nx, nz, half, depth), ribbonMat);
  ribbon.name = 'swell';
  ribbon.renderOrder = 1;
  ribbon.frustumCulled = true;
  root.add(ribbon);
  ribbonKey = key;
  if (spray) {
    spray.geometry.dispose();
    spray.removeFromParent();
    spray = null;
  }
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
  }
  sprayLocal.length = 0;
  const geo = crossedCards();
  spray = new InstancedMesh(geo, sprayMaterial(), n);
  spray.name = 'spray';
  spray.frustumCulled = false;
  spray.renderOrder = 3;
  spray.instanceMatrix.setUsage(DynamicDrawUsage);
  const span = 28;
  for (let i = 0; i < n; i++) {
    const x = -span + (i / Math.max(1, n - 1)) * span * 2;
    const z = 1.2 + (i % 5) * 1.1;
    sprayLocal.push({ x, z, seed: (i * 17 % 10) / 10 });
  }
  root.add(spray);
}

function moveWet(frame: WallFrame, y: number, along: number, across: number, acrossCentre: number, key: string): void {
  if (!root || !sheetMat) return;
  if (!wet || wetKey !== key) {
    if (wet) {
      wet.geometry.dispose();
      wet.removeFromParent();
    }
    wet = new Mesh(sheetGeo(along, across), sheetMat);
    wet.name = 'wet-terrace';
    wet.renderOrder = 2;
    wet.frustumCulled = false;
    host?.add(wet);
    wetKey = key;
  }
  const p = framePoint(frame, acrossCentre, 0);
  wet.position.set(p.x, y, p.z);
  wet.rotation.y = frame.yaw;
}

function hideAll(): void {
  if (ribbon) ribbon.visible = false;
  if (spray) spray.visible = false;
  if (wet) wet.visible = false;
}

export function updateWaves(
  layout: CityLayout,
  camX: number,
  camY: number,
  camZ: number,
  tier: 'low' | 'medium' | 'high' | 'ultra',
  state: WaveState,
  rain: number,
): void {
  if (!root) return;
  const budget = coastBudget(tier);
  const hit = nearestWall(layout, camX, camZ);
  const apron = planApron(layout);
  const dApron = Math.hypot(camX - apron.frame.x, camZ - apron.frame.z);
  const far = hit.dist > 1400 && dApron > 1400;
  uPhase.value = state.phase;
  uAmp.value = state.amp;
  uImpact.value = state.impact;
  const wetAmt = (0.1 + rain * 0.4) * (0.3 + state.impact * 0.7);
  uWet.value = wetAmt;
  if (!budget.waves || far) {
    hideAll();
    return;
  }
  ensureRibbon(budget.ribbonX, budget.ribbonZ);
  ensureSpray(budget.spray);
  if (ribbon) ribbon.visible = true;

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
  const moved = Math.hypot(anchorX - framePoint(frame, across, 0).x, anchorZ - framePoint(frame, across, 0).z);
  if (moved > 6 || Math.abs(anchorYaw - frame.yaw) > 0.05) place(frame, across);

  if (spray) {
    const show = state.impact > 0.08;
    spray.visible = show;
    spray.count = show ? sprayLocal.length : 0;
    for (let i = 0; i < sprayLocal.length; i++) {
      const s = sprayLocal[i]!;
      const rise = 0.5 + state.impact * (1.4 + state.amp) * (0.35 + s.seed);
      const sc = 1.6 + s.seed * 2.2;
      _p.set(s.x, rise, s.z);
      _s.set(sc, sc * (1.1 + state.impact), sc);
      spray.setMatrixAt(i, _m.compose(_p, _q.identity(), _s));
    }
    spray.instanceMatrix.needsUpdate = true;
  }

  if (useApron) {
    moveWet(
      apron.frame,
      apron.deckY + 0.06,
      apron.along1 - apron.along0,
      apron.across1 - apron.across0,
      (apron.across0 + apron.across1) / 2,
      'apron',
    );
    if (wet) wet.visible = true;
  } else {
    const tread = hit.piece.profile.treads.find((t) => t.y >= 12 && t.y <= 20) ?? hit.piece.profile.treads[0];
    if (tread && camY < hit.piece.profile.H + 40) {
      moveWet(hit.frame, tread.y + 0.08, 42, tread.outer - tread.inner, (tread.inner + tread.outer) / 2, `t-${tread.y.toFixed(0)}`);
      if (wet) wet.visible = true;
    } else if (wet) wet.visible = false;
  }
}
