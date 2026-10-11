// KTX2 atlases. The opening frame keeps the procedural textures unless a previous visit
// already cached the files, or `?ktx2=1` forces a download. Software GPUs stay on the
// procedural path so a SwiftShader bench matches the uncompressed image.
import type { Texture, WebGPURenderer } from 'three/webgpu';
import windowUrl from '../../assets/window-rooms.ktx2?url';
import signUrl from '../../assets/sign-atlas.ktx2?url';
import { absUrl, cacheMatchBuffer, cachePutBuffer } from '../../app/assetCache';
import { installWindowAtlas } from '../windows/atlas';
import { installSignAtlas } from './signAtlas';

export type AtlasMode = 'raw' | 'ktx2';

let mode: AtlasMode = 'raw';

export function atlasMode(): AtlasMode {
  return mode;
}

interface KtxLoader {
  detectSupport(renderer: WebGPURenderer): unknown;
  parse(buffer: ArrayBuffer, onLoad: (tex: Texture) => void, onError?: (err: unknown) => void): void;
  dispose(): void;
}

const ktx2Flag = new URLSearchParams(location.search).get('ktx2');

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
    const astc = !!gl.getExtension('WEBGL_compressed_texture_astc');
    const etc2 = !!gl.getExtension('WEBGL_compressed_texture_etc');
    const bptc = !!gl.getExtension('EXT_texture_compression_bptc');
    const dxt = !!gl.getExtension('WEBGL_compressed_texture_s3tc');
    const pvrtc = !!gl.getExtension('WEBGL_compressed_texture_pvrtc') || !!gl.getExtension('WEBKIT_WEBGL_compressed_texture_pvrtc');
    const linux = navigator.platform.indexOf('Linux') >= 0 && navigator.userAgent.indexOf('Android') < 0;
    if (linux && astc && etc2 && bptc && dxt) return bptc || dxt;
    return astc || etc2 || bptc || dxt || pvrtc;
  }
  try {
    return renderer.hasFeature('texture-compression-bc')
      || renderer.hasFeature('texture-compression-astc')
      || renderer.hasFeature('texture-compression-etc2');
  } catch {
    return false;
  }
}

function transcode(loader: KtxLoader, buf: ArrayBuffer): Promise<Texture> {
  return new Promise((resolve, reject) => {
    try {
      loader.parse(buf, resolve, reject);
    } catch (err) {
      reject(err);
    }
  });
}

async function decodeAndInstall(renderer: WebGPURenderer, win: ArrayBuffer, sign: ArrayBuffer): Promise<boolean> {
  const { KTX2Loader } = await import('three/addons/loaders/KTX2Loader.js');
  const loader = new KTX2Loader() as KtxLoader;
  try {
    loader.detectSupport(renderer);
    const [winTex, signTex] = await Promise.all([
      transcode(loader, win),
      transcode(loader, sign),
    ]);
    installWindowAtlas(winTex);
    installSignAtlas(signTex);
    mode = 'ktx2';
    return true;
  } catch (err) {
    console.warn('ktx2 atlas fallback', err);
    return false;
  } finally {
    loader.dispose();
  }
}

async function fetchBuf(url: string): Promise<ArrayBuffer> {
  const res = await fetch(absUrl(url));
  if (!res.ok) throw new Error(`ktx2 ${res.status} ${url}`);
  return res.arrayBuffer();
}

async function prefetchPair(): Promise<void> {
  try {
    const [win, sign] = await Promise.all([fetchBuf(windowUrl), fetchBuf(signUrl)]);
    await cachePutBuffer(windowUrl, win);
    await cachePutBuffer(signUrl, sign);
  } catch (err) {
    console.warn('ktx2 prefetch failed', err);
  }
}

/**
 * Resolve atlases before the first city material is built.
 * A cache hit (repeat visit) uploads KTX2. Otherwise the procedural atlases stay,
 * and a real GPU prefetches the files for the next visit.
 */
export async function prepareAtlases(renderer: WebGPURenderer): Promise<void> {
  if (ktx2Flag === '0') return;
  const force = ktx2Flag === '1';
  if (!force && (isSoftware(renderer) || !hasCompressed(renderer))) return;

  const [cachedWin, cachedSign] = await Promise.all([
    cacheMatchBuffer(windowUrl),
    cacheMatchBuffer(signUrl),
  ]);
  if (cachedWin && cachedSign) {
    const ok = await decodeAndInstall(renderer, cachedWin, cachedSign);
    if (ok) return;
  }
  if (!force) {
    void prefetchPair();
    return;
  }
  try {
    const [win, sign] = await Promise.all([fetchBuf(windowUrl), fetchBuf(signUrl)]);
    await cachePutBuffer(windowUrl, win);
    await cachePutBuffer(signUrl, sign);
    await decodeAndInstall(renderer, win, sign);
  } catch (err) {
    console.warn('ktx2 atlas fallback', err);
  }
}
