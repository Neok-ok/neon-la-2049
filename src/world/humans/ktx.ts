// Device GPUs transcode the human atlas and the dancer mask. Software renderers
// stay on the PNG so a SwiftShader bench matches the uncompressed image.
// The same ?ktx2=0 / ?ktx2=1 switch as the city atlases.
import type { Texture, WebGPURenderer } from 'three/webgpu';

interface KtxLoader {
  detectSupport(renderer: WebGPURenderer): unknown;
  parse(buffer: ArrayBuffer, onLoad: (tex: Texture) => void, onError?: (err: unknown) => void): void;
  dispose(): void;
}

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

/** True when this renderer should transcode human KTX2 instead of uploading PNG. */
export function preferHumanKtx2(renderer: WebGPURenderer | null | undefined): boolean {
  if (!renderer || typeof location === 'undefined') return false;
  const flag = new URLSearchParams(location.search).get('ktx2');
  if (flag === '0') return false;
  // ?ktx2=1 asks for a transcode even on a software renderer. The caller falls back to PNG.
  if (flag === '1') return true;
  return !isSoftware(renderer) && hasCompressed(renderer);
}

export function textureGpuBytes(tex: Texture, fallbackW: number, fallbackH: number): number {
  const mips = (tex as unknown as { mipmaps?: Array<{ data?: ArrayBufferView }> }).mipmaps;
  const mipBytes = mips?.[0]?.data?.byteLength ?? 0;
  if (mipBytes > 0) return mipBytes;
  const image = tex.image as { data?: ArrayBufferView; width?: number; height?: number } | undefined;
  if (image?.data?.byteLength) return image.data.byteLength;
  const w = image?.width ?? fallbackW;
  const h = image?.height ?? fallbackH;
  return w * h * 4;
}

let loaderPromise: Promise<KtxLoader> | null = null;

function sharedLoader(renderer: WebGPURenderer): Promise<KtxLoader> {
  if (!loaderPromise) {
    loaderPromise = import('three/addons/loaders/KTX2Loader.js').then(({ KTX2Loader }) => {
      const loader = new KTX2Loader() as unknown as KtxLoader;
      loader.detectSupport(renderer);
      return loader;
    });
  }
  return loaderPromise;
}

/** One transcoder for the atlas and the mask. A second worker is a memory spike. */
export async function transcodeKtx2(renderer: WebGPURenderer, buffer: ArrayBuffer): Promise<Texture> {
  const loader = await sharedLoader(renderer);
  return new Promise((resolve, reject) => {
    try {
      loader.parse(buffer, resolve, reject);
    } catch (err) {
      reject(err);
    }
  });
}

export function disposeHumanKtx(): void {
  const pending = loaderPromise;
  loaderPromise = null;
  void pending?.then((loader) => loader.dispose()).catch(() => undefined);
}
