// Per-frame cluster upload, the HDR bloom chain, and the one sun shadow.
import {
  ACESFilmicToneMapping, AgXToneMapping, CanvasTexture, EquirectangularReflectionMapping, NeutralToneMapping,
  NoToneMapping, QuadMesh, RenderPipeline, SRGBColorSpace, Vector3, type Object3D, type ToneMapping,
  type DirectionalLight, type PerspectiveCamera, type RenderTarget, type Scene, type Texture, type WebGPURenderer,
} from 'three/webgpu';
import { acesFilmicToneMapping, agxToneMapping, neutralToneMapping, pass, uniform, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import type { Tier } from '../core/quality';
import { clusterAssign, volumetricPicks, type SlotLight } from './cluster.ts';
import { resources } from '../core/memory/resources';
import { authoredLift, currentEv, currentExposure } from './exposure.ts';
import {
  BLOOM_BASE_SCALE, envExtent, lightingMemory, lightingResolutionScale, shadowEdge,
  watchLightingResolutionScale, type LightingMemory,
} from './memory.ts';
import { BLOOM_THRESHOLD_NITS } from './presets.ts';
import { allLights } from './registry.ts';
import {
  authoredLiftU, bakedNits, clearShade, contactAmt, probeColor, probeStrength, writeHazeSlots, writeShadeSlots,
} from './shade.ts';
import { LIGHT_TIERS } from './tiers.ts';
import { bootMark } from '../ui/loading';

export type ToneId = 'agx' | 'aces' | 'neutral';

export function parseTone(value: string | undefined): ToneId {
  if (value === 'aces' || value === 'neutral' || value === 'agx') return value;
  return 'agx';
}

export function rendererTone(id: ToneId): ToneMapping {
  if (id === 'aces') return ACESFilmicToneMapping as ToneMapping;
  if (id === 'neutral') return NeutralToneMapping as ToneMapping;
  return AgXToneMapping as ToneMapping;
}

interface PassHandle {
  setResolutionScale(scale: number): void;
  getTextureNode(name?: string): unknown;
  dispose(): void;
}

interface BloomHandle {
  setResolutionScale(scale: number): void;
  smoothWidth?: { value: number };
  dispose(): void;
}

const exposureU = uniform(0.05);
let pipeline: RenderPipeline | null = null;
let scenePass: PassHandle | null = null;
let bloomNode: BloomHandle | null = null;
let envTex: CanvasTexture | null = null;
let savedEnv: Texture | null = null;
let haveSavedEnv = false;
let envSheen = -1;
let envW = 0;
let envH = 0;
let shadowEdgeLive = 0;

watchLightingResolutionScale((scale) => {
  scenePass?.setResolutionScale(scale);
  bloomNode?.setResolutionScale(BLOOM_BASE_SCALE * scale);
  envSheen = -1;
});

export interface LightingStats {
  retained: number;
  ephemeral: number;
  shaded: number;
  ev: number;
  exposure: number;
  tonemap: ToneId;
  tier: Tier;
  baked: boolean;
  probes: boolean;
  volumetric: boolean;
  sunShadow: boolean;
  memory: LightingMemory;
}

let last: LightingStats = {
  retained: 0, ephemeral: 0, shaded: 0, ev: 0, exposure: 0.05,
  tonemap: 'agx', tier: 'high', baked: false, probes: false, volumetric: false, sunShadow: false,
  memory: lightingMemory('high', 0, 0, 1, false),
};

export function lightingStats(): LightingStats {
  return last;
}

export function setGradeExposure(exposure: number): void {
  exposureU.value = exposure;
  authoredLiftU.value = authoredLift(exposure);
}

function toneNode(id: ToneId, color: unknown, exposure: unknown): unknown {
  if (id === 'aces') return acesFilmicToneMapping(color as never, exposure as never);
  if (id === 'neutral') return neutralToneMapping(color as never, exposure as never);
  return agxToneMapping(color as never, exposure as never);
}

/** Drop the bloom chain and its scene color target. Safe to call when none is live. */
export function disposeLightingPipeline(): void {
  bloomWarmed = false;
  bloomNode?.dispose();
  bloomNode = null;
  scenePass?.dispose();
  scenePass = null;
  pipeline?.dispose();
  pipeline = null;
}

/** HDR bloom on nits, then the chosen film curve. Low and medium stay on the renderer tone map. */
export function rebuildLightingPipeline(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  bloomOn: boolean,
  tone: ToneId,
): RenderPipeline | null {
  disposeLightingPipeline();
  if (!bloomOn) {
    renderer.toneMapping = rendererTone(tone);
    return null;
  }
  renderer.toneMapping = NoToneMapping;
  const scale = lightingResolutionScale();
  // samples 0: an MSAA half-float color target is the buffer that blows a phone budget.
  const passNode = pass(scene, camera, { samples: 0 }) as unknown as PassHandle;
  passNode.setResolutionScale(scale);
  scenePass = passNode;
  const color = passNode.getTextureNode('output');
  const glow = bloom(color as never, tone === 'neutral' ? 0.03 : 0.04, 0.28, BLOOM_THRESHOLD_NITS) as unknown as BloomHandle;
  glow.setResolutionScale(BLOOM_BASE_SCALE * scale);
  if (glow.smoothWidth) glow.smoothWidth.value = 16;
  bloomNode = glow;
  const combined = (color as { add: (n: unknown) => unknown }).add(glow);
  pipeline = new RenderPipeline(renderer, vec4(toneNode(tone, combined, exposureU) as never, 1));
  return pipeline;
}

/**
 * Link `object` into `target` with the renderer's current tone mapping.
 * An offscreen target already drops the tone map. Forcing it here built a different program
 * from the pass, and the first real frame linked every mesh again.
 */
export async function compileForTarget(
  renderer: WebGPURenderer,
  object: Object3D,
  camera: PerspectiveCamera,
  scene: Scene,
  target: RenderTarget | null,
): Promise<void> {
  const prev = renderer.getRenderTarget();
  if (target) renderer.setRenderTarget(target);
  try {
    await renderer.compileAsync(object, camera, scene);
  } finally {
    if (target) renderer.setRenderTarget(prev);
  }
}

export function lightingPassTarget(): RenderTarget | null {
  const pass = scenePass as { renderTarget?: RenderTarget } | null;
  return pass?.renderTarget ?? null;
}

/**
 * Draw the bloom scene pass the way the next frame will.
 * One mesh at a time, so the link is not shared with the rest of the city.
 * Returns false when this tier has no offscreen pass and the caller should render directly.
 */
export function renderLightingPass(renderer: WebGPURenderer): boolean {
  const pass = scenePass as { updateBefore?: (frame: object) => void } | null;
  if (!pass?.updateBefore) return false;
  pass.updateBefore({ renderer });
  return true;
}

/**
 * Draw the scene pass, the bloom mips, then the grade quad.
 * `pipeline.render()` alone renders the scene from inside the quad, which links
 * a second variant of every mesh. The pass stays muted while the quad runs.
 * Bloom is filled explicitly: the grade material was first built while that
 * update was muted, so the per-frame hook does not run on its own.
 */
export function presentLightingPipeline(renderer: WebGPURenderer): boolean {
  if (!pipeline) return false;
  const frame = { renderer };
  const pass = scenePass as { updateBefore?: (frame: object) => void; updateBeforeType?: string } | null;
  const glow = bloomNode as { updateBefore?: (frame: object) => void; updateBeforeType?: string } | null;
  // The grade quad was first drawn while bloom updates were muted, so the frame
  // hook never registered. Fill the mips from the scene color that was just drawn.
  pass?.updateBefore?.(frame);
  const passType = pass?.updateBeforeType;
  const glowType = glow?.updateBeforeType;
  if (pass) pass.updateBeforeType = 'none';
  if (glow) glow.updateBeforeType = 'none';
  try {
    glow?.updateBefore?.(frame);
    pipeline.render();
  } finally {
    if (pass && passType !== undefined) pass.updateBeforeType = passType;
    if (glow && glowType !== undefined) glow.updateBeforeType = glowType;
  }
  return true;
}

/** Link the bloom scene pass one object at a time, in the pass's own target. */
export function compileLightingScene(renderer: WebGPURenderer): Promise<void> {
  const pass = scenePass as { compileAsync?: (r: WebGPURenderer) => Promise<void> } | null;
  if (!pass?.compileAsync) return Promise.resolve();
  return pass.compileAsync(renderer);
}

export async function compileLightingObject(
  renderer: WebGPURenderer,
  object: Object3D,
  camera: PerspectiveCamera,
  scene: Scene,
): Promise<void> {
  await compileForTarget(renderer, object, camera, scene, lightingPassTarget());
}

let bloomWarmed = false;

interface BloomWarm {
  updateBefore?: (frame: object) => void;
  _nMips?: number;
  _highPassFilterMaterial?: object | null;
}

/**
 * Link each bloom draw on the same quad the pass uses.
 * A full `updateBefore` links the high pass, every mip, and the composite in one task.
 * Earlier draws in that function are skipped until their own step, so each task links one program.
 */
export async function warmBloomPasses(
  renderer: WebGPURenderer,
  bloom: object,
  pace: (() => Promise<void>) | null = null,
): Promise<void> {
  const node = bloom as BloomWarm;
  if (!node.updateBefore || !node._highPassFilterMaterial) return;
  const passes = 1 + (node._nMips ?? 5) * 2 + 1;
  const proto = QuadMesh.prototype as unknown as { render: (r: WebGPURenderer) => void };
  const orig = proto.render;
  let ordinal = 0;
  let only = 0;
  proto.render = function (this: unknown, r: WebGPURenderer) {
    ordinal += 1;
    if (ordinal !== only) return;
    return orig.call(this, r);
  };
  // The high pass samples the scene color. Leaving the pass on FRAME renders
  // every mesh that is already in the scene, and that one task links them all.
  const pass = scenePass as { updateBeforeType?: string } | null;
  const passType = pass?.updateBeforeType;
  if (pass) pass.updateBeforeType = 'none';
  try {
    const frame = { renderer };
    for (let step = 1; step <= passes; step++) {
      ordinal = 0;
      only = step;
      const t0 = performance.now();
      node.updateBefore(frame);
      bootMark(`bloom ${step} ${Math.round(performance.now() - t0)}`);
      if (pace) await pace();
    }
  } finally {
    proto.render = orig;
    if (pass && passType !== undefined) pass.updateBeforeType = passType;
  }
}

/**
 * Link the bloom scene pass, the grade quad, and each bloom mip one at a time.
 * The first `pipeline.render()` would otherwise block on every program.
 * `pace` yields between programs when the caller has a macrotask yield.
 */
export async function warmLightingPipeline(
  renderer: WebGPURenderer,
  _scene: Scene,
  pace: (() => Promise<void>) | null = null,
): Promise<void> {
  void _scene;
  // The scene itself is warmed one mesh at a time through renderLightingPass.
  // compileAsync here built a different program from the real pass, and the
  // first pipeline.render() then linked every mesh again.
  const pass = scenePass as { updateBeforeType?: string } | null;
  const glow = bloomNode as { updateBeforeType?: string } | null;
  const passType = pass?.updateBeforeType;
  const glowType = glow?.updateBeforeType;
  if (pass) pass.updateBeforeType = 'none';
  if (glow) glow.updateBeforeType = 'none';
  try {
    if (pipeline) {
      const t0 = performance.now();
      pipeline.render();
      bootMark(`grade quad ${Math.round(performance.now() - t0)}`);
      if (pace) await pace();
    }
  } finally {
    if (pass && passType !== undefined) pass.updateBeforeType = passType;
    if (glow && glowType !== undefined) glow.updateBeforeType = glowType;
  }
  if (bloomWarmed || !bloomNode) return;
  await warmBloomPasses(renderer, bloomNode, pace);
  bloomWarmed = true;
}

function paintEnvironment(sheen: number, W: number, H: number): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  if (!g) {
    return resources.texture(() => {
      const tex = new CanvasTexture(cv);
      tex.mapping = EquirectangularReflectionMapping;
      tex.colorSpace = SRGBColorSpace;
      return tex;
    }, { label: 'lighting-probe', owner: 'lighting', evictable: false });
  }
  const sodium = sheen > 0.55;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#07080c');
  grad.addColorStop(0.42, sodium ? '#3a2414' : '#24182a');
  grad.addColorStop(0.5, sodium ? '#6a3a1c' : '#3a2048');
  grad.addColorStop(0.58, '#120e10');
  grad.addColorStop(1, '#050506');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const neon = sodium
    ? ['#ff7a2a', '#ffb060', '#c45a18', '#ffd2a0', '#20d8ff']
    : ['#ff2d8c', '#20d8ff', '#ff8a1e', '#a040ff', '#30ffb0'];
  for (let i = 0; i < 36; i++) {
    g.fillStyle = neon[i % neon.length]!;
    g.globalAlpha = 0.22 + ((i * 17) % 10) / 28;
    const x = (i * 47) % W;
    const y = H * (0.44 + ((i * 13) % 10) / 100);
    g.fillRect(x, y, 2 + (i % 5), 2 + (i % 4));
  }
  g.globalAlpha = 1;
  return resources.texture(() => {
    const tex = new CanvasTexture(cv);
    tex.mapping = EquirectangularReflectionMapping;
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }, { label: 'lighting-probe', owner: 'lighting', evictable: false });
}

function releaseOwnEnv(scene: Scene): void {
  if (!envTex) return;
  const owned = envTex;
  envTex = null;
  envSheen = -1;
  envW = 0;
  envH = 0;
  if (scene.environment === owned && haveSavedEnv) scene.environment = savedEnv;
  owned.dispose();
}

function updateProbe(scene: Scene, sheen: number, enabled: boolean, slots: SlotLight[]): void {
  if (!enabled) {
    probeStrength.value = 0;
    releaseOwnEnv(scene);
    return;
  }
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (const s of slots) {
    if (s.candela <= 0) continue;
    const k = s.candela;
    r += s.r * k;
    g += s.g * k;
    b += s.b * k;
    w += k;
  }
  if (w > 0) probeColor.value.setRGB(r / w, g / w, b / w);
  else probeColor.value.setRGB(1, 0.5, 0.22);
  probeStrength.value = 0.22;
  const bucket = sheen > 0.55 ? 1 : 0;
  const extent = envExtent(lightingResolutionScale());
  if (!envTex || bucket !== envSheen || extent.w !== envW || extent.h !== envH) {
    if (!haveSavedEnv) {
      savedEnv = scene.environment;
      haveSavedEnv = true;
    }
    envTex?.dispose();
    envSheen = bucket;
    envW = extent.w;
    envH = extent.h;
    envTex = paintEnvironment(sheen, extent.w, extent.h);
    scene.environment = envTex;
  }
}

const _sun = new Vector3();
const _cam = new Vector3();

function disposeShadowMap(sun: DirectionalLight): void {
  const shadow = sun.shadow as DirectionalLight['shadow'] & { mapPass: { dispose(): void } | null };
  if (!shadow.map && !shadow.mapPass) {
    shadowEdgeLive = 0;
    return;
  }
  shadow.dispose();
  shadow.map = null;
  shadow.mapPass = null;
  shadowEdgeLive = 0;
}

export function placeSunShadow(
  sun: DirectionalLight,
  camX: number, camY: number, camZ: number,
  dirX: number, dirY: number, dirZ: number,
  on: boolean,
): void {
  if (!on) {
    sun.castShadow = false;
    sun.target.position.set(0, 0, 0);
    disposeShadowMap(sun);
    return;
  }
  const edge = shadowEdge(lightingResolutionScale());
  if (shadowEdgeLive !== edge) {
    disposeShadowMap(sun);
    sun.shadow.mapSize.set(edge, edge);
    shadowEdgeLive = edge;
  }
  sun.castShadow = true;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.035;
  const cam = sun.shadow.camera;
  cam.left = -72;
  cam.right = 72;
  cam.top = 72;
  cam.bottom = -72;
  cam.near = 8;
  cam.far = 320;
  cam.updateProjectionMatrix();
  _sun.set(dirX, dirY, dirZ);
  _cam.set(camX, camY, camZ);
  sun.position.copy(_cam).addScaledVector(_sun, 180);
  sun.target.position.copy(_cam);
  sun.target.updateMatrixWorld();
}

export function syncLighting(opts: {
  scene: Scene;
  tier: Tier;
  tone: ToneId;
  x: number;
  y: number;
  z: number;
  sheen: number;
  sun: DirectionalLight | null;
  sunX: number;
  sunY: number;
  sunZ: number;
  daylight: number;
  retained: number;
  ephemeral: number;
  /** Drawing-buffer pixels. The memory report is zero until the canvas has a size. */
  viewW?: number;
  viewH?: number;
}): LightingStats {
  const cfg = LIGHT_TIERS[opts.tier];
  const lights = allLights();
  const exposure = currentExposure();
  setGradeExposure(exposure);
  let shaded = 0;
  if (cfg.perSlice <= 0) {
    clearShade();
    bakedNits.value = cfg.bakedNits;
    contactAmt.value = 0;
    updateProbe(opts.scene, opts.sheen, false, []);
  } else {
    const slots = clusterAssign(opts.x, opts.y, opts.z, lights, cfg.perSlice, cfg.range);
    writeShadeSlots(slots);
    shaded = slots.reduce((n, s) => n + (s.candela > 0 ? 1 : 0), 0);
    bakedNits.value = 0;
    contactAmt.value = cfg.contact ? 1 : 0;
    writeHazeSlots(cfg.volumetric ? volumetricPicks(opts.x, opts.y, opts.z, lights, cfg.range) : []);
    updateProbe(opts.scene, opts.sheen, cfg.probes, slots);
    if (!cfg.volumetric) writeHazeSlots([]);
  }
  if (opts.sun) {
    placeSunShadow(
      opts.sun, opts.x, opts.y, opts.z, opts.sunX, opts.sunY, opts.sunZ,
      cfg.sunShadow && opts.daylight > 0.2,
    );
  }
  last = {
    retained: opts.retained,
    ephemeral: opts.ephemeral,
    shaded,
    ev: currentEv(),
    exposure,
    tonemap: opts.tone,
    tier: opts.tier,
    baked: cfg.perSlice <= 0,
    probes: cfg.probes,
    volumetric: cfg.volumetric,
    sunShadow: cfg.sunShadow && opts.daylight > 0.2,
    memory: lightingMemory(
      opts.tier,
      opts.viewW ?? 0,
      opts.viewH ?? 0,
      lightingResolutionScale(),
      opts.daylight > 0.2,
    ),
  };
  return last;
}

/** Tier change: drop the shadow map, the probe, and the bloom targets this tier does not use. */
export function releaseLightingTierTargets(scene: Scene, sun: DirectionalLight | null, tier: Tier): void {
  const cfg = LIGHT_TIERS[tier];
  if (!cfg.probes) releaseOwnEnv(scene);
  if (sun && !cfg.sunShadow) placeSunShadow(sun, 0, 0, 0, 0, 1, 0, false);
  if (!cfg.bloom) disposeLightingPipeline();
}
