// Offline renders of four street scenes. Same graph and the same gain law as the live bus.
// No samples. The files are demonstrations, not a second runtime.
import { mountCityGraph } from './graph';
import { mixTargets, slotLevel } from './mix';
import { bedOrQuiet, VOICE_CAP } from './registry';
import { setPos } from './synth';
import './beds';

export interface CaptureFile {
  id: string;
  peak: number;
  rms: number;
  /** Base64 WAV, 16-bit stereo. */
  wav: string;
}

interface Scene {
  id: string;
  district: string;
  rain: number;
  alt: number;
  interior: number;
  night: number;
  presence: number;
  inMarket: boolean;
  /** Force the horn open so a 3 s file contains it. */
  horn: number;
}

const SCENES: Scene[] = [
  { id: 'market', district: 'little-tokyo-market', rain: 0.85, alt: 1.7, interior: 0, night: 1, presence: 1, inMarket: true, horn: 0 },
  { id: 'broadway', district: 'historic-core', rain: 0.7, alt: 1.7, interior: 0, night: 1, presence: 0.72, inMarket: false, horn: 0 },
  { id: 'harbor', district: 'harbor', rain: 0.45, alt: 6, interior: 0, night: 1, presence: 0.02, inMarket: false, horn: 1 },
  { id: 'interior', district: 'little-tokyo-market', rain: 0.85, alt: 1.7, interior: 1, night: 1, presence: 0.2, inMarket: true, horn: 0 },
];

export async function captureScenes(): Promise<CaptureFile[]> {
  const out: CaptureFile[] = [];
  for (const scene of SCENES) out.push(await renderScene(scene));
  return out;
}

async function renderScene(scene: Scene): Promise<CaptureFile> {
  const seconds = 3;
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, Math.floor(sr * seconds), sr);
  const master = ctx.createGain();
  master.gain.value = 0.8;
  const muffle = ctx.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = scene.interior > 0.5 ? 420 : 14000;
  master.connect(muffle).connect(ctx.destination);

  const rain = ctx.createBufferSource();
  rain.buffer = white(ctx, 2);
  rain.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900;
  const rg = ctx.createGain();
  rg.gain.value = scene.rain * 0.32 * (1 - 0.58 * scene.interior);
  rain.connect(hp).connect(rg).connect(master);
  rain.start(0);

  if (scene.interior > 0.45) {
    const room = ctx.createBufferSource();
    room.buffer = brown(ctx, 2);
    room.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const g = ctx.createGain();
    g.gain.value = scene.interior * 0.02;
    room.connect(lp).connect(g).connect(master);
    room.start(0);
  }

  const graph = mountCityGraph(ctx, master, VOICE_CAP.medium);
  const bed = bedOrQuiet(scene.district);
  const mix = mixTargets({
    bed,
    presence: scene.presence,
    rain: scene.rain,
    alt: scene.alt,
    interior: scene.interior,
    night: scene.night,
    traffic: scene.district === 'harbor' ? 0.2 : 0.45,
    hornEnv: scene.horn,
    awningNear: scene.inMarket ? 0.8 : 0.15,
    inMarket: scene.inMarket,
  });
  graph.drone.gain.value = mix.drone;
  graph.murmur.gain.value = mix.murmur;
  graph.industrial.gain.value = mix.industrial;
  graph.awning.gain.value = mix.awning;
  graph.horn.gain.setValueAtTime(0, 0);
  graph.horn.gain.linearRampToValueAtTime(mix.horn, 0.25);
  graph.horn.gain.linearRampToValueAtTime(mix.horn, 1.5);
  graph.horn.gain.linearRampToValueAtTime(0, 2.8);
  graph.wet.gain.value = mix.pa * mix.canyon * 0.7;
  graph.feedback.gain.value = 0.16 + mix.canyon * 0.22;
  graph.delay.delayTime.value = 0.11 + mix.canyon * 0.1;
  const tongue = Math.max(0, Math.min(graph.pa.length - 1, bed.tongue));
  graph.pa[tongue]!.gain.value = mix.pa;

  const places: Array<{ kind: 'sizzle' | 'murmur' | 'neon' | 'steam'; x: number; z: number; y: number }> = [
    { kind: 'sizzle', x: 4, z: 1.2, y: 1.2 },
    { kind: 'murmur', x: -3, z: 2, y: 1.6 },
    { kind: 'neon', x: 2.2, z: -1.4, y: 3.2 },
    { kind: 'steam', x: 5, z: -2, y: 1.3 },
  ];
  if (ctx.listener.positionX) {
    ctx.listener.positionX.value = 0;
    ctx.listener.positionY.value = 1.7;
    ctx.listener.positionZ.value = 0;
    ctx.listener.forwardX.value = 0;
    ctx.listener.forwardY.value = 0;
    ctx.listener.forwardZ.value = -1;
    ctx.listener.upX.value = 0;
    ctx.listener.upY.value = 1;
    ctx.listener.upZ.value = 0;
  }
  for (let i = 0; i < graph.slots.length && i < places.length; i++) {
    const slot = graph.slots[i]!;
    const p = places.find((q) => q.kind === slot.kind) ?? places[i]!;
    setPos(slot.pan, p.x, p.y, p.z);
    const dist = Math.hypot(p.x, p.z);
    slot.gain.gain.value = slotLevel(slot.kind, bed, dist, scene.rain, mix.street, mix.open, scene.presence);
  }

  const audio = await ctx.startRendering();
  return { id: scene.id, peak: peakOf(audio), rms: rmsOf(audio), wav: bytesToBase64(encodeWav(audio)) };
}

function white(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function brown(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

function peakOf(buf: AudioBuffer): number {
  let m = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i += 8) m = Math.max(m, Math.abs(d[i]!));
  }
  return Math.round(m * 1000) / 1000;
}

function rmsOf(buf: AudioBuffer): number {
  let s = 0;
  let n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i += 8) {
      s += d[i]! * d[i]!;
      n++;
    }
  }
  return Math.round(Math.sqrt(s / Math.max(1, n)) * 1000) / 1000;
}

function encodeWav(buffer: AudioBuffer): Uint8Array {
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  const sr = buffer.sampleRate;
  const bytes = len * ch * 2;
  const out = new ArrayBuffer(44 + bytes);
  const v = new DataView(out);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + bytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, bytes, true);
  const data: Float32Array[] = [];
  for (let c = 0; c < ch; c++) data.push(buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c]![i]!));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Uint8Array(out);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x1000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const end = Math.min(bytes.length, i + chunk);
    let part = '';
    for (let j = i; j < end; j++) part += String.fromCharCode(bytes[j]!);
    bin += part;
  }
  return btoa(bin);
}
