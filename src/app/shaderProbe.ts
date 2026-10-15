import type { WebGPURenderer } from 'three/webgpu';

export interface GpuSpan {
  t: number;
  ms: number;
  kind: 'link' | 'draw' | 'reflect' | 'upload';
}

/**
 * Times program links and draws. SwiftShader blocks the main thread inside the
 * driver, so a load budget can separate that from JavaScript. `?loadprobe=1` only.
 */
let flushReflectOuter: () => void = () => {};

/** Push any uniform-reflection time still sitting in the probe, before the task ends. */
export function flushShaderProbe(): void {
  flushReflectOuter();
}

export function installShaderProbe(renderer: WebGPURenderer): void {
  const gl = (renderer.backend as { gl?: WebGL2RenderingContext }).gl;
  if (!gl) return;
  const w = window as Window & { __shaderLinks?: GpuSpan[] };
  const spans = w.__shaderLinks ?? (w.__shaderLinks = []);
  let pending = 0;
  const compile = gl.compileShader.bind(gl);
  const link = gl.linkProgram.bind(gl);
  const getp = gl.getProgramParameter.bind(gl);
  gl.compileShader = (shader: WebGLShader) => {
    const t0 = performance.now();
    compile(shader);
    pending += performance.now() - t0;
  };
  gl.linkProgram = (program: WebGLProgram) => {
    const t0 = performance.now();
    link(program);
    pending += performance.now() - t0;
  };
  gl.getProgramParameter = ((program: WebGLProgram, pname: GLenum) => {
    if (pname !== gl.LINK_STATUS) return getp(program, pname);
    const t0 = performance.now();
    const result = getp(program, pname);
    spans.push({ t: t0, ms: pending + (performance.now() - t0), kind: 'link' });
    pending = 0;
    return result;
  }) as typeof gl.getProgramParameter;

  // Uniform reflection runs after the link status check. On SwiftShader that is
  // the long part of a new program, and it is driver time, not page JavaScript.
  let reflectT = 0;
  let reflectMs = 0;
  const flushReflect = () => {
    if (reflectMs <= 0) return;
    spans.push({ t: reflectT, ms: reflectMs, kind: 'reflect' });
    reflectMs = 0;
  };
  // compileShader time sits in `pending` until LINK_STATUS. A slice that compiles
  // and yields before the link would otherwise look like JavaScript.
  flushReflectOuter = () => {
    flushReflect();
    if (pending <= 0) return;
    spans.push({ t: performance.now(), ms: pending, kind: 'link' });
    pending = 0;
  };
  const chargeReflect = (t0: number, ms: number) => {
    if (ms < 0.05) return;
    if (reflectMs === 0) reflectT = t0;
    reflectMs += ms;
    if (reflectMs >= 8) flushReflect();
  };
  const wrapReflect = (name: 'getUniformLocation' | 'getUniformBlockIndex' | 'uniformBlockBinding' | 'uniform1i') => {
    const orig = gl[name];
    if (typeof orig !== 'function') return;
    (gl as unknown as Record<string, unknown>)[name] = function (this: WebGL2RenderingContext, ...args: unknown[]) {
      const t0 = performance.now();
      const result = (orig as (...a: unknown[]) => unknown).apply(this, args);
      chargeReflect(t0, performance.now() - t0);
      return result;
    };
  };
  wrapReflect('getUniformLocation');
  wrapReflect('getUniformBlockIndex');
  wrapReflect('uniformBlockBinding');
  wrapReflect('uniform1i');

  const drawNames = [
    'drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced',
    'drawRangeElements',
  ] as const;
  for (const name of drawNames) {
    const orig = gl[name];
    if (typeof orig !== 'function') continue;
    (gl as unknown as Record<string, unknown>)[name] = function (this: WebGL2RenderingContext, ...args: unknown[]) {
      const t0 = performance.now();
      const result = (orig as (...a: unknown[]) => unknown).apply(this, args);
      const ms = performance.now() - t0;
      if (ms >= 0.4) spans.push({ t: t0, ms, kind: 'draw' });
      return result;
    };
  }

  // Attribute and texture uploads block inside the driver. A city chunk is a few
  // milliseconds on a discrete GPU and most of a second on SwiftShader.
  const uploadNames = [
    'bufferData', 'bufferSubData', 'texImage2D', 'texSubImage2D',
    'compressedTexImage2D', 'compressedTexSubImage2D',
  ] as const;
  for (const name of uploadNames) {
    const orig = gl[name];
    if (typeof orig !== 'function') continue;
    (gl as unknown as Record<string, unknown>)[name] = function (this: WebGL2RenderingContext, ...args: unknown[]) {
      const t0 = performance.now();
      const result = (orig as (...a: unknown[]) => unknown).apply(this, args);
      const ms = performance.now() - t0;
      if (ms >= 0.4) spans.push({ t: t0, ms, kind: 'upload' });
      return result;
    };
  }
}
