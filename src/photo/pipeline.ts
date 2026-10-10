// Photo post chain. Built on enter, disposed on exit. Normal play never constructs it.
// Depth of field is a few gather taps, not three's 64-tap DoF, which keeps several
// half-float buffers and is too heavy for a phone. Low and medium also skip the
// mip bloom and use a short glow in this same shader.
import { Vector3, type Scene, type WebGPURenderer, type PerspectiveCamera, RenderPipeline } from 'three/webgpu';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import * as TSL from 'three/tsl';
import { gradeById } from './grades';
import { CAPTURE_CAPS, dofOffsets } from './limits';
import type { GradeId } from './types';
import type { Tier } from '../core/quality';

const T = TSL as any;

export interface PhotoShade {
  focus: number;
  aperture: number;
  bloom: number;
  grain: number;
  vignette: number;
  grade: GradeId;
  grainSeed: number;
}

export interface PhotoPipeline {
  heavyBloom: boolean;
  dofTaps: number;
  render(): void;
  shade(s: PhotoShade): void;
  dispose(): void;
}

export function createPhotoPipeline(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  tier: Tier,
): PhotoPipeline {
  const cap = CAPTURE_CAPS[tier];
  const taps = dofOffsets(cap.dofTaps);
  const uFocus = T.uniform(12);
  const uAperture = T.uniform(0.4);
  const uMaxPx = T.uniform(cap.dofPx);
  const uBloom = T.uniform(cap.heavyBloom ? 0.4 : 0.28);
  const uGrain = T.uniform(0.18);
  const uVignette = T.uniform(0.35);
  const uLift = T.uniform(new Vector3());
  const uGain = T.uniform(new Vector3(1, 1, 1));
  const uSat = T.uniform(1);
  const uContrast = T.uniform(1);
  const uGamma = T.uniform(1);
  const uGrainSeed = T.uniform(0);

  // samples: 0 keeps a plain depth texture. MSAA depth on the WebGL2 fallback is the
  // blit that reversed-Z already had to avoid, so the photo pass does not ask for it.
  const scenePass = T.pass(scene, camera, { samples: 0 });
  const color = scenePass.getTextureNode('output');
  const depth = scenePass.getTextureNode('depth');

  const viewDist = (uvNode: unknown) => {
    const d = depth.sample(uvNode).r;
    const z = T.perspectiveDepthToViewZ(d, T.cameraNear, T.cameraFar);
    return T.abs(z);
  };

  const dof = T.Fn(() => {
    const uv0 = T.uv();
    const texel = T.vec2(1, 1).div(T.screenSize);
    const center = viewDist(uv0);
    const band = uFocus.mul(T.float(1).sub(uAperture).mul(3.2).add(0.1)).add(0.4);
    const coc = center.sub(uFocus).abs().div(band).mul(uAperture);
    const radius = T.min(coc, T.float(1)).mul(uMaxPx);
    let acc = T.vec3(0, 0, 0);
    let wsum = T.float(0);
    for (const [ox, oy] of taps) {
      const uv = T.clamp(uv0.add(T.vec2(ox, oy).mul(texel).mul(radius)), T.vec2(0, 0), T.vec2(1, 1));
      const dist = viewDist(uv);
      const front = T.smoothstep(T.float(0), T.float(0.8), center.sub(dist));
      const w = T.float(1).sub(front.mul(0.9));
      acc = acc.add(color.sample(uv).rgb.mul(w));
      wsum = wsum.add(w);
    }
    const sharp = color.sample(uv0).rgb;
    const blurred = acc.div(T.max(wsum, T.float(0.0001)));
    const amt = T.smoothstep(T.float(0.04), T.float(0.55), coc).mul(uAperture);
    return T.vec4(T.mix(sharp, blurred, amt), 1);
  })();

  let image = dof;
  let bloomNode: { strength: { value: number }; dispose(): void } | null = null;
  if (cap.heavyBloom) {
    bloomNode = bloom(dof, 0.4, 0.25, 0.9);
    image = dof.add(bloomNode);
  }

  const graded = T.Fn(() => {
    let c = image.rgb;
    const luma = c.dot(T.vec3(0.2126, 0.7152, 0.0722));
    c = T.mix(T.vec3(luma), c, uSat);
    c = c.sub(0.5).mul(uContrast).add(0.5);
    c = T.max(c, T.vec3(0, 0, 0));
    c = c.mul(uGain).add(uLift);
    c = T.pow(c, T.vec3(1, 1, 1).div(T.max(uGamma, T.float(0.2))));
    const n = T.fract(T.sin(T.uv().x.mul(T.screenSize.x).add(T.uv().y.mul(T.screenSize.y).mul(13.7)).add(uGrainSeed)).mul(43758.5453));
    c = c.add(n.sub(0.5).mul(uGrain));
    const vig = T.smoothstep(T.float(0.35), T.float(1.15), T.length(T.uv().sub(0.5)).mul(1.7)).mul(uVignette);
    c = c.mul(T.float(1).sub(vig));
    if (!cap.heavyBloom) {
      const texel = T.vec2(1, 1).div(T.screenSize).mul(6);
      let glow = T.vec3(0, 0, 0);
      const ring: Array<[number, number]> = [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]];
      for (const [ox, oy] of ring) {
        const rgb = color.sample(T.uv().add(T.vec2(ox, oy).mul(texel))).rgb;
        const l = rgb.dot(T.vec3(0.2126, 0.7152, 0.0722));
        glow = glow.add(rgb.mul(T.smoothstep(T.float(0.55), T.float(1.4), l)));
      }
      c = c.add(glow.mul(uBloom.mul(0.08)));
    }
    return T.vec4(c, 1);
  })();

  const pipeline = new RenderPipeline(renderer, graded);

  return {
    heavyBloom: cap.heavyBloom,
    dofTaps: taps.length,
    shade(s: PhotoShade) {
      uFocus.value = Math.max(0.35, s.focus);
      uAperture.value = Math.max(0, Math.min(1, s.aperture));
      uBloom.value = Math.max(0, s.bloom);
      uGrain.value = Math.max(0, s.grain) * 0.18;
      uVignette.value = Math.max(0, Math.min(1, s.vignette));
      uGrainSeed.value = s.grainSeed;
      const g = gradeById(s.grade);
      (uLift.value as Vector3).set(g.lift[0], g.lift[1], g.lift[2]);
      (uGain.value as Vector3).set(g.gain[0], g.gain[1], g.gain[2]);
      uSat.value = g.saturation;
      uContrast.value = g.contrast;
      uGamma.value = g.gamma;
      if (bloomNode) bloomNode.strength.value = Math.max(0, s.bloom);
    },
    render() {
      pipeline.render();
    },
    dispose() {
      pipeline.dispose();
      bloomNode?.dispose();
      scenePass.dispose?.();
    },
  };
}
