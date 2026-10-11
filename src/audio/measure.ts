// Offline acceptance renders for the R2 bed. Same band split as the sound critique.
// Not a second runtime: the page calls this from __nlaAudio.measure.
import { CityLayout } from '../world/layout';
import { Ambience, CITY_DUCK, ambienceTargets, shouldResume } from './Ambience';
import './beds';
import { heardDistrictId, retargetCrossfade } from './CitySound';
import { applyCityMix, mountCityGraph, type CityGraph } from './graph';
import { cityPlaceOf, mixTargets, spinnerVoice, type SpinnerHeard } from './mix';
import { VOICE_CAP, bedOrQuiet } from './registry';
import { setPos } from './synth';

export interface MeasureFile {
  id: string;
  law: 'r2' | 'legacy';
  peak: number;
  rms: number;
  peakDb: number;
  rmsDb: number;
  clips: number;
  bands: Record<string, number>;
  gains: Record<string, number>;
  spinner: { gain: number; freq: number };
  slots: number;
  loop6: { at: number; beside: number; excess: number } | null;
  /** Loudest excess in the 5.2–6.8 s neighborhood, so a shifted loop still shows up. */
  loopNear: { lag: number; excess: number } | null;
  steadyDb: number;
  thumpDb: number;
  rateError: string;
  seconds: number;
  wav?: string;
  error?: string;
}

interface Scene {
  id: string;
  district: string;
  rain: number;
  wind: number;
  alt: number;
  interior: number;
  night: number;
  presence: number;
  traffic: number;
  seconds: number;
  snow?: number;
  hum?: number;
  aboveClouds?: number;
  machinery?: number;
  surf?: number;
  surfImpact?: number;
  crest?: number;
  inMarket?: boolean;
  awningNear?: number;
  flying?: boolean;
  spinner?: SpinnerHeard | null;
  solo?: 'city' | 'pa';
  hornEnv?: number;
  /** Autocorrelation period. PA uses 4 s; the city bed uses 6 s. */
  loopAt?: number;
  cityGain?: number;
  /** Render the seamless bed with the rate locked, to separate the joint from the drift. */
  lockRate?: boolean;
  save?: boolean;
}

const SCENES: Array<Scene & { laws: Array<'r2' | 'legacy'> }> = [
  { id: 'dry-afternoon', laws: ['legacy', 'r2'], district: 'basin-sprawl', rain: 0, wind: 2, alt: 1.7, interior: 0, night: 0, presence: 0.07, traffic: 0.2, seconds: 3, save: true },
  { id: 'city-loop', laws: ['legacy', 'r2'], district: 'basin-sprawl', rain: 0, wind: 0, alt: 1.7, interior: 0, night: 1, presence: 0, traffic: 0, seconds: 8, solo: 'city', cityGain: 0.479, save: true },
  { id: 'city-seam', laws: ['r2'], district: 'basin-sprawl', rain: 0, wind: 0, alt: 1.7, interior: 0, night: 1, presence: 0, traffic: 0, seconds: 8, solo: 'city', cityGain: 0.479, lockRate: true, save: true },
  { id: 'k-apartment', laws: ['legacy', 'r2'], district: 'k-megablock', rain: 0.65, wind: 5, alt: 1.7, interior: 0.88, hum: 0.45, night: 1, presence: 0.12, traffic: 0, seconds: 3, save: true },
  { id: 'bradbury-court', laws: ['legacy', 'r2'], district: 'historic-core', rain: 0.7, wind: 5, alt: 1.7, interior: 0.8, hum: 0, night: 1, presence: 0.3, traffic: 0.2, seconds: 3, save: true },
  { id: 'broadway-rain', laws: ['legacy', 'r2'], district: 'historic-core', rain: 0.7, wind: 5, alt: 1.7, interior: 0, night: 1, presence: 0.72, traffic: 0.55, awningNear: 0.25, seconds: 3, save: true },
  { id: 'fin-street', laws: ['legacy', 'r2'], district: 'financial-megatowers', rain: 0.65, wind: 5, alt: 1.7, interior: 0, night: 1, presence: 0.15, traffic: 0.05, seconds: 3, save: true },
  { id: 'spinner-cruise', laws: ['r2'], district: 'financial-megatowers', rain: 0.65, wind: 5, alt: 220, interior: 0, night: 1, presence: 0.15, traffic: 0.05, flying: true, seconds: 3, save: true },
  { id: 'spinner-flyby', laws: ['r2'], district: 'financial-megatowers', rain: 0.65, wind: 5, alt: 220, interior: 0, night: 1, presence: 0.15, traffic: 0.05, flying: true, spinner: { dist: 90, closing: 40 }, seconds: 3, save: true },
  { id: 'aerial', laws: ['legacy', 'r2'], district: 'dtla', rain: 0.65, wind: 8, alt: 1600, aboveClouds: 1 - (1600 - 1400) / 600, interior: 0, night: 1, presence: 0, traffic: 0, seconds: 3, save: true },
  { id: 'dtla-street', laws: ['r2'], district: 'dtla', rain: 0.65, wind: 5, alt: 1.7, interior: 0, night: 1, presence: 0.4, traffic: 0.1, seconds: 2.5 },
  { id: 'service', laws: ['r2'], district: 'historic-core', rain: 0.7, wind: 5, alt: 1.7, interior: 1, hum: 0, night: 1, presence: 0.1, traffic: 0.1, seconds: 2.5 },
];

export async function measurePass(): Promise<{
  checks: Record<string, number | boolean | string>;
  resume: Record<string, string>;
  files: MeasureFile[];
}> {
  const m88 = ambienceTargets(blank({ interior: 0.88, hum: 0.45, rain: 0.65 }));
  const m80 = ambienceTargets(blank({ interior: 0.8, rain: 0.7 }));
  const m1 = ambienceTargets(blank({ interior: 1, rain: 0.7 }));
  const street = ambienceTargets(blank({ rain: 0.65, altitude: 1.7 }));
  const up = ambienceTargets(blank({ rain: 0.65, altitude: 220, aboveClouds: 1 }));
  const high = ambienceTargets(blank({ rain: 0.65, altitude: 1600, aboveClouds: 1 - 200 / 600 }));
  const cruise = spinnerVoice(null, 0, true);
  const flyby = spinnerVoice({ dist: 90, closing: 40 }, 0, true);
  const parked = spinnerVoice(null, 0, false);
  const checks: Record<string, number | boolean | string> = {
    cityDuck: CITY_DUCK,
    voiceCap: VOICE_CAP.medium,
    muffle88: Math.round(m88.muffleHz),
    muffle80: Math.round(m80.muffleHz),
    muffle1: Math.round(m1.muffleHz),
    humApartment: round3(m88.hum),
    roomApartment: round3(m88.room),
    cityApartment: round3(m88.city),
    cityStreet: round3(street.city),
    rainStreet: round3(street.rain),
    rain220: round3(up.rain),
    patter220: round3(up.patter),
    rain1600: round3(high.rain),
    lfoDry: ambienceTargets(blank({ rain: 0 })).lfo,
    cruiseGain: cruise.gain,
    cruiseHz: cruise.freq,
    flybyGain: round3(flyby.gain),
    flybyHz: Math.round(flyby.freq),
    parkedGain: parked.gain,
    resumeSuspended: shouldResume('suspended', false),
    resumeInterrupted: shouldResume('interrupted', false),
    resumeVisSuspended: shouldResume('suspended', true),
    resumeVisInterrupted: shouldResume('interrupted', true),
  };
  const files: MeasureFile[] = [];
  for (const scene of SCENES) {
    for (const law of scene.laws) {
      try {
        files.push(await render(scene, law));
      } catch (err) {
        files.push(failed(scene, law, err));
      }
    }
  }
  return { checks, resume: await resumeSmoke(), files };
}

function blank(over: Partial<Parameters<typeof ambienceTargets>[0]>): Parameters<typeof ambienceTargets>[0] {
  return {
    rain: 0, snow: 0, wind: 0, altitude: 1.7, aboveClouds: 1,
    interior: 0, hum: 0, machinery: 0, surf: 0, surfImpact: 0, crest: 0, traffic: 0,
    ...over,
  };
}

async function render(scene: Scene, law: 'r2' | 'legacy'): Promise<MeasureFile> {
  const seconds = scene.seconds;
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, Math.floor(sr * seconds), sr);
  let rateError = '';
  let gains: Record<string, number>;
  let master: GainNode;
  if (law === 'r2') {
    const amb = new Ambience(false);
    amb.mountOffline(ctx);
    amb.pinMaster(0.8);
    if (scene.lockRate) amb.holdCityRate(1);
    rateError = amb.rateError;
    amb.setInterior(scene.interior);
    amb.setHum(scene.hum ?? 0);
    amb.setTraffic(scene.traffic);
    amb.setMachinery(scene.machinery ?? 0);
    amb.setSurf(scene.surf ?? 0, scene.surfImpact ?? 0, scene.crest ?? 0);
    amb.setCityPlace(cityPlaceOf(scene.district));
    if (scene.solo === 'city' || scene.solo === 'pa') {
      amb.soloCity(scene.solo === 'pa' ? 0 : (scene.cityGain ?? 0.479));
      gains = { city: scene.solo === 'pa' ? 0 : (scene.cityGain ?? 0.479), lfo: 0, muffleHz: 14000, rain: 0, patter: 0, room: 0, hum: 0 };
    } else {
      const g = amb.prime(scene.rain, scene.snow ?? 0, scene.wind, scene.alt, scene.aboveClouds ?? 1);
      gains = pack(g);
    }
    master = amb.output!;
  } else {
    const g = legacyTargets(scene);
    const built = mountLegacy(ctx, g);
    master = built.master;
    gains = pack(g);
  }
  let spinner = { gain: 0, freq: 0 };
  let slots = 0;
  if (scene.solo !== 'city') {
    const graph = mountCityGraph(ctx, master, VOICE_CAP.medium);
    slots = graph.slots.length;
    placeListener(ctx);
    dress(graph, scene, law);
    spinner = placeSpinner(graph, scene, law);
  }
  const audio = await ctx.startRendering();
  const metrics = analyze(audio);
  const loopPeriod = scene.loopAt ?? (scene.seconds >= 7 ? 6 : 0);
  const loop6 = loopPeriod > 0 ? loopScore(audio, loopPeriod) : null;
  const loopNear = loopPeriod > 0 ? peakNear(audio, loopPeriod, 0.8) : null;
  const file: MeasureFile = {
    id: scene.id,
    law,
    ...metrics,
    gains,
    spinner,
    slots,
    loop6,
    loopNear,
    steadyDb: steadyDb(audio),
    thumpDb: thumpDb(audio),
    rateError,
    seconds,
  };
  if (scene.save && (law === 'r2' || scene.id === 'dry-afternoon' || scene.id === 'city-loop')) {
    file.wav = bytesToBase64(encodeWav(audio));
  }
  return file;
}

function dress(graph: CityGraph, scene: Scene, _law: 'r2' | 'legacy'): void {
  applyCityMix(graph, scene);
}

function placeSpinner(graph: CityGraph, scene: Scene, law: 'r2' | 'legacy'): { gain: number; freq: number } {
  if (law === 'r2') {
    const voice = spinnerVoice(scene.spinner ?? null, scene.interior, !!scene.flying);
    if (voice.onListener) setPos(graph.spinnerPan, 0, 1.7, 0);
    else if (scene.spinner) setPos(graph.spinnerPan, scene.spinner.dist, scene.alt, 0);
    graph.spinner.gain.value = voice.gain;
    graph.spinnerFilter.frequency.value = voice.freq;
    return { gain: round3(voice.gain), freq: Math.round(voice.freq) };
  }
  if (!scene.spinner) {
    graph.spinner.gain.value = 0;
    return { gain: 0, freq: 0 };
  }
  const reach = scene.spinner.heavy ? 950 : 700;
  const u = 1 - scene.spinner.dist / reach;
  const level = u * u * (scene.spinner.heavy ? 0.2 : 0.16);
  setPos(graph.spinnerPan, scene.spinner.dist, scene.alt, 0);
  graph.spinner.gain.value = level;
  const doppler = Math.max(0.75, Math.min(1.3, 1 + (scene.spinner.closing ?? 0) / 340));
  const freq = ((scene.spinner.heavy ? 90 : 180) + u * (scene.spinner.heavy ? 420 : 900)) * doppler;
  graph.spinnerFilter.frequency.value = freq;
  return { gain: round3(level), freq: Math.round(freq) };
}

function placeListener(ctx: BaseAudioContext): void {
  const ear = ctx.listener;
  if (!ear.positionX || !ear.forwardX || !ear.upX) return;
  ear.positionX.value = 0;
  ear.positionY.value = 1.7;
  ear.positionZ.value = 0;
  ear.forwardX.value = 0;
  ear.forwardY.value = 0;
  ear.forwardZ.value = -1;
  ear.upX.value = 0;
  ear.upY.value = 1;
  ear.upZ.value = 0;
}

interface LegacyGains {
  rain: number; patter: number; lfo: number; city: number; wind: number; hum: number;
  mach: number; tone: number; surf: number; impact: number; tire: number; rumble: number;
  room: number; muffleHz: number;
}

function legacyTargets(scene: Scene): LegacyGains {
  const m = clamp01(scene.interior);
  const street = Math.max(0.15, 1 - scene.alt / 400);
  const rain = scene.rain;
  const patter = rain * 0.25 * street * (1 - 0.72 * m);
  const mach = (scene.machinery ?? 0) * (1 - 0.55 * m);
  const surf = (scene.surf ?? 0) * (1 - 0.45 * m);
  const traffic = scene.traffic * (1 - 0.62 * m);
  const solo = scene.solo === 'city';
  return {
    rain: solo ? 0 : rain * 0.32 * (1 - 0.58 * m),
    patter: solo ? 0 : patter,
    lfo: solo ? 0 : 0.25,
    city: solo ? (scene.cityGain ?? 0.479) : (0.18 + 0.3 * street) * (1 - 0.5 * m),
    wind: solo ? 0 : Math.min(0.55, 0.03 + scene.wind * 0.02 + (scene.snow ?? 0) * 0.08 + (1 - street) * 0.12 + (scene.crest ?? 0) * 0.16) * (1 - 0.35 * m),
    hum: solo ? 0 : (scene.hum ?? 0) * 0.016,
    mach: solo ? 0 : mach * 0.04 * 0.89,
    tone: solo ? 0 : mach * 0.01,
    surf: solo ? 0 : surf * 0.075,
    impact: solo ? 0 : surf * (scene.surfImpact ?? 0) * 0.17,
    tire: solo ? 0 : traffic * 0.028,
    rumble: solo ? 0 : traffic * 0.018,
    room: solo ? 0 : m * 0.02,
    muffleHz: solo ? 14000 : Math.max(280, 15000 - m * 14720),
  };
}

function mountLegacy(ctx: BaseAudioContext, g: LegacyGains): { master: GainNode } {
  const master = ctx.createGain();
  master.gain.value = 0.8;
  const muffle = ctx.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = g.muffleHz;
  muffle.Q.value = 0.35;
  master.connect(muffle).connect(ctx.destination);
  const link = (
    kind: 'white' | 'brown', seconds: number, type: BiquadFilterType, freq: number, q: number, gain: number, lfo = 0,
  ) => {
    const src = loopNoise(ctx, kind, seconds);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    if (q > 0) filter.Q.value = q;
    const node = ctx.createGain();
    node.gain.value = gain;
    src.connect(filter).connect(node).connect(master);
    if (lfo > 0) {
      const osc = ctx.createOscillator();
      osc.frequency.value = 13;
      const depth = ctx.createGain();
      depth.gain.value = lfo;
      osc.connect(depth).connect(node.gain);
      osc.start(ctx.currentTime);
    }
  };
  const rain = loopNoise(ctx, 'white', 4);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900;
  const rainLp = ctx.createBiquadFilter();
  rainLp.type = 'lowpass';
  rainLp.frequency.value = 7000;
  const rg = ctx.createGain();
  rg.gain.value = g.rain;
  rain.connect(hp).connect(rainLp).connect(rg).connect(master);
  link('white', 3, 'bandpass', 2500, 0.6, g.patter, g.lfo);
  link('brown', 6, 'lowpass', 260, 0, g.city);
  const hum = ctx.createOscillator();
  hum.type = 'sine';
  hum.frequency.value = 74;
  const humLp = ctx.createBiquadFilter();
  humLp.type = 'lowpass';
  humLp.frequency.value = 160;
  const humG = ctx.createGain();
  humG.gain.value = g.hum;
  hum.connect(humLp).connect(humG).connect(master);
  hum.start(ctx.currentTime);
  link('brown', 8, 'lowpass', 95, 0, g.mach);
  const tone = ctx.createOscillator();
  tone.type = 'sine';
  tone.frequency.value = 41;
  const toneG = ctx.createGain();
  toneG.gain.value = g.tone;
  tone.connect(toneG).connect(master);
  tone.start(ctx.currentTime);
  link('brown', 5, 'bandpass', 500, 0.4, g.wind);
  link('brown', 6, 'lowpass', 420, 0, g.surf);
  link('white', 2, 'bandpass', 180, 0.7, g.impact);
  link('white', 3, 'bandpass', 700, 0.7, g.tire);
  link('brown', 5, 'lowpass', 140, 0, g.rumble);
  link('brown', 4, 'lowpass', 220, 0, g.room);
  return { master };
}

function loopNoise(ctx: BaseAudioContext, kind: 'white' | 'brown', seconds: number): AudioBufferSourceNode {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start(ctx.currentTime);
  return src;
}

function pack(g: { rain: number; patter: number; lfo: number; city: number; wind: number; hum: number; room: number; muffleHz: number }): Record<string, number> {
  return {
    rain: round3(g.rain), patter: round3(g.patter), lfo: round3(g.lfo), city: round3(g.city),
    wind: round3(g.wind), hum: round3(g.hum), room: round3(g.room), muffleHz: Math.round(g.muffleHz),
  };
}

function failed(scene: Scene, law: 'r2' | 'legacy', err: unknown): MeasureFile {
  return {
    id: scene.id, law, peak: 0, rms: 0, peakDb: -120, rmsDb: -120, clips: 0, bands: {},
    gains: {}, spinner: { gain: 0, freq: 0 }, slots: 0, loop6: null, loopNear: null,
    steadyDb: 0, thumpDb: 0, rateError: '', seconds: scene.seconds,
    error: err instanceof Error ? err.message : String(err),
  };
}

async function resumeSmoke(): Promise<Record<string, string>> {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return { error: 'no AudioContext' };
  const ctx = new AC();
  const constructed = ctx.state;
  await ctx.resume();
  const resumed = ctx.state;
  await ctx.suspend();
  const suspended = ctx.state;
  await ctx.resume();
  const again = ctx.state;
  await ctx.close();
  return { constructed, resumed, suspended, again };
}

function db(v: number): number {
  return v > 1e-8 ? Math.round(20 * Math.log10(v) * 10) / 10 : -120;
}

function analyze(audio: AudioBuffer): { peak: number; rms: number; peakDb: number; rmsDb: number; clips: number; bands: Record<string, number> } {
  const ch0 = audio.getChannelData(0);
  const ch1 = audio.numberOfChannels > 1 ? audio.getChannelData(1) : ch0;
  const n = ch0.length;
  let peak = 0;
  let sum = 0;
  let clips = 0;
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.abs(ch0[i]!);
    const b = Math.abs(ch1[i]!);
    const m = a > b ? a : b;
    if (m > peak) peak = m;
    const s = 0.5 * (ch0[i]! + ch1[i]!);
    mono[i] = s;
    sum += s * s;
    if (m >= 0.999) clips++;
  }
  const rms = Math.sqrt(sum / Math.max(1, n));
  return {
    peak: Math.round(peak * 1000) / 1000,
    rms: Math.round(rms * 1000) / 1000,
    peakDb: db(peak),
    rmsDb: db(rms),
    clips,
    bands: bandEnergy(mono, audio.sampleRate),
  };
}

function bandEnergy(x: Float32Array, sr: number): Record<string, number> {
  const specs = [80, 250, 2000, 8000];
  const energies = specs.map((fc) => rmsOf(onePole(x, sr, fc)));
  const total = rmsOf(x);
  const names = ['sub', 'low', 'mid', 'high', 'air'];
  const edges = [0, ...energies, total];
  const out: Record<string, number> = {};
  let prev = 0;
  const sq = edges.map((v) => v * v);
  for (let i = 0; i < names.length; i++) {
    const e = Math.max(0, sq[i + 1]! - prev);
    prev = sq[i + 1]!;
    out[names[i]!] = db(Math.sqrt(e));
  }
  out.full = db(total);
  return out;
}

function onePole(x: Float32Array, sr: number, fc: number): Float32Array {
  const a = Math.exp((-2 * Math.PI * fc) / sr);
  const y = new Float32Array(x.length);
  let s = 0;
  const b = 1 - a;
  for (let i = 0; i < x.length; i++) {
    s = b * x[i]! + a * s;
    y[i] = s;
  }
  return y;
}

function rmsOf(x: Float32Array): number {
  let s = 0;
  const hop = x.length > 200000 ? 2 : 1;
  let n = 0;
  for (let i = 0; i < x.length; i += hop) {
    s += x[i]! * x[i]!;
    n++;
  }
  return Math.sqrt(s / Math.max(1, n));
}

function corrAt(x: Float32Array, lag: number): number {
  let s = 0;
  let a = 0;
  let b = 0;
  const hop = 4;
  for (let i = 0; i + lag < x.length; i += hop) {
    const u = x[i]!;
    const v = x[i + lag]!;
    s += u * v;
    a += u * u;
    b += v * v;
  }
  return s / Math.sqrt(Math.max(1e-12, a * b));
}

function loopScore(audio: AudioBuffer, period: number): { at: number; beside: number; excess: number } | null {
  const x = audio.getChannelData(0);
  const sr = audio.sampleRate;
  const lag = Math.round(period * sr);
  if (lag + 8 >= x.length) return null;
  const at = corrAt(x, lag);
  const beside = corrAt(x, lag + Math.round(0.07 * sr));
  return {
    at: Math.round(at * 1000) / 1000,
    beside: Math.round(beside * 1000) / 1000,
    excess: Math.round((at - beside) * 1000) / 1000,
  };
}

function peakNear(audio: AudioBuffer, center: number, span: number): { lag: number; excess: number } | null {
  const x = audio.getChannelData(0);
  const sr = audio.sampleRate;
  const step = Math.round(0.02 * sr);
  const besideLag = Math.round(0.07 * sr);
  let bestLag = center;
  let best = -2;
  for (let lag = Math.round((center - span) * sr); lag <= (center + span) * sr; lag += step) {
    if (lag < sr || lag + besideLag + 8 >= x.length) continue;
    const excess = corrAt(x, lag) - corrAt(x, lag + besideLag);
    if (excess > best) {
      best = excess;
      bestLag = lag / sr;
    }
  }
  if (best < -1) return null;
  return { lag: Math.round(bestLag * 1000) / 1000, excess: Math.round(best * 1000) / 1000 };
}

function steadyDb(audio: AudioBuffer): number {
  const x = audio.getChannelData(0);
  const n = Math.floor(x.length / 3);
  if (n < 8) return 0;
  const rms = (from: number) => {
    let s = 0;
    for (let i = from; i < from + n; i += 2) s += x[i]! * x[i]!;
    return Math.sqrt(s / (n / 2));
  };
  const a = rms(0);
  const b = rms(x.length - n);
  if (a < 1e-8 || b < 1e-8) return -120;
  return Math.round(Math.abs(20 * Math.log10(a / b)) * 10) / 10;
}

function thumpDb(audio: AudioBuffer): number {
  const x = audio.getChannelData(0);
  const sr = audio.sampleRate;
  const win = Math.floor(sr * 0.03);
  const hop = Math.floor(sr * 0.02);
  if (win < 8 || x.length < win * 4) return 0;
  let max = 0;
  let sum = 0;
  let n = 0;
  for (let i = win; i + win < x.length; i += hop) {
    let s = 0;
    for (let k = -win; k < win; k += 2) s += x[i + k]! * x[i + k]!;
    const r = Math.sqrt(s / win);
    if (r > max) max = r;
    sum += r;
    n++;
  }
  const mean = sum / Math.max(1, n);
  if (mean < 1e-8) return 0;
  return Math.round(20 * Math.log10(max / mean) * 10) / 10;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
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

const R7_SCENES: Scene[] = [
  { id: 'downpour-market', district: 'little-tokyo-market', rain: 1, wind: 8, alt: 1.7, interior: 0, night: 1, presence: 1, traffic: 0.2, inMarket: true, awningNear: 0.8, seconds: 3, save: true },
  { id: 'market-rain', district: 'little-tokyo-market', rain: 0.85, wind: 5, alt: 1.7, interior: 0, night: 1, presence: 1, traffic: 0.35, inMarket: true, awningNear: 0.8, seconds: 3, save: true },
  { id: 'broadway-rain', district: 'historic-core', rain: 0.7, wind: 5, alt: 1.7, interior: 0, night: 1, presence: 0.72, traffic: 0.45, awningNear: 0.15, seconds: 3, save: true },
  { id: 'broadway-pa', district: 'historic-core', rain: 0, wind: 0, alt: 1.7, interior: 0, night: 1, presence: 0.72, traffic: 0, seconds: 8, solo: 'pa', loopAt: 4, save: true },
  { id: 'harbor-night', district: 'harbor', rain: 0.65, wind: 5, alt: 6, interior: 0, night: 1, presence: 0.02, traffic: 0.2, hornEnv: 1, seconds: 3, save: true },
  { id: 'harbor-day', district: 'harbor', rain: 0.65, wind: 5, alt: 6, interior: 0, night: 0, presence: 0.02, traffic: 0.2, hornEnv: 1, seconds: 3, save: true },
  { id: 'seawall', district: 'coastal-strip', rain: 0.65, wind: 5, alt: 2, interior: 0, night: 1, presence: 0, traffic: 0, surf: 0.9, surfImpact: 0.45, seconds: 3, save: true },
  { id: 'basin-rain', district: 'basin-sprawl', rain: 0.65, wind: 5, alt: 1.7, interior: 0, night: 1, presence: 0.07, traffic: 0.2, seconds: 3, save: true },
  { id: 'basin-dry', district: 'basin-sprawl', rain: 0, wind: 2, alt: 1.7, interior: 0, night: 0, presence: 0.07, traffic: 0.2, seconds: 3 },
  { id: 'lakewood-rain', district: 'lakewood-megablocks', rain: 0.65, wind: 5, alt: 1.7, interior: 0, night: 1, presence: 0.12, traffic: 0.15, seconds: 3, save: true },
  { id: 'coast-dry', district: 'coastal-strip', rain: 0, wind: 4, alt: 2, interior: 0, night: 1, presence: 0, traffic: 0, surf: 0.9, surfImpact: 0.3, seconds: 3 },
  { id: 'lax-launch', district: 'lax-spaceport', rain: 0, wind: 3, alt: 1.7, interior: 0, night: 1, presence: 0, traffic: 0.05, machinery: 0.85, seconds: 3, save: true },
  { id: 'lax-dry', district: 'lax-spaceport', rain: 0, wind: 3, alt: 1.7, interior: 0, night: 1, presence: 0, traffic: 0.05, machinery: 0, seconds: 3 },
  { id: 'wallace-street', district: 'wallace-vernon', rain: 0, wind: 3, alt: 1.7, interior: 0, night: 1, presence: 0, traffic: 0, machinery: 0.82, seconds: 3, save: true },
  { id: 'wallace-dry', district: 'wallace-vernon', rain: 0, wind: 3, alt: 1.7, interior: 0, night: 1, presence: 0, traffic: 0, machinery: 0, seconds: 3 },
  { id: 'wallace-rain', district: 'wallace-vernon', rain: 0.65, wind: 5, alt: 1.7, interior: 0, night: 1, presence: 0, traffic: 0, machinery: 0.82, seconds: 3, save: true },
  { id: 'k-apartment', district: 'k-megablock', rain: 0.65, wind: 5, alt: 1.7, interior: 0.88, hum: 0.45, night: 1, presence: 0.12, traffic: 0, seconds: 3, save: true },
];

export async function measureR7(): Promise<{
  checks: Record<string, number | boolean | string>;
  causeway: Array<{ name: string; polygon: string; heard: string }>;
  files: MeasureFile[];
}> {
  const layout = new CityLayout();
  const spots = [
    { name: 'plaza', x: 4037, z: 3151 },
    { name: 'atrium', x: 4030, z: 3615 },
    { name: 'approach', x: 4031, z: 2937 },
    { name: 'basin', x: 0, z: 0 },
  ];
  const causeway = spots.map((s) => ({
    name: s.name,
    polygon: layout.districtAt(s.x, s.z).id,
    heard: heardDistrictIdSafe(layout, s.x, s.z),
  }));
  const street = ambienceTargets(blank({ rain: 0.65, altitude: 1.7 }));
  const quiet = ambienceTargets(blank({ rain: 0, altitude: 1.7, place: cityPlaceOf('basin-sprawl') }));
  const mid = retargetCrossfade(0.283, 0.203);
  const checks: Record<string, number | boolean | string> = {
    cityStreet: round3(street.city),
    cityQuiet: round3(quiet.city),
    surfCoeff: round3(ambienceTargets(blank({ surf: 1 })).surf),
    machCoeff: round3(ambienceTargets(blank({ machinery: 1 })).mach),
    toneCoeff: round3(ambienceTargets(blank({ machinery: 1 })).tone),
    voiceCap: VOICE_CAP.medium,
    crossA: round3(mid.aW),
    crossB: round3(mid.bW),
  };
  const files: MeasureFile[] = [];
  for (const scene of R7_SCENES) {
    try {
      const file = await render(scene, 'r2');
      const bed = bedOrQuiet(scene.district);
      const mix = mixTargets({
        bed,
        presence: scene.presence,
        rain: scene.rain,
        alt: scene.alt,
        interior: scene.interior,
        night: scene.night,
        traffic: scene.traffic,
        hornEnv: scene.hornEnv ?? 0,
        awningNear: scene.awningNear ?? 0.1,
        inMarket: !!scene.inMarket,
      });
      file.gains = {
        ...file.gains,
        drone: round3(mix.drone),
        pa: round3(mix.pa),
        horn: round3(mix.horn),
        awning: round3(mix.awning),
        industrial: round3(mix.industrial),
      };
      files.push(file);
    } catch (err) {
      files.push(failed(scene, 'r2', err));
    }
  }
  return { checks, causeway, files };
}

function heardDistrictIdSafe(layout: CityLayout, x: number, z: number): string {
  return heardDistrictId(layout, x, z);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    let part = '';
    const end = Math.min(bytes.length, i + chunk);
    for (let j = i; j < end; j++) part += String.fromCharCode(bytes[j]!);
    bin += part;
  }
  return btoa(bin);
}
