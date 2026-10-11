// Photo post chain. Built on enter, disposed on exit. Normal play never constructs it.
// Scatter (depth of field, smear, flare) reads exposure-scaled linear colour. renderOutput
// applies the renderer tone map once. The print (grade, grain, vignette) runs after that.
import { Vector2, type Scene, type WebGPURenderer, type PerspectiveCamera, RenderPipeline } from 'three/webgpu';
import { CAPTURE_CAPS } from './limits';
import { createLensRig, type LensFrame, type LensRig } from './lensNode';
import { fStopFromAperture } from '../camera/lensModel';
import type { GradeId } from './types';
import type { Tier } from '../core/quality';
import { lightingResolutionScale, watchLightingResolutionScale } from '../lighting/memory';

export interface PhotoShade {
  focus: number;
  /** Legacy 0..1 slider. fStop wins when both are set. */
  aperture: number;
  fStop: number;
  focal: number;
  anamorphic: number;
  flare: number;
  motion: number;
  bloom: number;
  grain: number;
  vignette: number;
  grade: GradeId;
  gradeMix: number;
  grainSeed: number;
}

export interface PhotoPipeline {
  heavyBloom: boolean;
  dofTaps: number;
  render(): void;
  /** One capture tile. The scene pass otherwise draws once per animation frame, so a second render in that frame would repeat the viewfinder. */
  renderTile(): void;
  shade(s: PhotoShade): void;
  /** Scale linear nits before depth of field and renderOutput. Renderer exposure stays at 1, so AgX runs once. */
  setSceneExposure(exposure: number): void;
  /** Tile rectangle inside the full frame, in pixels. Null covers the drawing buffer (the viewfinder). */
  setTile(rect: { vx: number; vy: number; vw: number; vh: number; fullW: number; fullH: number } | null): void;
  dispose(): void;
}

export function createPhotoPipeline(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  tier: Tier,
): PhotoPipeline {
  const cap = CAPTURE_CAPS[tier];
  const rig: LensRig = createLensRig(
    scene,
    camera,
    tier,
    cap.heavyBloom,
    cap.heavyBloom ? { strength: 0.4, radius: 0.25, threshold: 0.9, from: 'optical' } : null,
  );
  const pipeline = new RenderPipeline(renderer, rig.node as never);
  pipeline.outputColorTransform = false;
  rig.setResolutionScale(lightingResolutionScale());
  const unwatchScale = watchLightingResolutionScale((scale) => rig.setResolutionScale(scale));
  const drawSize = new Vector2();

  function setTile(rect: { vx: number; vy: number; vw: number; vh: number; fullW: number; fullH: number } | null): void {
    if (!rect) {
      renderer.getDrawingBufferSize(drawSize);
      rig.setTile(null, drawSize.x, drawSize.y);
      return;
    }
    rig.setTile(rect, rect.vw, rect.vh);
  }

  return {
    heavyBloom: cap.heavyBloom,
    dofTaps: cap.dofTaps,
    shade(s: PhotoShade) {
      const frame: LensFrame = {
        focus: s.focus,
        focalMm: s.focal,
        fStop: s.fStop > 0 ? s.fStop : fStopFromAperture(s.aperture),
        anamorphic: s.anamorphic,
        flare: s.flare,
        grain: s.grain,
        vignette: s.vignette,
        grade: s.grade,
        gradeMix: s.gradeMix,
        motion: s.motion,
        grainSeed: s.grainSeed,
      };
      rig.sync(frame);
      rig.setBloom(s.bloom);
      setTile(null);
    },
    setSceneExposure(exposure: number) {
      rig.setSceneExposure(exposure);
    },
    setTile,
    render() {
      renderer.getDrawingBufferSize(drawSize);
      rig.setTile(null, drawSize.x, drawSize.y);
      rig.advance(camera, drawSize.y);
      rig.present(renderer, pipeline);
    },
    renderTile() {
      // Do not advance the motion matrices between tiles or the smear changes across the picture.
      rig.syncCamera(camera);
      rig.present(renderer, pipeline);
    },
    dispose() {
      unwatchScale();
      pipeline.dispose();
      rig.dispose();
    },
  };
}
