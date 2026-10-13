// Lit soft shells. A few camera-facing veils, not a filled march.
//
// Each fragment builds its own density: three octaves of value noise, the
// sample point pushed by a 2D curl, then a light-direction shade from the
// density gradient. Alpha is premultiplied and capped, so two curtains cannot
// become a spotlight. Depth fade is the NVIDIA soft-particle gap. Output is
// nits. No atlas, no new light, no authored lift.
import {
  CustomBlending, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh,
  MeshBasicNodeMaterial, OneFactor, OneMinusSrcAlphaFactor, PlaneGeometry,
} from 'three/webgpu';
import { uniform } from 'three/tsl';
import * as TSL from 'three/tsl';
import { fogDepth } from '../../atmosphere/SkyFog';
import { U } from '../../atmosphere/uniforms';
import { params } from '../../core/params';
import { resources } from '../../core/memory';
import { PRESETS } from '../../lighting/presets.ts';
import { practicalInscatter } from '../../lighting/shade.ts';
import { SMOKE_LAUNCH_SHELL, SMOKE_MANHOLE_SHELL } from './flags';

const T = TSL as any;
const {
  Fn, abs, attribute, cameraFar, cameraNear, cameraPosition, clamp, cross, dot, exp, float,
  floor, fract, length, max, min, mix, normalize, perspectiveDepthToViewZ, positionView,
  screenUV, sin, smoothstep, step, uv, vec2, vec3, vec4, viewportDepthTexture,
} = T;

/** Launch curtains plus a manhole stack. The buffer stays this size on every tier. */
export const SHELL_MAX = 12;

export const shellRain = uniform(0);

const FLAME = PRESETS.flare.rgb;

export interface ShellPlacement {
  x: number;
  y: number;
  z: number;
  halfW: number;
  halfH: number;
  seed: number;
  /** 0 manhole (faces the camera). 1 launch (stays vertical). */
  kind: number;
  /** 0–1, launch only. Warmth on the lower scraps. */
  heat: number;
  /** Scales density. Capped again in the shader. */
  peak: number;
  /** Soft-particle range, metres. */
  soft: number;
}

let mesh: InstancedMesh | null = null;
let a0: InstancedBufferAttribute | null = null;
let a1: InstancedBufferAttribute | null = null;
let a2: InstancedBufferAttribute | null = null;
let shown = 0;

/** True when this page load is allowed to draw shells. City flags stay off. */
export function shellsRequested(): boolean {
  return SMOKE_LAUNCH_SHELL || SMOKE_MANHOLE_SHELL || params.smoke === 'shell';
}

const hash21 = Fn(([p]: [unknown]) => {
  return fract(sin(dot(vec2(p), vec2(139.31, 91.77))).mul(19617.17));
});

const value2 = Fn(([p]: [unknown]) => {
  const q = vec2(p);
  const i = floor(q);
  const f = fract(q);
  const u = f.mul(f).mul(vec2(3.0, 3.0).sub(f.mul(2.0)));
  const a = hash21(i);
  const b = hash21(i.add(vec2(1.0, 0.0)));
  const c = hash21(i.add(vec2(0.0, 1.0)));
  const d = hash21(i.add(vec2(1.0, 1.0)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});

function shellMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial();
  m.transparent = true;
  m.depthWrite = false;
  m.depthTest = true;
  m.side = DoubleSide;
  m.fog = false;
  m.blending = CustomBlending;
  m.blendSrc = OneFactor;
  m.blendDst = OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = OneFactor;
  m.blendDstAlpha = OneMinusSrcAlphaFactor;
  m.premultipliedAlpha = true;
  m.forceSinglePass = true;

  m.positionNode = Fn(() => {
    const sh0 = attribute('sh0', 'vec4');
    const sh1 = attribute('sh1', 'vec4');
    const center = sh0.xyz;
    const halfW = max(sh0.w, 0.15);
    const halfH = max(sh1.x, 0.15);
    const launch = step(0.5, sh1.z);
    const corner = uv().mul(2.0).sub(1.0);
    const toCam = normalize(cameraPosition.sub(center));
    const sideCyl = normalize(cross(vec3(0.0, 1.0, 0.0), toCam).add(vec3(0.001, 0.0, 0.001)));
    const upCyl = vec3(0.0, 1.0, 0.0);
    const ref = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), step(0.92, abs(toCam.y)));
    const sideFull = normalize(cross(ref, toCam));
    const upFull = normalize(cross(toCam, sideFull));
    const side = mix(sideFull, sideCyl, launch);
    const up = mix(upFull, upCyl, launch);
    return center.add(side.mul(corner.x.mul(halfW))).add(up.mul(corner.y.mul(halfH)));
  })();

  m.colorNode = Fn(() => {
    const sh0 = attribute('sh0', 'vec4');
    const sh1 = attribute('sh1', 'vec4');
    const sh2 = attribute('sh2', 'vec4');
    const center = sh0.xyz;
    const seed = sh1.y;
    const launch = step(0.5, sh1.z);
    const hole = float(1.0).sub(launch);
    const heat = sh2.x;
    const peak = sh2.y;
    const softDist = max(sh2.z, 0.2);
    const corner = uv().mul(2.0).sub(1.0);

    const rise = U.time.mul(0.07);
    const flow = vec2(
      corner.x.mul(1.35).add(seed.mul(4.7)),
      corner.y.mul(1.55).sub(rise).add(seed.mul(2.1)),
    );
    const e = float(0.16);
    const nL = value2(flow.sub(vec2(e, 0.0)));
    const nR = value2(flow.add(vec2(e, 0.0)));
    const nD = value2(flow.sub(vec2(0.0, e)));
    const nU = value2(flow.add(vec2(0.0, e)));
    const dx = nR.sub(nL);
    const dy = nU.sub(nD);
    const curl = vec2(dy.negate(), dx).mul(0.85);
    const spun = flow.add(curl);

    const o0 = value2(spun);
    const o1 = value2(spun.mul(2.07).add(vec2(5.2, 1.4).add(seed)));
    const o2 = value2(spun.mul(4.15).add(vec2(1.8, 8.6)));
    const body = o0.mul(0.52).add(o1.mul(0.31)).add(o2.mul(0.17));

    const radial = length(corner.mul(vec2(0.82, 0.96)));
    const edge = smoothstep(float(1.05), float(0.18), radial);
    const column = smoothstep(float(1.0), float(0.22), abs(corner.x))
      .mul(smoothstep(float(-1.02), float(-0.45), corner.y))
      .mul(smoothstep(float(1.02), float(0.35), corner.y));
    const mask = mix(column, edge, launch);
    const veil = smoothstep(float(0.30), float(0.56), body).mul(0.42);
    const shred = smoothstep(float(0.50), float(0.78), body);
    const dens = max(veil, shred).mul(mask);

    const light = clamp(float(0.40).add(dx.mul(-2.4)).add(dy.mul(1.15)), float(0.32), float(1.0));
    const belly = mix(float(1.0), float(0.58), smoothstep(float(0.42), float(0.82), body));
    const ash = vec3(0.70, 0.72, 0.74).mul(hole).mul(13.0)
      .add(vec3(0.60, 0.61, 0.64).mul(launch).mul(12.0));
    const bottom = smoothstep(float(0.2), float(-0.8), corner.y);
    const warm = vec3(FLAME[0], FLAME[1], FLAME[2]).mul(heat).mul(bottom).mul(launch).mul(shred).mul(6.0);
    const scatter = practicalInscatter(center).mul(0.12);
    const lit = ash.mul(light).mul(belly).add(warm).add(scatter);

    const dist = length(center.sub(cameraPosition));
    const sceneZ = perspectiveDepthToViewZ(viewportDepthTexture(screenUV), cameraNear, cameraFar);
    const gap = positionView.z.sub(sceneZ);
    const soft = smoothstep(0.0, softDist, gap);
    const depthAlive = float(1.0).sub(smoothstep(float(-3.0), float(-0.35), sceneZ));
    const softFade = mix(float(1.0), soft, depthAlive);
    const fogA = exp(fogDepth(cameraPosition, center).mul(-1.05));
    const fog = mix(float(1.0), fogA, hole);
    const near = smoothstep(float(2.4), float(4.2), dist);
    const far = smoothstep(float(20.0), float(8.0), dist);
    const streetFade = near.mul(far);
    const fade = mix(float(1.0), streetFade, hole);
    const rain = mix(float(1.0), float(1.12), shellRain.mul(hole));
    const a = min(dens.mul(peak), float(0.58)).mul(softFade).mul(fog).mul(fade).mul(rain);
    return vec4(lit.mul(a), a);
  })();
  return m;
}

export function shellMesh(): InstancedMesh {
  if (mesh && a0 && a1 && a2) return mesh;
  const geo = resources.geometry(() => new PlaneGeometry(1, 1), {
    label: 'smoke-shell',
    owner: 'smoke',
    evictable: true,
  });
  a0 = new InstancedBufferAttribute(new Float32Array(SHELL_MAX * 4), 4);
  a1 = new InstancedBufferAttribute(new Float32Array(SHELL_MAX * 4), 4);
  a2 = new InstancedBufferAttribute(new Float32Array(SHELL_MAX * 4), 4);
  a0.setUsage(DynamicDrawUsage);
  a1.setUsage(DynamicDrawUsage);
  a2.setUsage(DynamicDrawUsage);
  geo.setAttribute('sh0', a0);
  geo.setAttribute('sh1', a1);
  geo.setAttribute('sh2', a2);
  const mat = resources.material('smoke-shell', () => shellMaterial());
  mesh = new InstancedMesh(geo, mat, SHELL_MAX);
  mesh.name = 'smoke-shells';
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  mesh.count = 0;
  mesh.visible = false;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  return mesh;
}

export function shellCount(): number {
  return shown;
}

export function syncShells(list: readonly ShellPlacement[]): void {
  if (!mesh && list.length === 0) return;
  const draw = shellMesh();
  if (!a0 || !a1 || !a2) return;
  const n = Math.min(list.length, SHELL_MAX);
  shown = n;
  draw.visible = n > 0;
  draw.count = n;
  for (let i = 0; i < n; i++) {
    const s = list[i]!;
    a0.setXYZW(i, s.x, s.y, s.z, s.halfW);
    a1.setXYZW(i, s.halfH, s.seed, s.kind, 0);
    a2.setXYZW(i, s.heat, s.peak, s.soft, 0);
  }
  a0.needsUpdate = true;
  a1.needsUpdate = true;
  a2.needsUpdate = true;
  draw.instanceMatrix.needsUpdate = true;
}
