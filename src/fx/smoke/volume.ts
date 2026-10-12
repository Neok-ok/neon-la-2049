// Ray-marched launch plume for high and ultra.
// The box is the bounds. The fragment walks from the near hit to the far hit,
// accumulates Beer-Lambert extinction (Max, 1995) and a Henyey-Greenstein
// scatter toward the engine, the same phase the street haze already uses.
// Schneider's Horizon cloudscapes are the reference for marching a noise field
// instead of filling the box with cards. Low and medium do not build this draw.
import {
  BackSide, BoxGeometry, CustomBlending, Mesh, MeshBasicNodeMaterial,
  OneFactor, OneMinusSrcAlphaFactor, Vector3,
} from 'three/webgpu';
import { uniform } from 'three/tsl';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';
import type { Tier } from '../../core/quality';
import { resources } from '../../core/memory';
import { PRESETS } from '../../lighting/presets.ts';
import { practicalInscatter } from '../../lighting/shade.ts';
import { VOLUME_STEPS } from './tiers';

const T = TSL as any;
const {
  Fn, cameraPosition, clamp, dot, exp, float, length, max, min, mix,
  mx_noise_float, normalize, positionWorld, pow, smoothstep, step, vec3, vec4,
} = T;

const FLAME = PRESETS.flare.rgb;

export const volBase = uniform(new Vector3());
export const volHalf = uniform(new Vector3(1, 1, 1));
export const volWind = uniform(new Vector3());
export const volEngine = uniform(new Vector3());
export const volHeight = uniform(80);
export const volGroundR = uniform(40);
export const volDensity = uniform(0);
export const volSteps = uniform(8);

let mesh: Mesh | null = null;

function volumeMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial();
  m.transparent = true;
  m.depthWrite = false;
  m.depthTest = true;
  m.side = BackSide;
  m.fog = false;
  m.blending = CustomBlending;
  m.blendSrc = OneFactor;
  m.blendDst = OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = OneFactor;
  m.blendDstAlpha = OneMinusSrcAlphaFactor;
  m.premultipliedAlpha = true;
  m.forceSinglePass = true;

  m.colorNode = Fn(() => {
    const origin = cameraPosition;
    const exit = positionWorld;
    const dir = normalize(exit.sub(origin));
    const inv = vec3(1, 1, 1).div(dir.add(vec3(1e-4, 1e-4, 1e-4)));
    const bmin = volBase.sub(volHalf);
    const bmax = volBase.add(volHalf);
    const t1 = bmin.sub(origin).mul(inv);
    const t2 = bmax.sub(origin).mul(inv);
    const tmin = min(t1, t2);
    const tmax = max(t1, t2);
    const tNear = max(max(tmin.x, tmin.y), tmin.z);
    const tFar = min(min(tmax.x, tmax.y), tmax.z);
    const tStart = max(tNear, 0.0);
    const span = max(tFar.sub(tStart), 0.0);
    const stepLen = span.div(max(volSteps, 1.0));
    const acc = vec3(0, 0, 0).toVar();
    const tr = float(1).toVar();
    const pos = origin.add(dir.mul(tStart)).toVar();
    // One in-scatter sample per ray. Repeating the cluster loop per step
    // blows the WebGL2 compile, so the march only integrates emission.
    const mid = origin.add(dir.mul(tStart.add(span.mul(0.45))));
    const scatter = practicalInscatter(mid).mul(1.1);

    T.Loop(6, ({ i }: { i: unknown }) => {
      const live = step(float(i).add(0.5), volSteps);
      pos.addAssign(dir.mul(stepLen).mul(live));
      const rel = pos.sub(volBase);
      const height = rel.y.add(volHalf.y);
      // The box is already leaned with the ribbon. A tall shear slid a second orange streak off the sheath.
      const shear = volWind.mul(height.sub(volHeight.mul(0.45)).mul(0.004));
      const radial = length(rel.xz.sub(shear.xz));
      const t = clamp(height.div(max(volHeight, 1.0)), 0, 1);
      const n1 = mx_noise_float(pos.mul(0.018).add(vec3(U.time.mul(0.03), U.time.mul(0.012), 0))).mul(0.5).add(0.5);
      const clumps = smoothstep(0.32, 0.78, n1);
      const pinch = mix(float(0.72), float(1.25), n1);
      const radius = mix(float(28), float(48), t).mul(pinch);
      const column = smoothstep(radius, radius.mul(0.2), radial)
        .mul(smoothstep(0.0, 10.0, height))
        .mul(smoothstep(volHeight, volHeight.mul(0.78), height))
        .mul(mix(float(0.5), float(1), clumps));
      // Orange only in the pad. A thin core up the whole box read as a searchlight.
      const core = smoothstep(float(7.0), float(1.4), radial)
        .mul(smoothstep(2.0, 16.0, height))
        .mul(smoothstep(float(90.0), float(18.0), height));
      const gRad = length(rel.xz);
      const ground = smoothstep(volGroundR, volGroundR.mul(0.35), gRad)
        .mul(smoothstep(16.0, 2.0, height))
        .mul(smoothstep(-2.0, 1.5, height))
        .mul(smoothstep(0.28, 0.7, n1));
      // Billboards carry the body. A fatter march read as a blue searchlight.
      const density = column.mul(0.4).add(ground.mul(0.34)).mul(volDensity);

      const toEng = volEngine.sub(pos);
      const dE = max(length(toEng), 1.0);
      const att = exp(dE.mul(-0.012));
      const V = normalize(cameraPosition.sub(pos));
      const L = toEng.div(dE);
      const cos = clamp(dot(V, L), -1, 1);
      const g = 0.42;
      const phase = float(1 - g * g).div(pow(max(float(1 + g * g).sub(cos.mul(2 * g)), 0.05), 1.5));
      const flame = vec3(FLAME[0], FLAME[1], FLAME[2]).mul(att).mul(phase).mul(4.5);
      // Grey sheath. The 1800 K term is the part of the billow that faces the engine.
      const albedo = mix(vec3(0.74, 0.75, 0.77), vec3(FLAME[0], FLAME[1], FLAME[2]), core.mul(0.55));
      const coreGlow = vec3(FLAME[0], FLAME[1], FLAME[2]).mul(core).mul(8.0);
      const glow = scatter.mul(0.45).add(flame.mul(albedo)).add(coreGlow);
      const absorb = density.mul(stepLen).mul(0.016);
      acc.addAssign(tr.mul(glow).mul(density.add(core.mul(0.12))).mul(stepLen).mul(0.055).mul(live));
      tr.mulAssign(mix(float(1), exp(absorb.negate()), live));
    });

    const a = float(1).sub(tr);
    const dist = length(volBase.sub(cameraPosition));
    const thin = smoothstep(9000.0, 180.0, dist);
    const outA = a.mul(thin).mul(smoothstep(0.5, 4.0, span));
    return vec4(acc.mul(thin), outA);
  })();
  return m;
}

export function launchVolumeMesh(): Mesh {
  if (mesh) return mesh;
  const geo = resources.geometry(() => new BoxGeometry(1, 1, 1), {
    label: 'smoke-volume',
    owner: 'smoke',
    evictable: true,
  });
  const mat = resources.material('smoke-volume', () => volumeMaterial());
  mesh = new Mesh(geo, mat);
  mesh.name = 'smoke-launch-volume';
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.visible = false;
  return mesh;
}

export function volumeActive(tier: Tier): boolean {
  return VOLUME_STEPS[tier] > 0;
}

export function syncVolumeSteps(tier: Tier): void {
  volSteps.value = VOLUME_STEPS[tier];
}
