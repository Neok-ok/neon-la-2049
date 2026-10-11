// Central registry for textures, geometries, render targets and materials.
// Construction outside `resources.*` is counted. `?memguard=1` throws, the same
// way a lighting guard rejects a light that skipped the registry.
import {
  BufferGeometry,
  Material,
  RenderTarget,
  Texture,
  type BufferAttribute,
} from 'three/webgpu';
import { geometryBytes, textureBytes, type GeoLike, type TexLevel } from './estimate';
import { inScope, noteCreation, resetScopeCounts, runTracked, scopeCounts, setStrict } from './scope';

export interface TrackMeta {
  label: string;
  owner: string;
  evictable?: boolean;
}

type Kind = 'geometry' | 'texture' | 'target' | 'material';

interface Rec {
  obj: object;
  kind: Kind;
  label: string;
  owner: string;
  bytes: number;
  refs: number;
  lastUse: number;
  explicit: boolean;
  shared: boolean;
  evictable: boolean;
  disposed: boolean;
  fingerprint: string;
  stack?: string;
}

export interface DuplicateGroup {
  key: string;
  count: number;
  bytes: number;
  label: string;
}

export interface LeakRow {
  label: string;
  owner: string;
  kind: Kind;
  bytes: number;
  stack?: string;
}

export interface MemoryReport {
  counts: Record<Kind, number>;
  bytes: Record<Kind, number>;
  live: number;
  disposed: number;
  outside: number;
  inside: number;
  shared: number;
  duplicates: DuplicateGroup[];
  /** Live resources that were constructed outside the manager, largest first. */
  outsideLive: LeakRow[];
  mipBias: number;
  programs: number;
}

const records = new Map<object, Rec>();
const sharedGeos = new Map<string, BufferGeometry>();
const sharedMats = new Map<string, Material>();
const streamed: Texture[] = [];
let mipBias = 0;
let installed = false;
let stacksLeft = 40;
let disposedCount = 0;

function textureImage(tex: Texture): TexLevel | undefined {
  // Texture sets isTexture before this.source exists. The image getter throws until then.
  const src = (tex as unknown as { source?: { data?: unknown } }).source;
  if (!src) return undefined;
  const image = src.data as TexLevel | undefined;
  return image ?? undefined;
}

function fingerprint(obj: object, kind: Kind): string {
  try {
    if (kind === 'geometry') {
      const g = obj as BufferGeometry;
      const pos = g.attributes?.position as BufferAttribute | undefined;
      const arr = pos?.array as ArrayLike<number> | undefined;
      const head = arr ? `${Math.round(Number(arr[0] ?? 0))},${Math.round(Number(arr[1] ?? 0))},${Math.round(Number(arr[2] ?? 0))}` : '';
      return `g:${pos?.count ?? 0}:${g.index?.count ?? 0}:${head}`;
    }
    if (kind === 'texture') {
      const t = obj as Texture;
      const image = textureImage(t);
      return `t:${image?.width ?? 0}x${image?.height ?? 0}:${t.format}:${t.type}`;
    }
    if (kind === 'material') {
      const m = obj as Material;
      const key = typeof m.customProgramCacheKey === 'function' ? m.customProgramCacheKey() : '';
      return `m:${m.type}:${m.name}:${key}`;
    }
    const rt = obj as RenderTarget;
    return `rt:${rt.width ?? 0}x${rt.height ?? 0}:${rt.samples ?? 0}`;
  } catch {
    return kind;
  }
}

function measure(obj: object, kind: Kind): number {
  try {
    if (kind === 'geometry') return geometryBytes(obj as GeoLike);
    if (kind === 'texture') {
      const t = obj as Texture;
      const image = textureImage(t);
      const mips = (t.mipmaps ?? []) as TexLevel[];
      return textureBytes(image, mips, t.format, t.type);
    }
    if (kind === 'target') {
      const rt = obj as RenderTarget;
      const w = Number(rt.width);
      const h = Number(rt.height);
      if (!Number.isFinite(w) || !Number.isFinite(h)) return 0;
      const samples = Math.max(1, rt.samples ?? 1);
      return Math.max(1, w) * Math.max(1, h) * 4 * samples * 2;
    }
  } catch {
    return 0;
  }
  return 0;
}

function remeasure(obj: object, kind: Kind): void {
  const rec = records.get(obj);
  if (!rec || rec.disposed) return;
  rec.bytes = measure(obj, kind);
  rec.fingerprint = fingerprint(obj, kind);
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function hookDispose(obj: object): void {
  const tagged = obj as { __memHook?: boolean; addEventListener?: (type: string, fn: () => void) => void };
  if (tagged.__memHook || !tagged.addEventListener) return;
  tagged.__memHook = true;
  tagged.addEventListener('dispose', () => {
    const rec = records.get(obj);
    if (!rec || rec.disposed) return;
    rec.disposed = true;
    rec.refs = 0;
    disposedCount += 1;
    // Drop the strong reference so an unloaded chunk can be collected.
    records.delete(obj);
  });
}

function adopt(obj: object, kind: Kind, explicit: boolean): void {
  const prev = records.get(obj);
  if (prev) {
    if (explicit) prev.explicit = true;
    prev.bytes = measure(obj, kind);
    prev.lastUse = now();
    return;
  }
  const rec: Rec = {
    obj,
    kind,
    label: kind,
    owner: explicit ? 'tracked' : 'outside',
    bytes: measure(obj, kind),
    refs: 1,
    lastUse: now(),
    explicit,
    shared: false,
    evictable: false,
    disposed: false,
    fingerprint: fingerprint(obj, kind),
  };
  if (!explicit && stacksLeft > 0) {
    stacksLeft -= 1;
    rec.stack = new Error().stack?.split('\n').slice(3, 6).join(' ').slice(0, 280);
  }
  records.set(obj, rec);
  hookDispose(obj);
}

function arm(proto: object, flag: string, kind: Kind): void {
  const desc = Object.getOwnPropertyDescriptor(proto, flag);
  if (desc?.set) return;
  Object.defineProperty(proto, flag, {
    configurable: true,
    enumerable: true,
    get() {
      return true;
    },
    set(value: boolean) {
      Object.defineProperty(this, flag, { value, writable: true, configurable: true, enumerable: true });
      const explicit = inScope();
      noteCreation(kind);
      adopt(this, kind, explicit);
      const obj = this;
      // Constructors set the type flag before width, source, or attributes exist.
      queueMicrotask(() => remeasure(obj, kind));
    },
  });
}

export function installResourceGuard(opts?: { strict?: boolean }): void {
  setStrict(!!opts?.strict);
  if (installed) return;
  installed = true;
  arm(BufferGeometry.prototype, 'isBufferGeometry', 'geometry');
  arm(Texture.prototype, 'isTexture', 'texture');
  arm(RenderTarget.prototype, 'isRenderTarget', 'target');
  arm(Material.prototype, 'isMaterial', 'material');
}

function tag(obj: object, meta: TrackMeta, shared = false): void {
  const rec = records.get(obj);
  if (!rec) return;
  rec.label = meta.label;
  rec.owner = meta.owner;
  rec.evictable = !!meta.evictable;
  rec.explicit = true;
  rec.shared = shared;
  rec.bytes = measure(obj, rec.kind);
  rec.fingerprint = fingerprint(obj, rec.kind);
}

export const resources = {
  geometry<T extends BufferGeometry>(create: () => T, meta: TrackMeta): T {
    const geo = runTracked(create);
    tag(geo, meta, false);
    return geo;
  },

  sharedGeometry<T extends BufferGeometry>(key: string, create: () => T): T {
    const hit = sharedGeos.get(key);
    if (hit) return hit as T;
    const geo = this.geometry(create, { label: key, owner: 'shared', evictable: false });
    geo.userData.sharedGeometry = true;
    tag(geo, { label: key, owner: 'shared' }, true);
    sharedGeos.set(key, geo);
    return geo;
  },

  texture<T extends Texture>(create: () => T, meta: TrackMeta): T {
    const tex = runTracked(create);
    tag(tex, meta, false);
    return tex;
  },

  target<T extends RenderTarget>(create: () => T, meta: TrackMeta): T {
    const rt = runTracked(create);
    tag(rt, meta, false);
    return rt;
  },

  material<T extends Material>(key: string, create: () => T): T {
    const hit = sharedMats.get(key);
    if (hit) return hit as T;
    const mat = runTracked(create);
    tag(mat, { label: key, owner: 'material' }, true);
    sharedMats.set(key, mat);
    return mat;
  },

  /** Relabel a resource that was created inside an already-open scope. */
  tag(obj: object, meta: TrackMeta): void {
    tag(obj, meta, records.get(obj)?.shared ?? false);
  },

  /** Extra holder. Pair with `release`. */
  retain(obj: object): void {
    const rec = records.get(obj);
    if (!rec || rec.disposed) return;
    rec.refs += 1;
    rec.lastUse = now();
  },

  /**
   * Drop one holder. The last holder disposes the resource, unless it is shared.
   * Returns true when the caller must not dispose it again (still held, shared, or just disposed).
   */
  release(obj: object): boolean {
    const rec = records.get(obj);
    if (!rec || rec.disposed) return false;
    rec.refs = Math.max(0, rec.refs - 1);
    rec.lastUse = now();
    if (rec.shared || rec.refs > 0) return true;
    const disposable = obj as { dispose?: () => void };
    disposable.dispose?.();
    return true;
  },

  touch(obj: object): void {
    const rec = records.get(obj);
    if (!rec || rec.disposed) return;
    rec.lastUse = now();
  },

  /** A disposed geometry is back on the GPU (landmark LOD reupload). */
  revive(obj: object, kind: Kind = 'geometry'): void {
    if (!records.has(obj)) {
      adopt(obj, kind, true);
      return;
    }
    const rec = records.get(obj);
    if (!rec) return;
    rec.lastUse = now();
    rec.bytes = measure(obj, rec.kind);
  },

  /**
   * Dispose evictable resources that nobody holds, oldest first, until live bytes
   * fit `maxBytes`. In-use resources (refcount above zero, or shared) stay.
   * Returns bytes released.
   */
  evict(maxBytes: number): number {
    if (!(maxBytes > 0)) return 0;
    let live = 0;
    const candidates: Rec[] = [];
    for (const rec of records.values()) {
      if (rec.disposed) continue;
      live += rec.bytes;
      if (rec.evictable && !rec.shared && rec.refs <= 0) candidates.push(rec);
    }
    if (live <= maxBytes) return 0;
    candidates.sort((a, b) => a.lastUse - b.lastUse);
    let freed = 0;
    for (const rec of candidates) {
      if (live - freed <= maxBytes) break;
      const bytes = rec.bytes;
      const disposable = rec.obj as { dispose?: () => void };
      if (typeof disposable.dispose === 'function') disposable.dispose();
      else records.delete(rec.obj);
      freed += bytes;
    }
    return freed;
  },

  markStreamed(tex: Texture): void {
    if (!streamed.includes(tex)) streamed.push(tex);
    rememberMips(tex);
  },

  setMipBias(bias: number): void {
    const next = Math.max(0, Math.min(3, bias | 0));
    if (next === mipBias) return;
    mipBias = next;
    for (const tex of streamed) applyMipBias(tex, next);
  },

  sample(programs = 0): MemoryReport {
    const counts: Record<Kind, number> = { geometry: 0, texture: 0, target: 0, material: 0 };
    const bytes: Record<Kind, number> = { geometry: 0, texture: 0, target: 0, material: 0 };
    const dup = new Map<string, DuplicateGroup>();
    const outsideLive: LeakRow[] = [];
    let live = 0;
    let shared = 0;
    for (const rec of records.values()) {
      if (rec.disposed) continue;
      live += 1;
      counts[rec.kind] += 1;
      bytes[rec.kind] += rec.bytes;
      if (rec.shared) shared += 1;
      if (!rec.explicit) {
        outsideLive.push({ label: rec.label, owner: rec.owner, kind: rec.kind, bytes: rec.bytes, stack: rec.stack });
      }
      if (rec.kind === 'geometry' && !rec.shared) {
        const group = dup.get(rec.fingerprint) ?? { key: rec.fingerprint, count: 0, bytes: rec.bytes, label: rec.label };
        group.count += 1;
        group.bytes = Math.max(group.bytes, rec.bytes);
        dup.set(rec.fingerprint, group);
      }
    }
    outsideLive.sort((a, b) => b.bytes - a.bytes);
    const scope = scopeCounts();
    return {
      counts,
      bytes,
      live,
      disposed: disposedCount,
      outside: scope.outside,
      inside: scope.inside,
      shared,
      duplicates: [...dup.values()].filter((d) => d.count > 1).sort((a, b) => b.count * b.bytes - a.count * a.bytes).slice(0, 8),
      outsideLive: outsideLive.slice(0, 8),
      mipBias,
      programs,
    };
  },

  /** Test hook. Drops bookkeeping; does not dispose GPU resources. */
  resetForTests(): void {
    records.clear();
    sharedGeos.clear();
    sharedMats.clear();
    streamed.length = 0;
    mipBias = 0;
    stacksLeft = 40;
    disposedCount = 0;
    resetScopeCounts();
  },
};

interface MipBackup {
  image: unknown;
  mipmaps: unknown[];
  generateMipmaps: boolean;
}

function rememberMips(tex: Texture): void {
  const data = tex.userData as { __mipFull?: MipBackup };
  if (data.__mipFull) return;
  data.__mipFull = {
    image: tex.image,
    mipmaps: Array.isArray(tex.mipmaps) ? tex.mipmaps.slice() : [],
    generateMipmaps: tex.generateMipmaps,
  };
}

function applyMipBias(tex: Texture, bias: number): void {
  rememberMips(tex);
  const full = (tex.userData as { __mipFull: MipBackup }).__mipFull;
  const slot = tex as unknown as { mipmaps: unknown[]; image: unknown };
  const mips = full.mipmaps as Array<{ data?: unknown; width: number; height: number }>;
  if (bias <= 0) {
    slot.image = full.image;
    slot.mipmaps = full.mipmaps.slice();
    tex.generateMipmaps = full.generateMipmaps;
    tex.needsUpdate = true;
    const rec = records.get(tex);
    if (rec) rec.bytes = measure(tex, 'texture');
    return;
  }
  if (mips.length > bias) {
    const base = mips[bias];
    if (!base) return;
    slot.mipmaps = mips.slice(bias);
    slot.image = 'isCompressedTexture' in tex ? { width: base.width, height: base.height } : base;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    const rec = records.get(tex);
    if (rec) rec.bytes = measure(tex, 'texture');
    return;
  }
  const image = full.image as { width?: number; height?: number; data?: Uint8Array } | HTMLCanvasElement | null;
  if (image && typeof (image as HTMLCanvasElement).getContext === 'function') {
    const canvas = image as HTMLCanvasElement;
    const scale = 1 / (1 << bias);
    const w = Math.max(1, canvas.width * scale | 0);
    const h = Math.max(1, canvas.height * scale | 0);
    const next = document.createElement('canvas');
    next.width = w;
    next.height = h;
    next.getContext('2d')?.drawImage(canvas, 0, 0, w, h);
    slot.image = next;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
  } else if (image && (image as { data?: Uint8Array }).data && (image as { width?: number }).width) {
    const src = image as { width: number; height: number; data: Uint8Array };
    let w = src.width;
    let h = src.height;
    let data = src.data;
    for (let i = 0; i < bias; i++) {
      const scaled = downscaleRGBA(data, w, h);
      w = scaled.w;
      h = scaled.h;
      data = scaled.data;
    }
    slot.image = { width: w, height: h, data };
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
  }
  const rec = records.get(tex);
  if (rec) rec.bytes = measure(tex, 'texture');
}

function downscaleRGBA(src: Uint8Array, width: number, height: number): { data: Uint8Array; w: number; h: number } {
  const w = Math.max(1, width >> 1);
  const h = Math.max(1, height >> 1);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(width - 1, x * 2 + dx);
          const sy = Math.min(height - 1, y * 2 + dy);
          const i = (sy * width + sx) * 4;
          r += src[i] ?? 0;
          g += src[i + 1] ?? 0;
          b += src[i + 2] ?? 0;
          a += src[i + 3] ?? 0;
          n += 1;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = a / n;
    }
  }
  return { data: out, w, h };
}
