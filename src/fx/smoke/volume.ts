// Ray-marched launch plume. The box only bounds the draw. The fragment walks
// the finite cylinder that holds the sheath, accumulates Beer-Lambert
// extinction (Max, 1995) and one Henyey-Greenstein in-scatter sample.
// Schneider's Horizon cloudscapes are the reference for marching a noise
// field. The shader is original: one noise tap per step, no baked texture.
// Cards do not carry this body.
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
  Fn, cameraPosition, clamp, cos, exp, float, length, max, min, mix,
  mx_noise_float, normalize, positionWorld, sin, smoothstep,
  sqrt, step, vec2, vec3, vec4,
} = T;

const FLAME = PRESETS.flare.rgb;

export const volBase = uniform(new Vector3());
export const volHalf = uniform(new Vector3(1, 1, 1));
export const volWind = uniform(new Vector3());
export const volEngine = uniform(new Vector3());
export const volHeight = uniform(80);
export const volGroundR = uniform(40);
/** Vertical-cylinder radius the march is clipped to, metres. */
export const volBound = uniform(86);
export const volDensity = uniform(0);
export const volSteps = uniform(6);

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
    const tBox0 = max(max(tmin.x, tmin.y), tmin.z);
    const tBox1 = min(min(tmax.x, tmax.y), tmax.z);

    // Steps stay inside the sheath. A uniform walk of the whole kilometre box
    // spends its taps on empty air.
    const R = max(volBound, 8.0);
    const ox = origin.x.sub(volBase.x);
    const oz = origin.z.sub(volBase.z);
    const A = max(dir.x.mul(dir.x).add(dir.z.mul(dir.z)), 1e-4);
    const B = ox.mul(dir.x).add(oz.mul(dir.z));
    const C = ox.mul(ox).add(oz.mul(oz)).sub(R.mul(R));
    const disc = B.mul(B).sub(A.mul(C));
    const root = sqrt(max(disc, 0.0));
    const tC0 = B.negate().sub(root).div(A);
    const tC1 = B.negate().add(root).div(A);
    const grazing = step(A, float(0.008));
    const inside = step(ox.mul(ox).add(oz.mul(oz)), R.mul(R));
    const hit = max(step(0.0, disc).mul(float(1.0).sub(grazing)), grazing.mul(inside));
    const tCy0 = mix(tC0, float(-1e5), grazing);
    const tCy1 = mix(tC1, float(1e5), grazing);
    const y0 = volBase.y.sub(volHalf.y);
    const y1 = y0.add(volHeight);
    const dy = mix(dir.y.sub(1e-5), dir.y.add(1e-5), step(0.0, dir.y));
    const tYa = y0.sub(origin.y).div(dy);
    const tYb = y1.sub(origin.y).div(dy);
    const tStart = max(max(max(tCy0, min(tYa, tYb)), tBox0), 0.0);
    const tEnd = min(min(tCy1, max(tYa, tYb)), tBox1);
    const span = max(tEnd.sub(tStart), 0.0).mul(hit);
    const stepLen = span.div(max(volSteps, 1.0));

    const acc = vec3(0, 0, 0).toVar();
    const tr = float(1).toVar();
    const pos = origin.add(dir.mul(tStart.add(stepLen.mul(0.5)))).toVar();
    const mid = origin.add(dir.mul(tStart.add(span.mul(0.42))));
    const scatter = practicalInscatter(mid).mul(0.08);

    const wsp = max(length(vec2(volWind.x, volWind.z)), 0.001);
    const wdx = volWind.x.div(wsp);
    const wdz = volWind.z.div(wsp);
    const mag = float(10.0).add(min(wsp, 12.0).mul(1.4));

    T.Loop(6, ({ i }: { i: unknown }) => {
      const live = step(float(i).add(0.5), volSteps);
      const rel = pos.sub(volBase);
      const height = rel.y.add(volHalf.y);
      const t = clamp(height.div(max(volHeight, 1.0)), 0.0, 1.0);
      const cover = min(float(1.0), t.div(0.5));
      const lean = mag.mul(max(t, cover.mul(0.9)));
      const twist = height.mul(0.0045).add(U.time.mul(0.05));
      const n = mx_noise_float(vec3(
        pos.x.mul(0.018).add(sin(height.mul(0.006)).mul(0.7)),
        height.mul(0.012).add(U.time.mul(0.02)),
        pos.z.mul(0.018).add(cos(height.mul(0.005)).mul(0.7)),
      ));
      const n01 = n.mul(0.5).add(0.5);
      const wave = sin(height.mul(0.011).add(0.5)).mul(0.5).add(0.5);
      const pinch = mix(float(0.78), float(1.2), n01);
      const radius = mix(float(14.0), float(40.0), wave).mul(pinch);
      const dx = rel.x.sub(wdx.mul(lean)).sub(cos(twist).mul(9.0));
      const dz = rel.z.sub(wdz.mul(lean)).sub(sin(twist).mul(9.0));
      const radial = sqrt(dx.mul(dx).add(dz.mul(dz)));
      const column = smoothstep(radius, radius.mul(0.12), radial)
        .mul(smoothstep(float(0.0), float(8.0), height))
        .mul(smoothstep(volHeight, volHeight.mul(0.9), height))
        .mul(mix(float(0.32), float(1.0), smoothstep(float(0.18), float(0.82), n01)));
      const gRad = sqrt(rel.x.mul(rel.x).add(rel.z.mul(rel.z)));
      const ground = smoothstep(volGroundR, volGroundR.mul(0.28), gRad)
        .mul(smoothstep(float(16.0), float(1.5), height))
        .mul(smoothstep(float(-1.0), float(1.2), height))
        .mul(mix(float(0.55), float(1.0), n01));
      const density = min(column.add(ground.mul(0.4)), float(1.05)).mul(volDensity);
      const core = smoothstep(radius.mul(0.34), radius.mul(0.05), radial)
        .mul(smoothstep(float(4.0), float(18.0), height))
        .mul(smoothstep(float(70.0), float(18.0), height));
      const ash = vec3(0.64, 0.65, 0.67).mul(8.0);
      const warm = vec3(FLAME[0], FLAME[1], FLAME[2]).mul(core).mul(6.0);
      const glow = ash.add(warm).add(scatter);
      const tau = density.mul(stepLen).mul(0.004).mul(live);
      const gain = float(1.0).sub(exp(tau.negate()));
      acc.addAssign(tr.mul(glow).mul(gain));
      tr.mulAssign(exp(tau.negate()));
      pos.addAssign(dir.mul(stepLen).mul(live));
    });

    const a = float(1.0).sub(tr);
    const dist = length(volBase.sub(cameraPosition));
    const thin = smoothstep(9000.0, 180.0, dist);
    const outA = a.mul(thin).mul(hit).mul(smoothstep(0.4, 3.0, span));
    return vec4(acc.mul(thin).mul(hit), outA);
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
  mesh.renderOrder = 8;
  mesh.visible = false;
  return mesh;
}

export function volumeActive(tier: Tier): boolean {
  return VOLUME_STEPS[tier] > 0;
}

export function syncVolumeSteps(tier: Tier): void {
  volSteps.value = VOLUME_STEPS[tier];
}
