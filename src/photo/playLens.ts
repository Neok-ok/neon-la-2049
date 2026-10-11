// Play-mode lens for the cinematic camera. Walk and fly keep the app pipeline.
// Bloom arguments match App.buildPipeline (strength 0.4, radius 0.3, threshold 1).
// The print sits after renderOutput(), so a lighting change to tone mapping still applies first.

import { Vector2, type PerspectiveCamera, type Scene, type WebGPURenderer, RenderPipeline } from 'three/webgpu';
import { createLensRig, type LensFrame } from './lensNode';
import type { Tier } from '../core/quality';

export interface PlayLens {
  render(camera: PerspectiveCamera, frame: Omit<LensFrame, 'grainSeed'> & { grainSeed?: number }): void;
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
  const size = new Vector2();
  let seed = 0;

  return {
    render(cam: PerspectiveCamera, frame: Omit<LensFrame, 'grainSeed'> & { grainSeed?: number }) {
      seed = (seed + 1) % 997;
      rig.sync({ ...frame, grainSeed: seed + (frame.grainSeed ?? 0) });
      renderer.getDrawingBufferSize(size);
      rig.setTile(null, size.x, size.y);
      rig.advance(cam, size.y);
      pipeline.render();
    },
    dispose() {
      pipeline.dispose();
      rig.dispose();
    },
  };
}
