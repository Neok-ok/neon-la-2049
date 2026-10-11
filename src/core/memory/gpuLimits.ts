// Synchronous WebGL2 limit probe. The context is thrown away before the real renderer starts.
import type { GpuLimits } from './budget';

export function readGpuLimits(): GpuLimits | undefined {
  if (typeof document === 'undefined') return undefined;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return undefined;
    const limits: GpuLimits = {
      maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0,
      maxRenderbufferSize: Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)) || 0,
      maxSamples: Number(gl.getParameter(gl.MAX_SAMPLES)) || 0,
      maxBufferSize: 0,
    };
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return limits;
  } catch {
    return undefined;
  }
}

export function jsHeapLimit(): number | undefined {
  if (typeof performance === 'undefined') return undefined;
  return (performance as { memory?: { jsHeapSizeLimit?: number } }).memory?.jsHeapSizeLimit;
}
