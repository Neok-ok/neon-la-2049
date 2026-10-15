// Play-mode lens for the cinematic camera. Walk and fly keep the app pipeline.
// Bloom arguments match App.buildPipeline (strength 0.4, radius 0.3, threshold 1).
// The print sits after renderOutput(), so a lighting change to tone mapping still applies first.

import { Vector2, type Object3D, type PerspectiveCamera, type Scene, type WebGPURenderer, RenderPipeline } from 'three/webgpu';
import { compileForTarget, warmBloomPasses } from '../lighting/runtime.ts';
import { bootMark } from '../ui/loading';
import { createLensRig, type LensFrame } from './lensNode';
import { lightingResolutionScale, watchLightingResolutionScale } from '../lighting/memory';
import type { Tier } from '../core/quality';

export interface PlayLens {
  render(camera: PerspectiveCamera, frame: Omit<LensFrame, 'grainSeed'> & { grainSeed?: number }, exposure?: number): void;
  warm(pace: (() => Promise<void>) | null): Promise<void>;
  /** Draw the scene into the lens target, and nothing else. */
  renderPass(): void;
  /** Put the rig in the state `render` uses before the scene pass, so a warm links that program. */
  prepare(camera: PerspectiveCamera, frame: Omit<LensFrame, 'grainSeed'> & { grainSeed?: number }, exposure?: number): void;
  compileObject(object: Object3D, camera: PerspectiveCamera): Promise<void>;
  /** Link the scene pass in the state the next frame will draw. Yields between objects. */
  compileScene(): Promise<void>;
  dispose(): void;
}

export function createPlayLens(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  tier: Tier,
  bloomOn: boolean,
): PlayLens {
  const rig = createLensRig(
    scene,
    camera,
    tier,
    bloomOn,
    bloomOn ? { strength: 0.4, radius: 0.3, threshold: 1, from: 'scene' } : null,
  );
  const pipeline = new RenderPipeline(renderer, rig.node as never);
  pipeline.outputColorTransform = false;
  rig.setResolutionScale(lightingResolutionScale());
  const unwatch = watchLightingResolutionScale((scale) => rig.setResolutionScale(scale));
  const size = new Vector2();
  let seed = 0;

  return {
    compileObject(object: Object3D, cam: PerspectiveCamera) {
      return compileForTarget(renderer, object, cam, scene, rig.passTarget());
    },
    prepare(cam, frame, exposure) {
      if (exposure !== undefined) rig.setSceneExposure(exposure);
      rig.sync({ ...frame, grainSeed: frame.grainSeed ?? 0 });
      renderer.getDrawingBufferSize(size);
      rig.setTile(null, size.x, size.y);
      rig.advance(cam, size.y);
    },
    renderPass() {
      rig.scenePass.updateBefore({ renderer });
    },
    compileScene() {
      const pass = rig.scenePass as { compileAsync?: (r: WebGPURenderer) => Promise<void> };
      return pass.compileAsync ? pass.compileAsync(renderer) : Promise.resolve();
    },
    async warm(pace) {
      await rig.warm(renderer, pace, () => {
        const t0 = performance.now();
        pipeline.render();
        bootMark(`lens output ${Math.round(performance.now() - t0)}`);
      });
      if (rig.bloom) await warmBloomPasses(renderer, rig.bloom, pace);
    },
    render(cam: PerspectiveCamera, frame: Omit<LensFrame, 'grainSeed'> & { grainSeed?: number }, exposure?: number) {
      if (exposure !== undefined) rig.setSceneExposure(exposure);
      seed = (seed + 1) % 997;
      rig.sync({ ...frame, grainSeed: seed + (frame.grainSeed ?? 0) });
      renderer.getDrawingBufferSize(size);
      rig.setTile(null, size.x, size.y);
      rig.advance(cam, size.y);
      rig.present(renderer, pipeline);
    },
    dispose() {
      unwatch();
      pipeline.dispose();
      rig.dispose();
    },
  };
}
