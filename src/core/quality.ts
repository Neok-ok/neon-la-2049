// Quality tiers. Auto-detected on first run; user override persisted in localStorage; `?quality=` wins.
export type Tier = 'low' | 'medium' | 'high' | 'ultra';
export const TIERS: Tier[] = ['low', 'medium', 'high', 'ultra'];

export interface QualitySettings {
  tier: Tier;
  /** max device pixel ratio used for the canvas */
  pixelRatio: number;
  /** superchunks closer than this (3D, m) are refined into 500 m chunks */
  nearRadius: number;
  /** chunks closer than this get LOD0 (full detail + street props) */
  lod0Radius: number;
  /** far LOD superchunks are kept out to this radius (m) */
  farRadius: number;
  rainCount: number;
  snowCount: number;
  bloom: boolean;
  traffic: number;
  /** chunk meshes uploaded per frame */
  uploadsPerFrame: number;
  workers: number;
  streetDetail: boolean;
  antialias: boolean;
  /** 0..1 fraction of ranked street-kit props to keep. Rank 0 always stays. */
  detailScale: number;
  /** Pedestrians allocated near the camera. */
  crowd: number;
  /** Metres around the camera that get pedestrians. */
  crowdRadius: number;
  /** Steam puffs kept per LOD0 chunk, before the hard cap in the district. */
  steam: number;
  /** Hologram panels drawn (depth slices share the same draw). */
  holoCount: number;
  /** 0 silhouette, 1 scan/flicker, 2 one ghost slice, 3 two ghost slices. */
  holoDetail: number;
  /** Nearest projectors written into the fabric/kit spill loop (0–4). */
  holoSpill: number;
  /** Wet-street spill cards under low projectors. */
  holoCards: number;
  /** Multiplier on landmark LOD switch distances (hero megatowers, the pyramid). */
  landmarkLod: number;
  /** Spinners on the high sky lanes and holding patterns between the megatowers. */
  laneTraffic: number;
  /** Street cars near the camera. The district `traffic` weight scales this. Low tier is 0 (light streaks only). */
  groundTraffic: number;
  /** Near vehicles in a freeway trench. Low tier is 0. */
  freewayTraffic: number;
}

const BASE: Record<Tier, Omit<QualitySettings, 'tier'>> = {
  low: { pixelRatio: 1, nearRadius: 900, lod0Radius: 320, farRadius: 4500, rainCount: 2500, snowCount: 1500, bloom: false, traffic: 24, uploadsPerFrame: 1, workers: 2, streetDetail: true, antialias: false, detailScale: 0.3, crowd: 56, crowdRadius: 48, steam: 48, holoCount: 6, holoDetail: 0, holoSpill: 0, holoCards: 0, landmarkLod: 0.6, laneTraffic: 60, groundTraffic: 0, freewayTraffic: 0 },
  medium: { pixelRatio: 1.5, nearRadius: 1300, lod0Radius: 450, farRadius: 7000, rainCount: 6000, snowCount: 3500, bloom: false, traffic: 50, uploadsPerFrame: 2, workers: 2, streetDetail: true, antialias: false, detailScale: 0.55, crowd: 160, crowdRadius: 64, steam: 140, holoCount: 18, holoDetail: 1, holoSpill: 3, holoCards: 6, landmarkLod: 0.8, laneTraffic: 140, groundTraffic: 22, freewayTraffic: 24 },
  high: { pixelRatio: 2, nearRadius: 1800, lod0Radius: 600, farRadius: 10000, rainCount: 14000, snowCount: 7000, bloom: true, traffic: 110, uploadsPerFrame: 3, workers: 3, streetDetail: true, antialias: true, detailScale: 0.82, crowd: 340, crowdRadius: 78, steam: 300, holoCount: 32, holoDetail: 2, holoSpill: 4, holoCards: 12, landmarkLod: 1.0, laneTraffic: 240, groundTraffic: 40, freewayTraffic: 40 },
  ultra: { pixelRatio: 3, nearRadius: 2400, lod0Radius: 800, farRadius: 14000, rainCount: 24000, snowCount: 12000, bloom: true, traffic: 180, uploadsPerFrame: 4, workers: 4, streetDetail: true, antialias: true, detailScale: 1, crowd: 680, crowdRadius: 88, steam: 520, holoCount: 48, holoDetail: 3, holoSpill: 4, holoCards: 16, landmarkLod: 1.35, laneTraffic: 380, groundTraffic: 64, freewayTraffic: 56 },
};

export function settingsFor(tier: Tier): QualitySettings {
  return { tier, ...BASE[tier] };
}

export interface DeviceInfo {
  isIOS: boolean;
  isMobile: boolean;
  gpu: string;
  cores: number;
  memory?: number;
  webgpu: boolean;
  /** `devicePixelRatio`. 1 when the probe has no window. */
  dpr: number;
  /** `min(screen.width, screen.height)` in CSS pixels. 0 when unknown. */
  screenMin: number;
}

/** Wall-clock warmup before Auto may drop a tier. Streaming hitches during boot do not count. */
export const AUTO_WARMUP_MS = 8000;
/** Sustained time under 24 fps, in real milliseconds, before Auto drops one tier. */
export const AUTO_DROP_MS = 3500;
/** A frame slower than this adds to the drop timer. 24 fps. */
export const AUTO_SLOW_FRAME_MS = 1000 / 24;

export interface AutoGuardState {
  tier: Tier;
  choice: Tier | 'auto';
  /** Milliseconds since the first animation frame. */
  elapsedMs: number;
  /** Accumulated real time spent under 24 fps since warmup. */
  slowMs: number;
  /** Unclamped frame time, milliseconds. */
  frameMs: number;
}

/**
 * One frame of the Auto safety net. Manual tiers and `?quality=` never move.
 * A drop does not come back up, so a borderline phone cannot flap.
 * The clock is wall time: the simulation's 100 ms dt clamp must not slow the reaction.
 */
export function stepAutoGuard(s: AutoGuardState): { tier: Tier; slowMs: number; dropped: boolean } {
  if (s.choice !== 'auto' || s.tier === 'low') return { tier: s.tier, slowMs: s.slowMs, dropped: false };
  if (s.elapsedMs < AUTO_WARMUP_MS) return { tier: s.tier, slowMs: 0, dropped: false };
  const slow = s.frameMs > AUTO_SLOW_FRAME_MS ? s.slowMs + s.frameMs : Math.max(0, s.slowMs - s.frameMs * 2);
  if (slow <= AUTO_DROP_MS) return { tier: s.tier, slowMs: slow, dropped: false };
  return { tier: lowerTier(s.tier), slowMs: 0, dropped: true };
}

export function probeDevice(): DeviceInfo {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMobile = isIOS || /Android|Mobile/i.test(ua);
  let gpu = 'unknown';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') as WebGL2RenderingContext | null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    /* ignore */
  }
  const dpr = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const screenMin = typeof screen !== 'undefined' ? Math.min(screen.width, screen.height) : 0;
  return {
    isIOS,
    isMobile,
    gpu,
    cores: navigator.hardwareConcurrency || 4,
    memory: (navigator as unknown as { deviceMemory?: number }).deviceMemory,
    webgpu: 'gpu' in navigator,
    dpr,
    screenMin,
  };
}

export function autoTier(d: DeviceInfo): { tier: Tier; reason: string } {
  const g = d.gpu.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(g)) return { tier: 'low', reason: `software renderer (${d.gpu})` };
  if (d.isMobile) {
    if (d.isIOS) {
      // Safari still hides deviceMemory, and it caps hardwareConcurrency, so the
      // 8-core / 8 GB test never matches an iPhone. WebGPU is off on iOS 17–18
      // and on by default from iOS 26. iPhone 12 and later (including the 13 mini)
      // report DPR ≥ 3. A 390 pt short side is iPhone 12–16 and iPad class.
      // iPhone SE (375×667 at DPR 2) stays on low. Never pick high: the medium
      // budget is the phone target, and Auto can still drop.
      const recent = d.webgpu || (d.dpr ?? 1) >= 2.5 || (d.screenMin ?? 0) >= 390;
      if (recent) {
        const why = d.webgpu ? 'WebGPU' : (d.dpr ?? 1) >= 2.5 ? `DPR ${d.dpr}` : `${d.screenMin}pt screen`;
        return { tier: 'medium', reason: `iOS ${why} (iPhone 12 / iPad class, not high)` };
      }
      return { tier: 'low', reason: 'older or smaller iPhone' };
    }
    if ((d.memory ?? 4) >= 8 && d.cores >= 8) return { tier: 'medium', reason: 'high-end mobile' };
    return { tier: 'low', reason: 'mobile device' };
  }
  if (/intel|uhd|iris|mali|adreno/.test(g)) return { tier: 'medium', reason: `integrated GPU (${d.gpu})` };
  if (/apple m\d|apple gpu/.test(g)) return { tier: 'high', reason: `Apple silicon (${d.gpu})` };
  if (/nvidia|geforce|rtx|radeon|amd/.test(g)) return { tier: 'high', reason: `discrete GPU (${d.gpu})` };
  return { tier: 'medium', reason: `unknown GPU (${d.gpu})` };
}

const KEY = 'nla.quality';

export function storedTier(): Tier | 'auto' {
  const v = localStorage.getItem(KEY);
  return v && (TIERS as string[]).includes(v) ? (v as Tier) : 'auto';
}

export function storeTier(t: Tier | 'auto'): void {
  if (t === 'auto') localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, t);
}

export function lowerTier(t: Tier): Tier {
  const i = TIERS.indexOf(t);
  return TIERS[Math.max(0, i - 1)];
}
