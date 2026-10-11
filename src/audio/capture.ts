// Offline renders of four street scenes. Same graph and the same gain law as the live bus,
// including the master bed and the interior low-pass. No samples. Demonstrations, not a second runtime.
import { Ambience } from './Ambience';
import './beds';
import { applyCityMix, mountCityGraph } from './graph';
import { cityPlaceOf } from './mix';
import { VOICE_CAP } from './registry';

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
  wind: number;
  alt: number;
  interior: number;
  hum: number;
  night: number;
  presence: number;
  traffic: number;
  inMarket: boolean;
  awningNear: number;
  /** Force the horn open so a 3 s file contains the blast. */
  horn: number;
}

const SCENES: Scene[] = [
  { id: 'market', district: 'little-tokyo-market', rain: 0.85, wind: 5, alt: 1.7, interior: 0, hum: 0, night: 1, presence: 1, traffic: 0.35, inMarket: true, awningNear: 0.8, horn: 0 },
  { id: 'broadway', district: 'historic-core', rain: 0.7, wind: 5, alt: 1.7, interior: 0, hum: 0, night: 1, presence: 0.72, traffic: 0.45, inMarket: false, awningNear: 0.15, horn: 0 },
  { id: 'harbor', district: 'harbor', rain: 0.65, wind: 5, alt: 6, interior: 0, hum: 0, night: 1, presence: 0.02, traffic: 0.2, inMarket: false, awningNear: 0.1, horn: 1 },
  { id: 'interior', district: 'k-megablock', rain: 0.65, wind: 5, alt: 1.7, interior: 0.88, hum: 0.45, night: 1, presence: 0.12, traffic: 0, inMarket: false, awningNear: 0.1, horn: 0 },
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
  const amb = new Ambience(false);
  amb.mountOffline(ctx);
  amb.pinMaster(0.8);
  amb.setInterior(scene.interior);
  amb.setHum(scene.hum);
  amb.setTraffic(scene.traffic);
  amb.setCityPlace(cityPlaceOf(scene.district));
  amb.prime(scene.rain, 0, scene.wind, scene.alt, 1);
  const master = amb.output!;
  const graph = mountCityGraph(ctx, master, VOICE_CAP.medium);
  if (ctx.listener.positionX && ctx.listener.forwardX && ctx.listener.upX) {
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
  applyCityMix(graph, {
    district: scene.district,
    rain: scene.rain,
    alt: scene.alt,
    interior: scene.interior,
    night: scene.night,
    presence: scene.presence,
    traffic: scene.traffic,
    hornEnv: scene.horn,
    awningNear: scene.awningNear,
    inMarket: scene.inMarket,
  });
  const audio = await ctx.startRendering();
  return { id: scene.id, peak: peakOf(audio), rms: rmsOf(audio), wav: bytesToBase64(encodeWav(audio)) };
}

function peakOf(buf: AudioBuffer): number {
  let m = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]!));
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
