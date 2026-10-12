// Lit billboards. The card faces the camera. A flipbook breaks the disc up,
// a depth fade (NVIDIA SDK 10 soft particles) kills the hard cut against a wall,
// and the lighting registry tints the puff. Output is premultiplied.
import {
  CustomBlending, DoubleSide, MeshBasicNodeMaterial, OneFactor, OneMinusSrcAlphaFactor,
} from 'three/webgpu';
import { uniform } from 'three/tsl';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';
import { resources } from '../../core/memory';
import { PRESETS } from '../../lighting/presets.ts';
import { practicalInscatter, practicalLit } from '../../lighting/shade.ts';
import { smokeAtlas } from './atlas';

const T = TSL as any;
const {
  Fn, abs, attribute, cameraPosition, cameraNear, cameraFar, cross, float, length, max, mix, mx_noise_float,
  normalize, perspectiveDepthToViewZ, positionView, screenUV, select, smoothstep, texture,
  vec2, vec3, vec4, viewportDepthTexture,
} = T;

/** 1 fades against the scene depth. 0 keeps a soft disc if the depth copy is empty. */
export const smokeSoft = uniform(1);
export const smokeRain = uniform(0);

const FLAME = PRESETS.flare.rgb;

function shade(lit: boolean): MeshBasicNodeMaterial {
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

  const ctr = attribute('sctr', 'vec4');
  const meta = attribute('smeta', 'vec4');
  const extra = attribute('sxtra', 'vec4');
  const corner = attribute('scorner', 'vec2');
  const atlas = smokeAtlas();

  m.positionNode = Fn(() => {
    const center = ctr.xyz;
    const toCam = normalize(cameraPosition.sub(center));
    const ref = select(abs(toCam.y).greaterThan(0.92), vec3(1, 0, 0), vec3(0, 1, 0));
    const side = normalize(cross(ref, toCam));
    const up = normalize(cross(toCam, side));
    const size = max(ctr.w, 0.05);
    return center
      .add(side.mul(corner.x.mul(size)))
      .add(up.mul(corner.y.mul(size).mul(extra.y)));
  })();

  m.colorNode = Fn(() => {
    const life = meta.x;
    const kind = meta.y;
    const seed = meta.z;
    const alphaIn = meta.w;
    const frame = T.floor(T.fract(life.mul(0.92).add(seed.mul(2.7))).mul(8.0));
    const col = T.mod(frame, 4.0);
    const row = T.floor(frame.div(4.0));
    const cell = corner.mul(0.5).add(0.5).mul(0.9).add(0.05);
    const uv = vec2(col.add(cell.x).div(4.0), row.add(cell.y).div(2.0));
    const stamp = texture(atlas, uv);
    // One noise sample per card. Overlapping filled ovals were summing into a
    // smooth shaft. The floor keeps a night vent from disappearing.
    const n = mx_noise_float(vec3(
      ctr.x.mul(0.55).add(corner.x.mul(2.8)).add(seed.mul(4.1)),
      ctr.y.mul(0.62).add(corner.y.mul(3.4)).add(life.mul(0.4)),
      ctr.z.mul(0.55).add(seed.mul(2.2)),
    ));
    const lumps = smoothstep(float(-0.05), float(0.85), n);
    const launchK = smoothstep(6.15, 6.85, kind);
    // Creases darken the colour. Eating the alpha turned the column into specks.
    const shape = stamp.a.mul(smoothstep(1.15, 0.7, length(corner)));

    const toCam = normalize(cameraPosition.sub(ctr.xyz));
    const ref = select(abs(toCam.y).greaterThan(0.92), vec3(1, 0, 0), vec3(0, 1, 0));
    const side = normalize(cross(ref, toCam));
    const up = normalize(cross(toCam, side));
    const nxy = stamp.rg.mul(2.0).sub(1.0);
    const N = normalize(vec3(0, 0.72, 0).add(toCam.mul(0.45)).add(side.mul(nxy.x.mul(0.85))).add(up.mul(nxy.y.mul(0.85))));
    const V = toCam;

    // 0–3 steam, 4–6 soot (barrel, stack, exhaust), 7–8 launch.
    // The old edge sat on kind 4, so a burning barrel was painted white.
    const steam = float(1).sub(smoothstep(3.15, 3.85, kind));
    const launch = smoothstep(6.15, 6.85, kind);
    const barrel = smoothstep(3.55, 4.05, kind).mul(float(1).sub(smoothstep(4.45, 4.95, kind)));
    const stack = smoothstep(4.55, 5.05, kind).mul(float(1).sub(smoothstep(5.45, 5.95, kind)));
    const exhaustK = smoothstep(5.55, 6.05, kind).mul(float(1).sub(launch));
    // Unlit steam stays on the fog. authoredLift painted that grey at window brightness
    // in a dark alley. practicalLit is in nits, including the low-tier 34 m bake.
    const albedo = vec3(0.92, 0.93, 0.95).mul(steam)
      .add(vec3(0.36, 0.34, 0.32).mul(barrel))
      .add(vec3(0.3, 0.29, 0.28).mul(stack))
      .add(vec3(0.5, 0.51, 0.52).mul(exhaustK))
      .add(vec3(0.78, 0.76, 0.72).mul(launch));
    const body = U.fogColor.mul(albedo).mul(0.8);
    // A few nits, not authoredLift. A window is 18 nits (~0.78 after the night exposure).
    // Steam at ~4 nits is a dark wisp (~0.19) and the lamps still add on top.
    const sootK = barrel.add(stack).add(exhaustK);
    // 16 × ~0.84 is about 13 nits. One sheer card still reads; a stack stays under an 18-nit window.
    const ash = vec3(0.82, 0.84, 0.86).mul(steam).mul(9.0)
      .add(vec3(0.5, 0.48, 0.45).mul(sootK).mul(7.0))
      .add(vec3(0.72, 0.68, 0.62).mul(launch).mul(8.0));

    const world = ctr.xyz;
    const litScale = float(1.6);
    const scatterK = lit ? 1.4 : 0.4;
    const lamps = practicalLit(world, N, V, albedo).mul(litScale).add(practicalInscatter(world).mul(scatterK));
    const heatGain = launch.mul(0.45).add(barrel.mul(1.1)).add(stack.mul(0.4)).add(exhaustK.mul(0.15)).add(steam.mul(0.05));
    const coreDisc = smoothstep(float(0.5), float(0.02), length(corner));
    const heatMask = mix(float(1), coreDisc, launch);
    const heat = vec3(FLAME[0], FLAME[1], FLAME[2])
      .mul(extra.x)
      .mul(heatGain)
      .mul(heatMask)
      .mul(smoothstep(0.92, 0.04, life))
      .mul(8.0);
    const stackK = smoothstep(4.55, 5.05, kind).mul(float(1).sub(smoothstep(5.45, 5.95, kind)));
    const barrelK = smoothstep(3.55, 4.05, kind).mul(float(1).sub(smoothstep(4.45, 4.95, kind)));
    const shade = mix(float(0.55), float(0.12), launchK.add(stackK).add(barrelK.mul(0.65)));
    const crease = mix(shade, float(1), lumps);
    const hot = smoothstep(float(0.5), float(1.05), extra.x).mul(launch);
    const core = vec3(1.45, 0.82, 0.32).mul(hot).mul(coreDisc).mul(2.5);
    const rgb = body.mul(crease).add(ash.mul(crease)).add(lamps).add(heat).add(core);

    const dist = length(ctr.xyz.sub(cameraPosition));
    const thin = smoothstep(extra.w, extra.w.mul(0.2), dist);
    const sceneZ = perspectiveDepthToViewZ(viewportDepthTexture(screenUV), cameraNear, cameraFar);
    const gap = positionView.z.sub(sceneZ);
    const soft = smoothstep(0.0, max(extra.z, 0.25), gap);
    // An empty depth buffer sits on the near plane and would zero every card.
    const depthAlive = float(1).sub(smoothstep(float(-3.0), float(-0.35), sceneZ));
    const softFade = mix(float(1), soft, smokeSoft.mul(depthAlive));
    const rainDim = mix(float(1), float(0.78), smokeRain);
    const a = shape.mul(alphaIn).mul(thin).mul(softFade).mul(rainDim);
    return vec4(rgb.mul(a), a);
  })();
  return m;
}

let litMat: MeshBasicNodeMaterial | null = null;
let flatMat: MeshBasicNodeMaterial | null = null;

export function smokeMaterial(lit: boolean): MeshBasicNodeMaterial {
  if (lit) {
    if (!litMat) litMat = resources.material('smoke-billboard', () => shade(true));
    return litMat;
  }
  if (!flatMat) flatMat = resources.material('smoke-billboard-low', () => shade(false));
  return flatMat;
}
