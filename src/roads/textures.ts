// Trim, normal, marking and gantry atlases. Low tier never builds them.
// A real GPU prefers the KTX2 files. Software renderers keep the painted bytes.
import {
  ClampToEdgeWrapping, DataTexture, LinearFilter, NoColorSpace, SRGBColorSpace, type Texture, type WebGPURenderer,
} from 'three/webgpu';
import type { Tier } from '../core/quality';
import trimUrl from '../assets/road-trim.ktx2?url';
import normalUrl from '../assets/road-normal.ktx2?url';
import markUrl from '../assets/road-markings.ktx2?url';
import signUrl from '../assets/road-signs.ktx2?url';
import { MARK, SIGN_H, SIGN_W, TRIM, markBytes, normalBytes, signBytes, trimBytes } from './paint';

export type RoadTextureMode = 'off' | 'pending' | 'data' | 'ktx2';

let mode: RoadTextureMode = 'off';
let trimTex: Texture | null = null;
let normalTex: Texture | null = null;
let markTex: Texture | null = null;
let signTex: Texture | null = null;
let rendererRef: WebGPURenderer | null = null;

function glOf(renderer: WebGPURenderer): WebGL2RenderingContext | null {
  const ctx = renderer.getContext() as { getExtension?: unknown; getParameter?: unknown } | null;
  if (!ctx || typeof ctx.getExtension !== 'function' || typeof ctx.getParameter !== 'function') return null;
  return ctx as WebGL2RenderingContext;
}

function isSoftware(renderer: WebGPURenderer): boolean {
  const gl = glOf(renderer);
  let text = '';
  if (gl) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null;
    text = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  } else {
    const info = (renderer as unknown as {
      backend?: { device?: { adapterInfo?: { description?: string; vendor?: string } } };
    }).backend?.device?.adapterInfo;
    text = `${info?.vendor ?? ''} ${info?.description ?? ''}`;
  }
  return /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i.test(text);
}

function hasCompressed(renderer: WebGPURenderer): boolean {
  const gl = glOf(renderer);
  if (gl) {
    return !!(gl.getExtension('WEBGL_compressed_texture_s3tc')
      || gl.getExtension('WEBGL_compressed_texture_astc')
      || gl.getExtension('WEBGL_compressed_texture_etc')
      || gl.getExtension('EXT_texture_compression_bptc'));
  }
  try {
    return renderer.hasFeature('texture-compression-bc')
      || renderer.hasFeature('texture-compression-astc')
      || renderer.hasFeature('texture-compression-etc2');
  } catch {
    return false;
  }
}

function dress(tex: Texture, name: string, color: boolean): Texture {
  tex.name = name;
  tex.colorSpace = color ? SRGBColorSpace : NoColorSpace;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.flipY = true;
  tex.needsUpdate = true;
  return tex;
}

function dataTex(name: string, bytes: Uint8Array, w: number, h: number, color: boolean): Texture {
  const tex = new DataTexture(bytes, w, h);
  return dress(tex, name, color);
}

function ensureData(): void {
  if (trimTex) return;
  trimTex = dataTex('road-trim', trimBytes(), TRIM, TRIM, true);
  normalTex = dataTex('road-normal', normalBytes(), TRIM, TRIM, false);
  markTex = dataTex('road-markings', markBytes(), MARK, MARK, true);
  signTex = dataTex('road-signs', signBytes(), SIGN_W, SIGN_H, true);
  mode = 'data';
}

interface KtxLoader {
  detectSupport(renderer: WebGPURenderer): unknown;
  parse(buffer: ArrayBuffer, onLoad: (tex: Texture) => void, onError?: (err: unknown) => void): void;
  dispose(): void;
}

async function fetchKtx(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`road ktx2 ${res.status}`);
  return res.arrayBuffer();
}

function parseKtx(loader: KtxLoader, buf: ArrayBuffer): Promise<Texture> {
  return new Promise((resolve, reject) => {
    try {
      loader.parse(buf, resolve, reject);
    } catch (err) {
      reject(err);
    }
  });
}

async function loadKtx(renderer: WebGPURenderer): Promise<boolean> {
  const { KTX2Loader } = await import('three/addons/loaders/KTX2Loader.js');
  const loader = new KTX2Loader() as KtxLoader;
  try {
    loader.detectSupport(renderer);
    const [trimBuf, normalBuf, markBuf, signBuf] = await Promise.all([
      fetchKtx(trimUrl), fetchKtx(normalUrl), fetchKtx(markUrl), fetchKtx(signUrl),
    ]);
    const [trim, normal, mark, sign] = await Promise.all([
      parseKtx(loader, trimBuf), parseKtx(loader, normalBuf), parseKtx(loader, markBuf), parseKtx(loader, signBuf),
    ]);
    trimTex = dress(trim, 'road-trim', true);
    normalTex = dress(normal, 'road-normal', false);
    markTex = dress(mark, 'road-markings', true);
    signTex = dress(sign, 'road-signs', true);
    mode = 'ktx2';
    return true;
  } catch (err) {
    console.warn('road ktx2 fallback', err);
    return false;
  } finally {
    loader.dispose();
  }
}

export function roadTextureMode(): RoadTextureMode {
  return mode;
}

/** True once a non-low tier can build a rich material without waiting. */
export function roadTexturesReady(tier: Tier): boolean {
  if (tier === 'low') return true;
  return mode === 'data' || mode === 'ktx2';
}

/**
 * Resolve atlases before rich chunks build. Low returns immediately and allocates nothing.
 * Call again after a tier change; the second resolve is instant once a mode is chosen.
 */
export async function prepareRoadTextures(renderer: WebGPURenderer, tier: Tier): Promise<void> {
  rendererRef = renderer;
  if (tier === 'low') {
    if (mode === 'pending') mode = 'off';
    return;
  }
  if (mode === 'data' || mode === 'ktx2') return;
  if (isSoftware(renderer) || !hasCompressed(renderer)) {
    ensureData();
    return;
  }
  mode = 'pending';
  const ok = await loadKtx(renderer);
  if (!ok) ensureData();
}

export interface RoadMaps {
  trim: Texture;
  normal: Texture;
  mark: Texture;
  sign: Texture;
  compressed: boolean;
}

/** Painted or compressed atlases. Allocates the byte textures only as a fallback. */
export function roadMaps(): RoadMaps {
  if (!trimTex || !normalTex || !markTex || !signTex) {
    if (rendererRef && mode === 'pending') {
      // The chunk rebuilt before the file landed. Bytes keep the frame correct.
    }
    ensureData();
  }
  return {
    trim: trimTex!,
    normal: normalTex!,
    mark: markTex!,
    sign: signTex!,
    compressed: mode === 'ktx2',
  };
}
