// Lens stage.
// Scatter (depth of field, motion smear, horizontal flare, edge fringing) reads the
// linear scene colour, which is where a thin lens actually bends light. The print
// (grade, grain, vignette) is a separate node after renderOutput(), so it sits on
// top of whatever tone map the renderer is using.
//
// Circle of confusion, millimetres, then pixels of the film height:
//   c = (f^2 / (N * (S - f))) * |S - D| / D
// The blur is a half-resolution disc: a box prefilter, then samples that stay one texel
// apart and fade out past the clamped radius. The full-resolution picture is kept wherever
// the circle is under about a pixel, and the upsample rejects a neighbour whose focus does not match.
// View-Z is reconstructed with the scene camera's near and far. A gather quad would otherwise
// substitute its own orthographic range and push every pixel to the blur clamp.
// Anamorphic squeeze stretches the gather vertically (oval bokeh after the desqueeze).
// Edge fringing is a fraction of a pixel at the frame edge. Grain is a hashed value, heavier in the shadows.

import { HalfFloatType, Matrix4, NearestFilter, NodeUpdateType, Vector2, Vector3, type PerspectiveCamera } from 'three/webgpu';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import * as TSL from 'three/tsl';
import { gradeById } from './grades';
import { CAPTURE_CAPS, dofDisc } from './limits';
import type { GradeId } from './types';
import type { Tier } from '../core/quality';

const T = TSL as any;

export interface LensFrame {
  focus: number;
  focalMm: number;
  fStop: number;
  anamorphic: number;
  flare: number;
  grain: number;
  vignette: number;
  grade: GradeId;
  gradeMix: number;
  motion: number;
  grainSeed: number;
}

export interface BloomSpec {
  strength: number;
  radius: number;
  threshold: number;
  /** Scene colour matches the play bloom. Optical blooms the defocused image. */
  from: 'scene' | 'optical';
}

export interface LensRig {
  node: unknown;
  bloom: { strength: { value: number }; updateBeforeType: string; updateBefore(frame: object): void; dispose(): void } | null;
  scenePass: { updateBeforeType: string; updateBefore(frame: object): void; dispose?: () => void };
  sync(frame: LensFrame): void;
  /** Cheap glow on low and medium, and the bloom node's strength when that node exists. */
  setBloom(amount: number): void;
  setTile(rect: { vx: number; vy: number; vw: number; vh: number; fullW: number; fullH: number } | null, drawW: number, drawH: number): void;
  /** Film height and projection. Capture tiles change the aspect without a motion step. */
  syncCamera(camera: PerspectiveCamera): void;
  /** Call once per displayed frame, never between capture tiles. */
  advance(camera: PerspectiveCamera, viewHeightPx: number): void;
  /**
   * Scene, half-res prefilter, disc gather, then bloom, then the pipeline.
   * The pipeline's own pass updates are muted so a capture tile is not one frame behind.
   */
  present(renderer: object, pipeline: { render(): void }): void;
  dispose(): void;
}

export function createLensRig(
  scene: unknown,
  camera: PerspectiveCamera,
  tier: Tier,
  withBloom: boolean,
  bloomSpec: BloomSpec | null = null,
): LensRig {
  const cap = CAPTURE_CAPS[tier];
  const disc = dofDisc(cap.dofRings);
  const pxPerTexel = 1 / cap.dofScale;
  const uFocus = T.uniform(12);
  const uFocal = T.uniform(35);
  const uFStop = T.uniform(4);
  const uSensor = T.uniform(24);
  const uNear = T.uniform(0.15);
  const uFar = T.uniform(60000);
  const uViewH = T.uniform(720);
  const uMaxPx = T.uniform(cap.dofPx);
  const uProjX = T.uniform(1);
  const uProjY = T.uniform(1);
  const uAnamorphic = T.uniform(0);
  const uFlare = T.uniform(0);
  const uCa = T.uniform(cap.caPx);
  const uGrain = T.uniform(0.08);
  const uVignette = T.uniform(0.3);
  const uGradeMix = T.uniform(1);
  const uMotion = T.uniform(0);
  const uMotionPx = T.uniform(cap.motionPx);
  const uGrainSeed = T.uniform(0);
  const uBloom = T.uniform(0);
  const uLift = T.uniform(new Vector3());
  const uGain = T.uniform(new Vector3(1, 1, 1));
  const uSat = T.uniform(1);
  const uContrast = T.uniform(1);
  const uGamma = T.uniform(1);
  const viewToPrev = new Matrix4();
  const uMat = T.uniform(viewToPrev);
  const uTileScale = T.uniform(new Vector2(1, 1));
  const uTileOffset = T.uniform(new Vector2());
  const uFullSize = T.uniform(new Vector2(1, 1));
  const uDrawSize = T.uniform(new Vector2(1, 1));
  const uDofTexel = T.uniform(new Vector2(1, 1));
  let tiled = false;

  const scenePass = T.pass(scene, camera, { samples: 0 });
  const color = scenePass.getTextureNode('output');
  const depth = scenePass.getTextureNode('depth');

  const rttOptions = { type: HalfFloatType, depthBuffer: false, generateMipmaps: false, resolutionScale: cap.dofScale };

  // Box-downsample the linear picture so each disc sample is already a small average, not a copy of a sign.
  const prefilterNode = T.Fn(() => {
    const uv = T.uv();
    const texel = T.vec2(1, 1).div(T.max(uDrawSize, T.vec2(1, 1)));
    const hx = texel.x.mul(0.5);
    const hy = texel.y.mul(0.5);
    const acc = color.sample(uv.add(T.vec2(hx, hy))).rgb
      .add(color.sample(uv.add(T.vec2(hx.mul(-1), hy))).rgb)
      .add(color.sample(uv.add(T.vec2(hx, hy.mul(-1)))).rgb)
      .add(color.sample(uv.add(T.vec2(hx.mul(-1), hy.mul(-1)))).rgb);
    return T.vec4(acc.mul(0.25), 1);
  })();
  const prefilter = T.rtt(prefilterNode, null, null, rttOptions);
  prefilter.updateBeforeType = NodeUpdateType.NONE;
  prefilter.name = 'dof-prefilter';

  // Gather stays on the texel grid. The circle of confusion only decides which rings contribute,
  // so a wide stop cannot pull the samples apart into stacks. Alpha stores the centre CoC for the upsample.
  const gatherNode = T.Fn(() => {
    const uv0 = T.uv();
    const viewDist = (uvNode: unknown) => T.abs(T.perspectiveDepthToViewZ(depth.sample(uvNode).r, uNear, uFar));
    const cocAt = (distNode: unknown) => {
      const f = T.max(uFocal, T.float(1));
      const nStop = T.max(uFStop, T.float(1.1));
      const sMm = T.max(uFocus, T.float(0.35)).mul(1000);
      const dMm = T.max(distNode, T.float(0.35)).mul(1000);
      const cocMm = f.mul(f).div(nStop.mul(T.max(sMm.sub(f), T.float(1)))).mul(T.abs(sMm.sub(dMm))).div(dMm);
      return cocMm.div(T.max(uSensor, T.float(1))).mul(T.max(uViewH, T.float(1)));
    };
    const center = viewDist(uv0);
    const centerCoc = cocAt(center);
    const reach = T.min(centerCoc, uMaxPx);
    const squeeze = T.mix(T.float(1), T.float(2), uAnamorphic);
    const feather = T.float(pxPerTexel).mul(0.75);

    let vel = T.vec2(0, 0);
    if (cap.motion) {
      const ndcX = uv0.x.mul(2).sub(1);
      const ndcY = uv0.y.mul(2).sub(1);
      const distZ = T.max(center, T.float(0.35));
      const viewZ = T.perspectiveDepthToViewZ(depth.sample(uv0).r, uNear, uFar);
      const viewX = ndcX.mul(distZ).div(T.max(uProjX, T.float(0.0001)));
      const viewY = ndcY.mul(distZ).div(T.max(uProjY, T.float(0.0001)));
      const clip = uMat.mul(T.vec4(viewX, viewY, viewZ, 1));
      const pw = T.max(T.abs(clip.w), T.float(0.0001));
      const raw = T.vec2(clip.x.div(pw).sub(ndcX), clip.y.div(pw).sub(ndcY)).mul(0.5);
      const vlen = T.max(T.length(raw), T.float(0.00001));
      const capUv = uMotionPx.div(T.max(uDrawSize.y, T.float(1)));
      vel = raw.mul(T.min(capUv, vlen).div(vlen)).mul(uMotion);
    }

    let acc = T.vec3(0, 0, 0);
    let wsum = T.float(0);
    const n = Math.max(1, disc.length - 1);
    disc.forEach(([ox, oy], i) => {
      const along = cap.motion ? (i / n - 0.5) : 0;
      const distPx = T.length(T.vec2(ox, oy)).mul(pxPerTexel);
      const gate = T.float(1).sub(T.smoothstep(T.max(reach.sub(feather), T.float(0)), reach.add(feather), distPx));
      const stretched = T.vec2(ox, T.float(oy).mul(squeeze));
      const uv = T.clamp(uv0.add(stretched.mul(uDofTexel)).add(vel.mul(along)), T.vec2(0, 0), T.vec2(1, 1));
      const dist = viewDist(uv);
      const sampleCoc = cocAt(dist);
      // A sharper sample must not stamp a focused edge into this pixel's blur.
      const sharper = T.smoothstep(T.float(0.35), T.float(1.8), centerCoc.sub(sampleCoc));
      const closer = T.smoothstep(T.float(0.35), T.float(1.8), center.sub(dist));
      const w = gate.mul(T.float(1).sub(sharper.mul(0.94))).mul(T.float(1).sub(closer.mul(0.8)));
      acc = acc.add(prefilter.sample(uv).rgb.mul(w));
      wsum = wsum.add(w);
    });
    return T.vec4(acc.div(T.max(wsum, T.float(0.0001))), centerCoc);
  })();
  const gather = T.rtt(gatherNode, null, null, { ...rttOptions, magFilter: NearestFilter, minFilter: NearestFilter });
  gather.updateBeforeType = NodeUpdateType.NONE;
  gather.name = 'dof-gather';

  const optical = T.Fn(() => {
    const uv0 = T.uv();
    const viewDist = (uvNode: unknown) => T.abs(T.perspectiveDepthToViewZ(depth.sample(uvNode).r, uNear, uFar));
    const cocAt = (distNode: unknown) => {
      const f = T.max(uFocal, T.float(1));
      const nStop = T.max(uFStop, T.float(1.1));
      const sMm = T.max(uFocus, T.float(0.35)).mul(1000);
      const dMm = T.max(distNode, T.float(0.35)).mul(1000);
      const cocMm = f.mul(f).div(nStop.mul(T.max(sMm.sub(f), T.float(1)))).mul(T.abs(sMm.sub(dMm))).div(dMm);
      return cocMm.div(T.max(uSensor, T.float(1))).mul(T.max(uViewH, T.float(1)));
    };
    const centerCoc = cocAt(viewDist(uv0));
    const sharp = color.sample(uv0).rgb;

    // Manual bilinear of the half-res disc. Hardware filtering would blend a focused texel into a blurred one.
    const coord = uv0.div(T.max(uDofTexel, T.vec2(1e-6, 1e-6))).sub(0.5);
    const frac = T.fract(coord);
    const origin = T.floor(coord);
    let acc = T.vec3(0, 0, 0);
    let wsum = T.float(0);
    const corners: Array<[number, number, any, any]> = [
      [0, 0, T.float(1).sub(frac.x), T.float(1).sub(frac.y)],
      [1, 0, frac.x, T.float(1).sub(frac.y)],
      [0, 1, T.float(1).sub(frac.x), frac.y],
      [1, 1, frac.x, frac.y],
    ];
    for (const [ix, iy, wx, wy] of corners) {
      const uv = T.clamp(origin.add(T.vec2(ix + 0.5, iy + 0.5)).mul(uDofTexel), T.vec2(0, 0), T.vec2(1, 1));
      const sample = gather.sample(uv);
      const agree = T.float(1).sub(T.smoothstep(T.float(0.5), T.float(2.5), T.abs(sample.a.sub(centerCoc))));
      const w = wx.mul(wy).mul(agree);
      acc = acc.add(sample.rgb.mul(w));
      wsum = wsum.add(w);
    }
    const safe = T.smoothstep(T.float(0.0001), T.float(0.02), wsum);
    const blurred = T.mix(sharp, acc.div(T.max(wsum, T.float(0.0001))), safe);
    // Cross over in about a pixel. A long mix leaves a sharp copy sitting inside the disc.
    const amt = T.smoothstep(T.float(0.75), T.float(1.7), centerCoc);
    let rgb = T.mix(sharp, blurred, amt);

    if (cap.caPx > 0) {
      const uvFrame = uv0.mul(uTileScale).add(uTileOffset);
      const edge = T.abs(uvFrame.x.sub(0.5)).mul(2);
      const shift = edge.mul(edge).mul(uCa).div(T.max(uDrawSize.x, T.float(1)));
      const base = color.sample(uv0);
      const r = color.sample(T.clamp(uv0.add(T.vec2(shift, 0)), T.vec2(0, 0), T.vec2(1, 1))).r;
      const b = color.sample(T.clamp(uv0.sub(T.vec2(shift, 0)), T.vec2(0, 0), T.vec2(1, 1))).b;
      const fringe = T.smoothstep(T.float(0.72), T.float(1), edge).mul(0.18);
      rgb = T.vec3(rgb.r.add(r.sub(base.r).mul(fringe)), rgb.g, rgb.b.add(b.sub(base.b).mul(fringe)));
    }

    const texel = T.vec2(1, 1).div(T.max(uDrawSize, T.vec2(1, 1)));
    if (cap.flareTaps > 0) {
      const offsets = flareOffsets(cap.flareTaps);
      let streak = T.vec3(0, 0, 0);
      let sw = T.float(0);
      for (const [px, w] of offsets) {
        const uv = T.clamp(uv0.add(T.vec2(texel.x.mul(px), 0)), T.vec2(0, 0), T.vec2(1, 1));
        const sample = color.sample(uv).rgb;
        const hot = T.smoothstep(T.float(2.4), T.float(7), sample.dot(T.vec3(0.2126, 0.7152, 0.0722)));
        streak = streak.add(sample.mul(hot).mul(w));
        sw = sw.add(w);
      }
      const tint = T.mix(T.vec3(1, 0.94, 0.82), uGain, T.float(0.45));
      rgb = rgb.add(streak.div(T.max(sw, T.float(0.0001))).mul(tint).mul(uFlare).mul(0.55));
    }

    if (!cap.heavyBloom) {
      const glowTexel = texel.mul(6);
      let glow = T.vec3(0, 0, 0);
      const ring: Array<[number, number]> = [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]];
      for (const [ox, oy] of ring) {
        const sample = color.sample(T.clamp(uv0.add(T.vec2(ox, oy).mul(glowTexel)), T.vec2(0, 0), T.vec2(1, 1))).rgb;
        const l = sample.dot(T.vec3(0.2126, 0.7152, 0.0722));
        glow = glow.add(sample.mul(T.smoothstep(T.float(0.55), T.float(1.4), l)));
      }
      rgb = rgb.add(glow.mul(uBloom.mul(0.08)));
    }
    return T.vec4(rgb, 1);
  })();

  let image = optical;
  let bloomNode: LensRig['bloom'] = null;
  if (withBloom && bloomSpec) {
    const source = bloomSpec.from === 'scene' ? color : optical;
    const node = bloom(source, bloomSpec.strength, bloomSpec.radius, bloomSpec.threshold);
    bloomNode = node as unknown as LensRig['bloom'];
    image = optical.add(node);
  }

  return finishRig(
    scenePass, bloomNode, prefilter, gather, image, camera, viewToPrev,
    {
      uFocus, uFocal, uFStop, uSensor, uNear, uFar, uViewH, uProjX, uProjY, uAnamorphic, uFlare, uCa,
      uGrain, uVignette, uGradeMix, uMotion, uGrainSeed, uBloom, uLift, uGain, uSat, uContrast, uGamma,
      uTileScale, uTileOffset, uFullSize, uDrawSize, uDofTexel,
    },
    () => tiled,
    (next) => { tiled = next; },
    cap.dofScale,
  );
}

interface Uniforms {
  uFocus: any; uFocal: any; uFStop: any; uSensor: any; uNear: any; uFar: any; uViewH: any; uProjX: any; uProjY: any;
  uAnamorphic: any; uFlare: any; uCa: any; uGrain: any; uVignette: any; uGradeMix: any;
  uMotion: any; uGrainSeed: any; uBloom: any; uLift: any; uGain: any; uSat: any; uContrast: any; uGamma: any;
  uTileScale: any; uTileOffset: any; uFullSize: any; uDrawSize: any; uDofTexel: any;
}

interface Pass {
  updateBeforeType: string;
  updateBefore(frame: object): void;
  dispose?: () => void;
}

function finishRig(
  scenePass: LensRig['scenePass'],
  bloomNode: LensRig['bloom'],
  prefilter: Pass,
  gather: Pass,
  image: any,
  _camera: PerspectiveCamera,
  viewToPrev: Matrix4,
  u: Uniforms,
  isTiled: () => boolean,
  setTiled: (next: boolean) => void,
  dofScale: number,
): LensRig {
  const displayed = T.renderOutput(image);
  const printed = T.Fn(() => {
    let c = displayed.rgb;
    const luma = c.dot(T.vec3(0.2126, 0.7152, 0.0722));
    const mixG = u.uGradeMix;
    c = T.mix(T.vec3(luma), c, T.mix(T.float(1), u.uSat, mixG));
    c = c.sub(0.5).mul(T.mix(T.float(1), u.uContrast, mixG)).add(0.5);
    c = T.max(c, T.vec3(0, 0, 0));
    c = c.mul(T.mix(T.vec3(1, 1, 1), u.uGain, mixG)).add(u.uLift.mul(mixG));
    const gamma = T.mix(T.float(1), u.uGamma, mixG);
    c = T.pow(c, T.vec3(1, 1, 1).div(T.max(gamma, T.float(0.2))));
    const uvFrame = T.uv().mul(u.uTileScale).add(u.uTileOffset);
    const stretch = T.mix(T.float(1), T.float(0.55), u.uAnamorphic);
    const x = uvFrame.x.mul(stretch).mul(u.uFullSize.x);
    const y = uvFrame.y.mul(u.uFullSize.y);
    const n = T.fract(T.sin(x.mul(12.9898).add(y.mul(78.233)).add(u.uGrainSeed.mul(4.17))).mul(43758.5453));
    const shadow = T.mix(T.float(1.25), T.float(0.4), T.clamp(luma, T.float(0), T.float(1)));
    c = c.add(n.sub(0.5).mul(u.uGrain).mul(shadow));
    const ex = T.mix(T.float(1.05), T.float(0.82), u.uAnamorphic);
    const vig = T.smoothstep(T.float(0.42), T.float(1.18), T.length(T.vec2(uvFrame.x.sub(0.5).mul(ex), uvFrame.y.sub(0.5)))).mul(u.uVignette);
    c = c.mul(T.float(1).sub(vig));
    return T.vec4(c, 1);
  })();

  const prevView = new Matrix4();
  const prevProj = new Matrix4();
  const lastPos = new Vector3();
  let primed = false;
  let passesReady = false;

  const syncCamera = (camera: PerspectiveCamera) => {
    camera.updateMatrixWorld();
    u.uSensor.value = Math.max(1, camera.getFilmHeight());
    u.uNear.value = Math.max(1e-4, camera.near);
    u.uFar.value = Math.max(camera.near + 1, camera.far);
    u.uProjX.value = camera.projectionMatrix.elements[0] || 1;
    u.uProjY.value = camera.projectionMatrix.elements[5] || 1;
  };

  return {
    node: printed,
    bloom: bloomNode,
    scenePass,
    sync(frame: LensFrame) {
      u.uFocus.value = Math.max(0.35, frame.focus);
      u.uFocal.value = Math.max(1, frame.focalMm);
      u.uFStop.value = Math.max(1.1, frame.fStop);
      u.uAnamorphic.value = Math.max(0, Math.min(1, frame.anamorphic));
      const scope = Math.max(0, Math.min(1, frame.anamorphic));
      u.uFlare.value = Math.max(0, frame.flare) * (0.2 + scope * 0.8);
      u.uGrain.value = Math.max(0, frame.grain) * 0.055;
      u.uVignette.value = Math.max(0, Math.min(1, frame.vignette));
      u.uGradeMix.value = Math.max(0, Math.min(1, frame.gradeMix));
      u.uMotion.value = Math.max(0, Math.min(1, frame.motion));
      u.uGrainSeed.value = frame.grainSeed;
      const g = gradeById(frame.grade);
      (u.uLift.value as Vector3).set(g.lift[0], g.lift[1], g.lift[2]);
      (u.uGain.value as Vector3).set(g.gain[0], g.gain[1], g.gain[2]);
      u.uSat.value = g.saturation;
      u.uContrast.value = g.contrast;
      u.uGamma.value = g.gamma;
    },
    setBloom(amount: number) {
      const v = Math.max(0, amount);
      u.uBloom.value = v;
      if (bloomNode) bloomNode.strength.value = v;
    },
    setTile(rect, drawW, drawH) {
      const dw = Math.max(1, drawW);
      const dh = Math.max(1, drawH);
      u.uDrawSize.value.set(dw, dh);
      const rw = Math.max(1, Math.floor(dw * dofScale));
      const rh = Math.max(1, Math.floor(dh * dofScale));
      u.uDofTexel.value.set(1 / rw, 1 / rh);
      if (!rect) {
        setTiled(false);
        u.uTileScale.value.set(1, 1);
        u.uTileOffset.value.set(0, 0);
        u.uFullSize.value.set(dw, dh);
        u.uViewH.value = dh;
      } else {
        setTiled(true);
        const fw = Math.max(1, rect.fullW);
        const fh = Math.max(1, rect.fullH);
        u.uTileScale.value.set(rect.vw / fw, rect.vh / fh);
        u.uTileOffset.value.set(rect.vx / fw, rect.vy / fh);
        u.uFullSize.value.set(fw, fh);
        // A capture tile is 1:1 with the output, so the circle uses the full frame height.
        u.uViewH.value = fh;
      }
    },
    syncCamera,
    advance(camera: PerspectiveCamera, viewHeightPx: number) {
      syncCamera(camera);
      if (!isTiled()) u.uViewH.value = Math.max(1, viewHeightPx);
      // A cut or a beat jump is not motion. One smeared frame would sit on screen for a long time.
      if (primed && lastPos.distanceTo(camera.position) > 40) primed = false;
      lastPos.copy(camera.position);
      if (!primed) {
        prevView.copy(camera.matrixWorldInverse);
        prevProj.copy(camera.projectionMatrix);
        viewToPrev.identity();
        primed = true;
        return;
      }
      viewToPrev.copy(prevProj).multiply(prevView).multiply(camera.matrixWorld);
      prevView.copy(camera.matrixWorldInverse);
      prevProj.copy(camera.projectionMatrix);
    },
    present(renderer, pipeline) {
      const frame = { renderer };
      // The first build assigns the half-res quads. Their textures are filled on the explicit pass below.
      if (!passesReady) {
        pipeline.render();
        gather.updateBefore(frame);
        passesReady = true;
      }
      scenePass.updateBefore(frame);
      prefilter.updateBefore(frame);
      gather.updateBefore(frame);
      bloomNode?.updateBefore(frame);
      const passType = scenePass.updateBeforeType;
      const bloomType = bloomNode?.updateBeforeType;
      scenePass.updateBeforeType = NodeUpdateType.NONE;
      if (bloomNode) bloomNode.updateBeforeType = NodeUpdateType.NONE;
      try {
        pipeline.render();
      } finally {
        scenePass.updateBeforeType = passType;
        if (bloomNode && bloomType !== undefined) bloomNode.updateBeforeType = bloomType;
      }
    },
    dispose() {
      bloomNode?.dispose();
      prefilter.dispose?.();
      gather.dispose?.();
      scenePass.dispose?.();
    },
  };
}

function flareOffsets(taps: number): Array<[number, number]> {
  const all: Array<[number, number]> = [
    [0, 0.2],
    [5, 1], [-5, 1],
    [12, 0.72], [-12, 0.72],
    [26, 0.42], [-26, 0.42],
    [48, 0.22], [-48, 0.22],
    [78, 0.1], [-78, 0.1],
    [120, 0.05], [-120, 0.05],
    [170, 0.03], [-170, 0.03],
    [230, 0.016], [-230, 0.016],
  ];
  return all.slice(0, Math.max(1, Math.min(all.length, taps + 1)));
}
