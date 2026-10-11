// Device memory budget. Graphics tiers stay a look setting. This is how much of
// the tab we are willing to occupy. Android defaults sit in the 600–900 MB band
// the owner asked for; desktop is several times that. Numbers are totals for the
// tab (JS heap plus GPU), not a license to use all of physical RAM.

const MB = 1024 * 1024;

export interface BudgetDevice {
  isIOS: boolean;
  isMobile: boolean;
  gpu: string;
  cores: number;
  memory?: number;
  webgpu: boolean;
  dpr: number;
  screenMin: number;
}

export interface GpuLimits {
  maxTextureSize: number;
  maxRenderbufferSize: number;
  maxSamples: number;
  maxBufferSize: number;
}

export type DeviceClass = 'android' | 'ios' | 'desktop';

export interface MemoryBudget {
  totalBytes: number;
  jsHeapBytes: number;
  gpuBytes: number;
  geometryBytes: number;
  textureBytes: number;
  targetBytes: number;
  deviceClass: DeviceClass;
  source: string;
  limits: GpuLimits;
}

const EMPTY_LIMITS: GpuLimits = {
  maxTextureSize: 0,
  maxRenderbufferSize: 0,
  maxSamples: 0,
  maxBufferSize: 0,
};

function androidTotal(memoryGb: number | undefined): number {
  const gb = memoryGb ?? 4;
  if (gb <= 2) return 600 * MB;
  if (gb <= 3) return 680 * MB;
  if (gb <= 4) return 750 * MB;
  if (gb <= 6) return 820 * MB;
  return 900 * MB;
}

function iosTotal(memoryGb: number | undefined, recent: boolean): number {
  if (!recent) return 640 * MB;
  const gb = memoryGb ?? 4;
  if (gb >= 6) return 900 * MB;
  return 760 * MB;
}

function desktopTotal(memoryGb: number | undefined): number {
  const gb = memoryGb ?? 8;
  if (gb >= 16) return 4096 * MB;
  if (gb >= 8) return 3072 * MB;
  return 2048 * MB;
}

function split(total: number): Pick<MemoryBudget, 'jsHeapBytes' | 'gpuBytes' | 'geometryBytes' | 'textureBytes' | 'targetBytes'> {
  const jsHeapBytes = Math.round(total * 0.46);
  const gpuBytes = Math.round(total * 0.4);
  return {
    jsHeapBytes,
    gpuBytes,
    geometryBytes: Math.round(gpuBytes * 0.62),
    textureBytes: Math.round(gpuBytes * 0.18),
    targetBytes: Math.round(gpuBytes * 0.2),
  };
}

export interface BudgetInput {
  device: BudgetDevice;
  limits?: Partial<GpuLimits>;
  heapLimit?: number;
  /** `android` | `ios` | `desktop`, or a total tab budget in megabytes. */
  override?: string;
  uaPlatform?: string;
  uaModel?: string;
  probeMs?: number;
}

export function detectBudget(input: BudgetInput): MemoryBudget {
  const device = input.device;
  const platform = (input.uaPlatform ?? '').toLowerCase();
  const model = (input.uaModel ?? '').toLowerCase();
  const override = (input.override ?? '').trim().toLowerCase();
  const hintedAndroid = platform === 'android' || /pixel|sm-|moto|redmi|oneplus/.test(model);
  let deviceClass: DeviceClass = 'desktop';
  if (override === 'android' || override === 'ios' || override === 'desktop') deviceClass = override;
  else if (device.isIOS) deviceClass = 'ios';
  else if ((device.isMobile && !device.isIOS) || hintedAndroid) deviceClass = 'android';

  const recentIos = device.webgpu || device.dpr >= 2.5 || device.screenMin >= 390;
  let total = deviceClass === 'android'
    ? androidTotal(device.memory)
    : deviceClass === 'ios'
      ? iosTotal(device.memory, recentIos)
      : desktopTotal(device.memory);

  const asMb = Number(override);
  if (override && override !== 'android' && override !== 'ios' && override !== 'desktop' && Number.isFinite(asMb) && asMb > 0) {
    total = Math.round(asMb * MB);
  }

  // A tiny renderer heap (the simulated phone flag, or a 32-bit tab) caps JS
  // even when the class default is larger. GPU budget stays, because the heap
  // limit does not include textures.
  const parts = split(total);
  if (input.heapLimit && input.heapLimit > 0 && deviceClass !== 'desktop') {
    parts.jsHeapBytes = Math.min(parts.jsHeapBytes, Math.round(input.heapLimit * 0.72));
  }

  const limits: GpuLimits = { ...EMPTY_LIMITS, ...input.limits };
  if (limits.maxTextureSize > 0 && limits.maxTextureSize <= 2048) {
    parts.textureBytes = Math.min(parts.textureBytes, 32 * MB);
  }
  if (limits.maxSamples > 0 && limits.maxSamples < 4) {
    parts.targetBytes = Math.min(parts.targetBytes, Math.round(parts.targetBytes * 0.6));
  }

  const mem = device.memory !== undefined ? `${device.memory}GB` : 'memory hidden';
  const probe = input.probeMs !== undefined ? `, probe ${input.probeMs.toFixed(1)}ms` : '';
  const source = `${deviceClass}, ${mem}, gpu ${device.gpu || 'unknown'}${probe}` + (override ? `, override ${override}` : '');
  return { totalBytes: total, ...parts, deviceClass, source, limits };
}

/** 1 MB touch allocation. Times the allocator; does not change the budget by itself. */
export function startupProbe(): { heapUsed?: number; allocMs: number } {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const buf = new Uint8Array(1 << 20);
  let sink = 0;
  for (let i = 0; i < buf.length; i += 4096) sink += buf[i] ?? 0;
  const allocMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0 + sink * 0;
  const heap = typeof performance !== 'undefined'
    ? (performance as { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize
    : undefined;
  return { heapUsed: heap, allocMs };
}

export async function readUaHints(): Promise<{ platform?: string; model?: string }> {
  const ua = navigator as Navigator & {
    userAgentData?: { getHighEntropyValues(keys: string[]): Promise<{ platform?: string; model?: string }> };
  };
  if (!ua.userAgentData?.getHighEntropyValues) return {};
  try {
    const value = await ua.userAgentData.getHighEntropyValues(['platform', 'model', 'platformVersion']);
    return { platform: value.platform, model: value.model };
  } catch {
    return {};
  }
}

export async function refineBudget(budget: MemoryBudget): Promise<MemoryBudget> {
  const gpu = (navigator as unknown as {
    gpu?: { requestAdapter(): Promise<{ limits?: { maxBufferSize?: number; maxTextureDimension2D?: number } } | null> };
  }).gpu;
  if (!gpu?.requestAdapter) return budget;
  try {
    const adapter = await gpu.requestAdapter();
    const maxBuffer = adapter?.limits?.maxBufferSize ?? budget.limits.maxBufferSize;
    const maxTex = adapter?.limits?.maxTextureDimension2D ?? budget.limits.maxTextureSize;
    const limits = { ...budget.limits, maxBufferSize: maxBuffer || budget.limits.maxBufferSize, maxTextureSize: maxTex || budget.limits.maxTextureSize };
    let textureBytes = budget.textureBytes;
    let source = budget.source;
    if (maxTex > 0 && maxTex <= 2048) {
      textureBytes = Math.min(textureBytes, 32 * MB);
      source += '; webgpu texture cap 2048';
    } else if (maxBuffer > 0) {
      source += '; webgpu adapter';
    }
    return { ...budget, textureBytes, limits, source };
  } catch {
    return budget;
  }
}
