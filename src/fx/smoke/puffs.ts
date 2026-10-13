// Street volumes that are too small for the launch cylinder: a manhole sheet
// and a tailpipe wake. One instanced unit box, one material. The fragment
// enters on the front face and stops at the box exit or the scene depth, so
// a sheet can sit on asphalt and a wake can sit against a bumper.
// Beer-Lambert, one noise tap per step, one in-scatter sample per ray.
import {
  BoxGeometry, CustomBlending, DynamicDrawUsage, FrontSide, InstancedBufferAttribute, InstancedMesh,
  MeshBasicNodeMaterial, Object3D, OneFactor, OneMinusSrcAlphaFactor, Vector3,
} from 'three/webgpu';
import { uniform } from 'three/tsl';
import * as TSL from 'three/tsl';
import { fogDepth } from '../../atmosphere/SkyFog';
import { U } from '../../atmosphere/uniforms';
import type { Tier } from '../../core/quality';
import { resources } from '../../core/memory';
import { practicalInscatter } from '../../lighting/shade.ts';
import { PUFF_CAP, PUFF_STEPS } from './tiers';

const T = TSL as any;
const {
  Fn, attribute, cameraFar, cameraNear, cameraPosition, clamp, dot, exp, float,
  length, max, min, mix, mx_noise_float, normalize, perspectiveDepthToViewZ,
  positionView, positionWorld, screenUV, smoothstep, sqrt, step, vec3, vec4,
  viewportDepthTexture,
} = T;

/** Highest tier. The buffer is a few hundred bytes, not a city-sized pool. */
const PUFF_MAX = PUFF_CAP.ultra;

export const puffSteps = uniform(4);
export const puffRain = uniform(0);

export interface PuffPlacement {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  /** Wake axis times half-length. Manhole: wind, unused for the tube. */
  ax: number;
  ay: number;
  az: number;
  /**
   * 0 manhole. Exhaust is 1 plus half the throttle, so the shader can tell
   * a hard launch from an idle puff without a fourth attribute.
   */
  mode: number;
  seed: number;
  /** Manhole disc radius, or the exhaust tube radius at the pipe. */
  radius: number;
}

let mesh: InstancedMesh | null = null;
let a0: InstancedBufferAttribute | null = null;
let a1: InstancedBufferAttribute | null = null;
let a2: InstancedBufferAttribute | null = null;
let shown = 0;

const dummy = new Object3D();
const tmpP = new Vector3();
const tmpS = new Vector3();

function puffMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial();
  m.transparent = true;
  m.depthWrite = false;
  m.depthTest = true;
  m.side = FrontSide;
  m.fog = false;
  m.blending = CustomBlending;
  m.blendSrc = OneFactor;
  m.blendDst = OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = OneFactor;
  m.blendDstAlpha = OneMinusSrcAlphaFactor;
  m.premultipliedAlpha = true;
  m.forceSinglePass = true;

  m.colorNode = Fn(() => {
    const p0 = attribute('p0', 'vec4');
    const p1 = attribute('p1', 'vec4');
    const p2 = attribute('p2', 'vec4');
    const center = p0.xyz;
    const half = p1.xyz;
    const mode = p0.w;
    const seed = p1.w;
    const exhaust = smoothstep(float(0.6), float(0.9), mode);
    const hole = float(1.0).sub(exhaust);
    const drive = clamp(mode.sub(1.0).mul(2.2), 0.0, 1.0);

    const origin = cameraPosition;
    const entry = positionWorld;
    const dir = normalize(entry.sub(origin));
    const inv = vec3(1, 1, 1).div(dir.add(vec3(1e-4, 1e-4, 1e-4)));
    const bmin = center.sub(half);
    const bmax = center.add(half);
    const t1 = bmin.sub(origin).mul(inv);
    const t2 = bmax.sub(origin).mul(inv);
    const tmin = min(t1, t2);
    const tmax = max(t1, t2);
    const tBox0 = max(max(tmin.x, tmin.y), tmin.z);
    const tBox1 = min(min(tmax.x, tmax.y), tmax.z);
    const sceneZ = perspectiveDepthToViewZ(viewportDepthTexture(screenUV), cameraNear, cameraFar);
    const gap = positionView.z.sub(sceneZ);
    const tStart = max(tBox0, 0.0);
    const span = max(min(tBox1.sub(tStart), max(gap, 0.0)), 0.0);
    const stepLen = span.div(max(puffSteps, 1.0));

    const acc = vec3(0, 0, 0).toVar();
    const tr = float(1).toVar();
    const pos = origin.add(dir.mul(tStart.add(stepLen.mul(0.35)))).toVar();
    const scatter = practicalInscatter(center).mul(0.35);
    const halfLen = max(length(p2.xyz), 0.25);
    const axis = p2.xyz.div(halfLen);

    T.Loop(5, ({ i }: { i: unknown }) => {
      const live = step(float(i).add(0.5), puffSteps);
      const rel = pos.sub(center);
      const n = mx_noise_float(pos.mul(0.85).add(vec3(
        U.time.mul(0.22).add(seed.mul(3.0)),
        U.time.mul(0.08),
        seed.mul(5.0),
      )));
      const n01 = n.mul(0.5).add(0.5);
      const clumps = smoothstep(float(0.22), float(0.8), n01);

      const yb = rel.y.add(half.y);
      const discR = max(p2.w, 0.4).mul(mix(float(0.78), float(1.08), n01));
      const horiz = sqrt(rel.x.mul(rel.x).add(rel.z.mul(rel.z)));
      const sheet = smoothstep(discR, discR.mul(0.22), horiz)
        .mul(smoothstep(half.y.mul(2.05), half.y.mul(0.28), yb))
        .mul(smoothstep(float(0.0), half.y.mul(0.22), yb))
        .mul(mix(float(0.28), float(1.0), clumps));

      const along = dot(rel, axis);
      const radial = length(rel.sub(axis.mul(along)));
      const u = clamp(along.div(halfLen).mul(0.5).add(0.5), 0.0, 1.0);
      const tubeR = mix(p2.w, p2.w.mul(1.7), u).mul(mix(float(0.82), float(1.15), n01));
      const wake = smoothstep(tubeR, tubeR.mul(0.15), radial)
        .mul(smoothstep(float(0.0), float(0.08), u))
        .mul(smoothstep(float(1.0), float(0.62), u))
        .mul(mix(float(0.35), float(1.0), clumps));

      const density = sheet.mul(hole).add(wake.mul(exhaust).mul(mix(float(0.75), float(1.25), drive)));
      const ash = vec3(0.72, 0.74, 0.76).mul(hole).mul(9.0)
        .add(vec3(0.58, 0.59, 0.61).mul(exhaust).mul(12.0));
      const mouth = smoothstep(float(0.4), float(0.0), u).mul(exhaust);
      const warm = vec3(0.82, 0.52, 0.3).mul(mouth).mul(5.0);
      const glow = ash.add(warm).add(scatter.mul(hole.mul(0.45).add(exhaust.mul(0.35))));
      const sigma = mix(float(0.62), float(0.7), exhaust);
      const tau = density.mul(stepLen).mul(sigma).mul(live);
      const gain = float(1.0).sub(exp(tau.negate()));
      acc.addAssign(tr.mul(glow).mul(gain));
      tr.mulAssign(exp(tau.negate()));
      pos.addAssign(dir.mul(stepLen).mul(live));
    });

    const dist = length(center.sub(cameraPosition));
    const fogK = mix(float(-1.3), float(-0.45), exhaust);
    const fogA = exp(fogDepth(cameraPosition, center).mul(fogK));
    const close = smoothstep(float(1.2), float(3.2), dist);
    const farHole = smoothstep(float(22.0), float(7.0), dist);
    const farWake = smoothstep(float(64.0), float(14.0), dist);
    const far = mix(farHole, farWake, exhaust);
    const rain = mix(float(1.0), float(1.15), puffRain.mul(exhaust));
    const a = float(1.0).sub(tr).mul(close).mul(far).mul(fogA).mul(smoothstep(0.05, 0.35, span));
    return vec4(acc.mul(close).mul(far).mul(fogA).mul(rain), a);
  })();
  return m;
}

export function puffVolumeMesh(): InstancedMesh {
  if (mesh && a0 && a1 && a2) return mesh;
  const geo = resources.geometry(() => new BoxGeometry(1, 1, 1), {
    label: 'smoke-puff-box',
    owner: 'smoke',
    evictable: true,
  });
  a0 = new InstancedBufferAttribute(new Float32Array(PUFF_MAX * 4), 4);
  a1 = new InstancedBufferAttribute(new Float32Array(PUFF_MAX * 4), 4);
  a2 = new InstancedBufferAttribute(new Float32Array(PUFF_MAX * 4), 4);
  a0.setUsage(DynamicDrawUsage);
  a1.setUsage(DynamicDrawUsage);
  a2.setUsage(DynamicDrawUsage);
  geo.setAttribute('p0', a0);
  geo.setAttribute('p1', a1);
  geo.setAttribute('p2', a2);
  const mat = resources.material('smoke-puff', () => puffMaterial());
  mesh = new InstancedMesh(geo, mat, PUFF_MAX);
  mesh.name = 'smoke-puff-volume';
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.count = 0;
  mesh.visible = false;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  return mesh;
}

export function puffCount(): number {
  return shown;
}

export function syncPuffs(tier: Tier, list: readonly PuffPlacement[]): void {
  const draw = puffVolumeMesh();
  if (!a0 || !a1 || !a2) return;
  puffSteps.value = PUFF_STEPS[tier];
  const n = Math.min(list.length, PUFF_CAP[tier], PUFF_MAX);
  shown = n;
  draw.visible = n > 0;
  draw.count = n;
  for (let i = 0; i < n; i++) {
    const p = list[i]!;
    a0.setXYZW(i, p.x, p.y, p.z, p.mode);
    a1.setXYZW(i, p.hx, p.hy, p.hz, p.seed);
    a2.setXYZW(i, p.ax, p.ay, p.az, p.radius);
    tmpP.set(p.x, p.y, p.z);
    tmpS.set(Math.max(0.05, p.hx * 2), Math.max(0.05, p.hy * 2), Math.max(0.05, p.hz * 2));
    dummy.position.copy(tmpP);
    dummy.scale.copy(tmpS);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    draw.setMatrixAt(i, dummy.matrix);
  }
  a0.needsUpdate = true;
  a1.needsUpdate = true;
  a2.needsUpdate = true;
  draw.instanceMatrix.needsUpdate = true;
}
