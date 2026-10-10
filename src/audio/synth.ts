// Procedural buffers. No samples, no words, no brand names. Built once per context, off the
// steady frame path (the first tap, or an offline capture).
import { hash2i, Rng } from '../core/rng';

export function noiseBuffer(ctx: BaseAudioContext, seconds: number, brown: boolean, channels = 1): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(channels, len, ctx.sampleRate);
  for (let ch = 0; ch < channels; ch++) {
    const d = buf.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (!brown) d[i] = w;
      else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
  }
  return buf;
}

export function looping(ctx: BaseAudioContext, buf: AudioBuffer): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start(ctx.currentTime);
  return src;
}

const tongues = new WeakMap<BaseAudioContext, AudioBuffer[]>();

/** Four unintelligible babble loops. Formant pairs are invented, not a recording of speech. */
export function tongueBuffer(ctx: BaseAudioContext, tongue: number): AudioBuffer {
  let set = tongues.get(ctx);
  if (!set) {
    set = [];
    tongues.set(ctx, set);
  }
  const i = ((tongue % 4) + 4) % 4;
  const hit = set[i];
  if (hit) return hit;
  const seconds = 1.6;
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const rng = new Rng(hash2i(i + 3, 2049, 77));
  let n = 0;
  while (n < len) {
    const syl = Math.floor(rng.range(0.06, 0.15) * sr);
    const gap = Math.floor(rng.range(0.025, 0.1) * sr);
    for (let k = 0; k < syl && n < len; k++, n++) {
      d[n] = (rng.next() * 2 - 1) * Math.sin((k / syl) * Math.PI);
    }
    n += gap;
  }
  const f1 = [340, 280, 250, 390][i]!;
  const f2 = [1280, 1760, 980, 1540][i]!;
  bandpassInto(d, sr, f1, 2.2, 0.75);
  bandpassInto(d, sr, f2, 1.6, 0.35);
  fadeEdges(d, Math.floor(sr * 0.02));
  normalize(d, 0.72);
  set[i] = buf;
  return buf;
}

function bandpassInto(d: Float32Array, sr: number, freq: number, q: number, mix: number): void {
  const w0 = (2 * Math.PI * freq) / sr;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  const b0 = alpha;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const ib0 = b0 / a0, ib2 = b2 / a0, ia1 = a1 / a0, ia2 = a2 / a0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i]!;
    const y = ib0 * x + ib2 * x2 - ia1 * y1 - ia2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    d[i] = x * (1 - mix) + y * mix;
  }
}

function fadeEdges(d: Float32Array, n: number): void {
  const m = Math.min(n, d.length >> 1);
  for (let i = 0; i < m; i++) {
    const g = i / m;
    d[i] = (d[i] ?? 0) * g;
    const j = d.length - 1 - i;
    d[j] = (d[j] ?? 0) * g;
  }
}

function normalize(d: Float32Array, peak: number): void {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]!));
  if (m < 1e-4) return;
  const g = peak / m;
  for (let i = 0; i < d.length; i++) d[i] = (d[i] ?? 0) * g;
}

export function panner(ctx: BaseAudioContext, ref: number, max: number, roll: number): PannerNode {
  const p = ctx.createPanner();
  p.panningModel = 'equalpower';
  p.distanceModel = 'inverse';
  p.refDistance = ref;
  p.maxDistance = max;
  p.rolloffFactor = roll;
  return p;
}

export function setPos(node: PannerNode, x: number, y: number, z: number): void {
  const ax = node.positionX;
  if (ax) {
    ax.value = x;
    node.positionY.value = y;
    node.positionZ.value = z;
  } else node.setPosition(x, y, z);
}

export function setListener(
  ctx: BaseAudioContext,
  cam: { x: number; y: number; z: number },
  forward: { x: number; y: number; z: number },
  up: { x: number; y: number; z: number },
): void {
  const listener = ctx.listener;
  if (listener.positionX && listener.forwardX && listener.upX) {
    listener.positionX.value = cam.x;
    listener.positionY.value = cam.y;
    listener.positionZ.value = cam.z;
    listener.forwardX.value = forward.x;
    listener.forwardY.value = forward.y;
    listener.forwardZ.value = forward.z;
    listener.upX.value = up.x;
    listener.upY.value = up.y;
    listener.upZ.value = up.z;
  }
}
