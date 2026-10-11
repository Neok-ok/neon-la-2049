// Offline clips of the living bus. Same nodes as the game. Not a second runtime.
import { Ambience } from './Ambience';
import './beds';
import { bytesToBase64, encodeWav, peakOf, rmsOf } from './capture';
import { applyCityMix, mountCityGraph } from './graph';
import { LivingSound } from './living';
import { spinnerVoice } from './mix';
import { VOICE_CAP } from './registry';
import type { Tier } from '../core/quality';
import {
  SURFACE_TONE,
  SURFACES,
  TIER_PLAN,
  bufferBytes,
  evaluateLiving,
  hearDefaults,
  livingSelfCheck,
  memoryFor,
  type HearInput,
  type LivingFrame,
  type MemoryTier,
  type SurfaceId,
} from './livingModel';

export interface LivingFile {
  id: string;
  seconds: number;
  peak: number;
  rms: number;
  peakDb: number;
  rmsDb: number;
  clips: number;
  bands: Record<string, number>;
  wav: string;
}

export interface LivingCapture {
  check: string[];
  memory: MemoryTier[];
  runtimeBytes: number;
  planBytes: number;
  files: LivingFile[];
}

const SR = 44100;

export async function captureLiving(): Promise<LivingCapture> {
  const priorRandom = Math.random;
  Math.random = mulberry32(2049);
  try {
  const check = livingSelfCheck();
  const memory = (['low', 'medium', 'high', 'ultra'] as const).map((tier) => memoryFor(tier, SR));
  const files: LivingFile[] = [];
  for (const id of SURFACES) files.push(await renderSurface(id));
  files.push(await renderSpace('alley', hearDefaults({ streetWidth: 7, canyon: 0.3, laneDist: 2, rain: 1 })));
  files.push(await renderSpace('boulevard', hearDefaults({ streetWidth: 38, canyon: 0.4, laneDist: 4, rain: 1 })));
  files.push(await renderSpace('freeway', hearDefaults({
    edgeKind: 'freeway', deck: -8.6, alt: -5, freewayDepth: 8.6, freewayDist: 8, freewayWidth: 80, rain: 1,
  })));
  files.push(await renderSpace('interior', hearDefaults({ interior: 0.9, rain: 0.7, streetWidth: 12 })));
  files.push(await renderSiren());
  files.push(await renderSpinner());
  files.push(await renderNeon(false));
  files.push(await renderNeon(true));
  const mix = await renderMarket();
  files.push(mix.file);
  const runtimeBytes = mix.runtimeBytes;
  const planBytes = memoryFor('high', SR).decodedBytes;
  if (runtimeBytes !== planBytes) check.push(`runtime buffers ${runtimeBytes} != plan ${planBytes}`);
  if (mix.file.clips > 0) check.push(`market mix clipped ${mix.file.clips}`);
  if (mix.file.peak >= 1) check.push(`market mix peak ${mix.file.peak}`);
  const metal = files.find((f) => f.id === 'rain-metal');
  const glass = files.find((f) => f.id === 'rain-glass');
  const concrete = files.find((f) => f.id === 'rain-concrete');
  const puddle = files.find((f) => f.id === 'rain-puddle');
  const fabric = files.find((f) => f.id === 'rain-fabric');
  if (metal && concrete && !(metal.bands.high > concrete.bands.high)) {
    check.push(`metal high ${metal.bands.high} vs concrete ${concrete.bands.high}`);
  }
  if (metal && concrete && metal.peakDb - metal.rmsDb < concrete.peakDb - concrete.rmsDb + 4) {
    check.push(`metal crest ${(metal.peakDb - metal.rmsDb).toFixed(1)} vs concrete ${(concrete.peakDb - concrete.rmsDb).toFixed(1)}`);
  }
  if (glass && concrete && glass.bands.air < concrete.bands.air) {
    check.push(`glass air ${glass.bands.air} vs concrete ${concrete.bands.air}`);
  }
  if (puddle && glass && puddle.bands.low < glass.bands.low) {
    check.push(`puddle low ${puddle.bands.low} vs glass ${glass.bands.low}`);
  }
  if (fabric && metal && fabric.bands.high > metal.bands.high) {
    check.push(`fabric high ${fabric.bands.high} brighter than metal ${metal.bands.high}`);
  }
  if (fabric && metal && fabric.rmsDb < metal.rmsDb - 12) {
    check.push(`fabric rms ${fabric.rmsDb} too quiet next to metal ${metal.rmsDb}`);
  }
  const spin = files.find((f) => f.id === 'spinner-flyby');
  if (spin && !(spin.bands.approach! > spin.bands.leave! + 40)) {
    check.push(`spinner doppler ${spin.bands.approach} -> ${spin.bands.leave}`);
  }
  const narrow = files.find((f) => f.id === 'space-alley');
  const wide = files.find((f) => f.id === 'space-boulevard');
  const lid = files.find((f) => f.id === 'space-freeway');
  const room = files.find((f) => f.id === 'space-interior');
  if (narrow && wide && !(narrow.bands.air < wide.bands.air - 3)) {
    check.push(`alley air ${narrow.bands.air} vs boulevard ${wide.bands.air}`);
  }
  if (narrow && wide && !(narrow.bands.slap50! > 0.2 && narrow.bands.slap50! > wide.bands.slap50! + 0.1)) {
    check.push(`alley slap ${narrow.bands.slap50} vs boulevard ${wide.bands.slap50}`);
  }
  if (wide && !(wide.bands.slap220! > 0.1)) {
    check.push(`boulevard slap ${wide.bands.slap220}`);
  }
  if (lid && wide && !(lid.bands.air < wide.bands.air - 6)) {
    check.push(`freeway air ${lid.bands.air} vs boulevard ${wide.bands.air}`);
  }
  if (room && wide && !(room.bands.high < wide.bands.high - 3)) {
    check.push(`interior high ${room.bands.high} vs boulevard ${wide.bands.high}`);
  }
  const behind = files.find((f) => f.id === 'neon-behind');
  const openNeon = files.find((f) => f.id === 'neon-open');
  if (behind && openNeon && !(behind.bands.high < openNeon.bands.high - 8)) {
    check.push(`neon behind ${behind.bands.high} vs open ${openNeon.bands.high}`);
  }
  if (mix.file.peakDb > -3) check.push(`market mix ${mix.file.peakDb} dBFS over the -3 ceiling`);
  return { check, memory, runtimeBytes, planBytes, files };
  } finally {
    Math.random = priorRandom;
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function renderSurface(id: SurfaceId): Promise<LivingFile> {
  const seconds = 1.15;
  const ctx = offline(seconds);
  const white = noiseBuffer(ctx, 2);
  const living = new LivingSound();
  living.mount(ctx, ctx.destination, white, 'high');
  const frame = solo(id, hearDefaults({ rain: 1, streetWidth: 18 }), 'high', 0.11);
  frame.wet = 0;
  frame.space = { ...frame.space, wet: 0, lid: 0, airHz: 16000 };
  living.prime(frame, seconds);
  return finish(ctx, `rain-${id}`);
}

async function renderSpace(name: string, input: HearInput): Promise<LivingFile> {
  const seconds = 1.6;
  const ctx = offline(seconds);
  const white = noiseBuffer(ctx, 2);
  const living = new LivingSound();
  living.mount(ctx, ctx.destination, white, 'ultra');
  const frame = solo('concrete', input, 'ultra', 0.07);
  frame.impact = 0.28;
  frame.interval = 0.42;
  living.prime(frame, seconds);
  return finish(ctx, `space-${name}`);
}

async function renderSiren(): Promise<LivingFile> {
  const seconds = 2.4;
  const ctx = offline(seconds);
  const white = noiseBuffer(ctx, 2);
  const living = new LivingSound();
  living.mount(ctx, ctx.destination, white, 'high');
  const at = (modelTime: number): LivingFrame => {
    const frame = evaluateLiving(hearDefaults({ time: modelTime, rain: 0, district: 'dtla', y: 8 }), 'high');
    frame.level = 0;
    frame.impact = 0;
    frame.wet = 0;
    return frame;
  };
  living.prime(at(2.5), seconds);
  living.primeSiren(at, 2.5, seconds);
  return finish(ctx, 'siren-pass');
}

async function renderSpinner(): Promise<LivingFile> {
  const seconds = 1.6;
  const ctx = offline(seconds);
  placeListener(ctx);
  const graph = mountCityGraph(ctx, ctx.destination, 0);
  const approach = spinnerVoice({ dist: 80, closing: 55 }, 0, false);
  const leave = spinnerVoice({ dist: 80, closing: -55 }, 0, false);
  const close = spinnerVoice({ dist: 16, closing: 20 }, 0, false);
  const pan = graph.spinnerPan;
  graph.spinner.gain.setValueAtTime(approach.gain * 0.35, 0);
  graph.spinner.gain.linearRampToValueAtTime(close.gain * 2.4, seconds * 0.46);
  graph.spinner.gain.linearRampToValueAtTime(leave.gain * 0.35, seconds);
  graph.spinnerFilter.frequency.setValueAtTime(approach.freq, 0);
  graph.spinnerFilter.frequency.linearRampToValueAtTime(close.freq, seconds * 0.46);
  graph.spinnerFilter.frequency.linearRampToValueAtTime(leave.freq, seconds);
  pan.positionX.setValueAtTime(-42, 0);
  pan.positionX.linearRampToValueAtTime(42, seconds);
  pan.positionY.setValueAtTime(7, 0);
  pan.positionZ.setValueAtTime(24, 0);
  pan.positionZ.linearRampToValueAtTime(4, seconds * 0.46);
  pan.positionZ.linearRampToValueAtTime(28, seconds);
  const file = await finish(ctx, 'spinner-flyby');
  file.bands.approach = Math.round(approach.freq);
  file.bands.leave = Math.round(leave.freq);
  return file;
}

async function renderNeon(occluded: boolean): Promise<LivingFile> {
  const seconds = 1;
  const ctx = offline(seconds);
  const white = noiseBuffer(ctx, 1);
  const open = ctx.createBiquadFilter();
  open.type = 'bandpass';
  open.frequency.value = 3200;
  open.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.value = 0.08;
  const src = ctx.createBufferSource();
  src.buffer = white;
  src.loop = true;
  src.start(0);
  src.connect(open);
  if (occluded) {
    const shut = ctx.createBiquadFilter();
    shut.type = 'lowpass';
    shut.frequency.value = 700;
    open.connect(shut).connect(g);
  } else {
    open.connect(g);
  }
  const hum = ctx.createOscillator();
  hum.type = 'sine';
  hum.frequency.value = 120;
  const hum2 = ctx.createOscillator();
  hum2.type = 'sine';
  hum2.frequency.value = 240;
  const humGain = ctx.createGain();
  humGain.gain.value = occluded ? 0.02 : 0.05;
  const hum2Gain = ctx.createGain();
  hum2Gain.gain.value = occluded ? 0.006 : 0.016;
  hum.connect(humGain).connect(g);
  hum2.connect(hum2Gain).connect(g);
  hum.start(0);
  hum2.start(0);
  g.connect(ctx.destination);
  return finish(ctx, occluded ? 'neon-behind' : 'neon-open');
}

async function renderMarket(): Promise<{ file: LivingFile; runtimeBytes: number }> {
  const seconds = 1.5;
  const ctx = offline(seconds);
  const amb = new Ambience(false);
  amb.mountOffline(ctx);
  amb.pinMaster(0.8);
  amb.setInterior(0);
  amb.setCityPlace(1);
  amb.prime(1, 0, 6, 1.7, 1);
  const master = amb.output!;
  const graph = mountCityGraph(ctx, master, VOICE_CAP.high);
  placeListener(ctx);
  applyCityMix(graph, {
    district: 'little-tokyo-market',
    rain: 1,
    alt: 1.7,
    interior: 0,
    night: 1,
    presence: 1,
    traffic: 0.3,
    awningNear: 0.85,
    inMarket: true,
  });
  const living = new LivingSound();
  living.mount(ctx, master, graph.white, 'high');
  const frame = evaluateLiving(hearDefaults({
    rain: 1, streetWidth: 7, laneDist: 2, awningNear: 0.85, umbrella: 0.74,
    neon: 0.92, canyon: 0.38, industrial: 0.06, district: 'little-tokyo-market', time: 1,
  }), 'high');
  living.prime(frame, seconds);
  const runtimeBytes = bufferBytes([...amb.decodedBuffers, ...graph.buffers]);
  const file = await finish(ctx, 'market-mix');
  return { file, runtimeBytes };
}

function solo(id: SurfaceId, input: HearInput, tier: Tier, level: number): LivingFrame {
  const frame = evaluateLiving(input, tier);
  for (const key of SURFACES) frame.weights[key] = key === id ? 1 : 0;
  frame.dominant = id;
  frame.level = level;
  const plan = TIER_PLAN[tier];
  frame.impact = plan.drips > 0 ? level * 4.8 * SURFACE_TONE[id].impact : 0;
  frame.interval = id === 'metal' || id === 'glass' ? 0.11 : id === 'fabric' ? 0.55 : 0.22;
  return frame;
}

function offline(seconds: number): OfflineAudioContext {
  return new OfflineAudioContext(2, Math.floor(SR * seconds), SR);
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = w * 0.85 + last;
  }
  return buf;
}

async function finish(ctx: OfflineAudioContext, id: string): Promise<LivingFile> {
  const audio = await ctx.startRendering();
  const peak = peakOf(audio);
  const rms = rmsOf(audio);
  return {
    id,
    seconds: audio.length / audio.sampleRate,
    peak,
    rms,
    peakDb: db(peak),
    rmsDb: db(rms),
    clips: clipsOf(audio),
    bands: { ...bandsOf(audio), slap50: corrAt(audio, 0.05), slap220: corrAt(audio, 0.22) },
    wav: bytesToBase64(encodeWav(audio)),
  };
}

function placeListener(ctx: BaseAudioContext): void {
  const listener = ctx.listener;
  if (!listener.positionX || !listener.forwardX || !listener.upX) return;
  listener.positionX.value = 0;
  listener.positionY.value = 1.7;
  listener.positionZ.value = 0;
  listener.forwardX.value = 0;
  listener.forwardY.value = 0;
  listener.forwardZ.value = -1;
  listener.upX.value = 0;
  listener.upY.value = 1;
  listener.upZ.value = 0;
}

function corrAt(buf: AudioBuffer, delaySec: number): number {
  const ch = buf.getChannelData(0);
  const lag = Math.max(1, Math.round(delaySec * buf.sampleRate));
  const n = ch.length - lag;
  if (n < 1000) return 0;
  const step = 4;
  let count = 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i += step) {
    ma += ch[i]!;
    mb += ch[i + lag]!;
    count++;
  }
  ma /= count;
  mb /= count;
  let va = 0;
  let vb = 0;
  let cov = 0;
  for (let i = 0; i < n; i += step) {
    const a = ch[i]! - ma;
    const b = ch[i + lag]! - mb;
    va += a * a;
    vb += b * b;
    cov += a * b;
  }
  const den = Math.sqrt(va * vb);
  const r = den > 0 ? cov / den : 0;
  return Math.round(r * 1000) / 1000;
}

function db(v: number): number {
  return Math.round(20 * Math.log10(Math.max(v, 1e-8)) * 10) / 10;
}

function clipsOf(buf: AudioBuffer): number {
  let n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i]!) >= 0.999) n++;
  }
  return n;
}

function bandsOf(buf: AudioBuffer): Record<string, number> {
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
  const n = 1 << Math.floor(Math.log2(Math.min(8192, ch0.length)));
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const start = Math.max(0, ch0.length - n * 2);
  for (let i = 0; i < n; i++) {
    const s = start + i;
    re[i] = 0.5 * ((ch0[s] ?? 0) + (ch1[s] ?? 0));
  }
  fft(re, im);
  const sr = buf.sampleRate;
  const bins: Record<string, number> = { sub: 0, low: 0, mid: 0, high: 0, air: 0 };
  for (let k = 1; k < n / 2; k++) {
    const hz = (k * sr) / n;
    const p = re[k]! * re[k]! + im[k]! * im[k]!;
    const name = hz < 80 ? 'sub' : hz < 250 ? 'low' : hz < 2000 ? 'mid' : hz < 8000 ? 'high' : 'air';
    bins[name] = (bins[name] ?? 0) + p;
  }
  const out: Record<string, number> = {};
  for (const key of Object.keys(bins)) out[key] = db(Math.sqrt(bins[key]! / n));
  return out;
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!; re[i] = re[j]!; re[j] = tr;
      const ti = im[i]!; im[i] = im[j]!; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k]!;
        const uIm = im[i + k]!;
        const vRe = re[i + k + len / 2]! * wRe - im[i + k + len / 2]! * wIm;
        const vIm = re[i + k + len / 2]! * wIm + im[i + k + len / 2]! * wRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextRe;
      }
    }
  }
}
