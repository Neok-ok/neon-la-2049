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
}

const BASE: Record<Tier, Omit<QualitySettings, 'tier'>> = {
  low: { pixelRatio: 1, nearRadius: 900, lod0Radius: 320, farRadius: 4500, rainCount: 2500, snowCount: 1500, bloom: false, traffic: 24, uploadsPerFrame: 1, workers: 2, streetDetail: true, antialias: false, detailScale: 0.3, crowd: 56, crowdRadius: 48, steam: 48, holoCount: 6, holoDetail: 0, holoSpill: 0, holoCards: 0 },
  medium: { pixelRatio: 1.5, nearRadius: 1300, lod0Radius: 450, farRadius: 7000, rainCount: 6000, snowCount: 3500, bloom: false, traffic: 50, uploadsPerFrame: 2, workers: 2, streetDetail: true, antialias: false, detailScale: 0.55, crowd: 160, crowdRadius: 64, steam: 140, holoCount: 18, holoDetail: 1, holoSpill: 3, holoCards: 6 },
  high: { pixelRatio: 2, nearRadius: 1800, lod0Radius: 600, farRadius: 10000, rainCount: 14000, snowCount: 7000, bloom: true, traffic: 110, uploadsPerFrame: 3, workers: 3, streetDetail: true, antialias: true, detailScale: 0.82, crowd: 340, crowdRadius: 78, steam: 300, holoCount: 32, holoDetail: 2, holoSpill: 4, holoCards: 12 },
  ultra: { pixelRatio: 3, nearRadius: 2400, lod0Radius: 800, farRadius: 14000, rainCount: 24000, snowCount: 12000, bloom: true, traffic: 180, uploadsPerFrame: 4, workers: 4, streetDetail: true, antialias: true, detailScale: 1, crowd: 680, crowdRadius: 88, steam: 520, holoCount: 48, holoDetail: 3, holoSpill: 4, holoCards: 16 },
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
  return {
    isIOS,
    isMobile,
    gpu,
    cores: navigator.hardwareConcurrency || 4,
    memory: (navigator as unknown as { deviceMemory?: number }).deviceMemory,
    webgpu: 'gpu' in navigator,
  };
}

export function autoTier(d: DeviceInfo): { tier: Tier; reason: string } {
  const g = d.gpu.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(g)) return { tier: 'low', reason: `software renderer (${d.gpu})` };
  if (d.isMobile) {
    if (d.isIOS && d.webgpu) return { tier: 'medium', reason: 'iOS with WebGPU (recent iPhone/iPad)' };
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
