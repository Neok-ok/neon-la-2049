// Procedural ambience (no music, no samples): rain hiss + patter, distant city rumble, wind.
// Starts on the first user gesture (required by iOS Safari). A later tap resumes a
// context that iOS suspended or interrupted while the phone was locked.
import { scheduleParam } from './param';
import { audioPrefs, writeAudioPrefs } from './prefs';

let activeBus: Ambience | null = null;

/**
 * City-bed duck at full interior. 0.84 is the room law. If K's apartment
 * measures louder than −32 dBFS, take this to 0.90; if quieter than −36, ease it.
 */
export const CITY_DUCK = 0.84;

/** The one ambience the toolbar slider talks to. */
export function activeAmbience(): Ambience | null {
  return activeBus;
}

/**
 * A gesture may resume `suspended` or `interrupted`. Coming back to a visible
 * tab only retries `suspended`: iOS rejects `resume()` from `visibilitychange`
 * while the context is interrupted, and that path is not the unlock.
 */
export function shouldResume(state: string, fromVisibility: boolean): boolean {
  if (fromVisibility) return state === 'suspended';
  return state === 'suspended' || state === 'interrupted';
}

export interface BedInput {
  rain: number;
  snow: number;
  wind: number;
  altitude: number;
  aboveClouds: number;
  interior: number;
  hum: number;
  machinery: number;
  surf: number;
  surfImpact: number;
  crest: number;
  traffic: number;
  /**
   * 0..1 weight on the shared city rumble. Loud districts stay at 1.
   * Quiet districts (coast, basin, Lakewood, Wallace) pass a smaller weight.
   */
  place?: number;
}

export interface BedTargets {
  rain: number;
  patter: number;
  /** Depth of the existing 13 Hz patter LFO. 0 when the patter target is 0. */
  lfo: number;
  city: number;
  wind: number;
  hum: number;
  /** Machinery noise before the slow level wobble. */
  mach: number;
  tone: number;
  surf: number;
  impact: number;
  tire: number;
  rumble: number;
  room: number;
  muffleHz: number;
}

/** Settled bed gains. The frame loop and the offline renders share this. */
export function ambienceTargets(p: BedInput): BedTargets {
  const m = clamp01(p.interior);
  const street = Math.max(0.15, 1 - p.altitude / 400);
  // Full below 30 m, gone at 520 m. The straight ramp left a 220 m cruise
  // 0.3 dB short of a 6 dB high-band drop, so the middle of the ramp is steeper.
  const altLinear = p.altitude < 30 ? 1 : p.altitude < 520 ? (520 - p.altitude) / 490 : 0;
  const altClose = altLinear ** 1.25;
  const sky = clamp01(p.aboveClouds) * altClose;
  const rain = p.rain;
  const patter = rain * 0.18 * street * sky * (1 - 0.72 * m);
  const mach = p.machinery * (1 - 0.55 * m);
  const surf = p.surf * (1 - 0.45 * m);
  const traffic = p.traffic * (1 - 0.62 * m);
  const muffleHz = Math.max(280, 14000 * (260 / 14000) ** m);
  // The city bed is already lowpassed at 260 Hz, so 419 Hz vs 577 Hz does not
  // move RMS, and the apartment hum then outranks the court. While the room
  // is still open between those cutoffs and about 1.6 kHz, keep a slit of city.
  const slit = clamp01((muffleHz - 420) / 280) * clamp01((1600 - muffleHz) / 500);
  const place = clamp01(p.place ?? 1);
  // Street city is 0.34 on the ground (`0.12 + 0.22`). The trial at ~0.10
  // measured about −38 dB and lost the low end, so this is the floor to keep.
  const city = (0.12 + 0.22 * street) * (1 - CITY_DUCK * m) * (1 + 0.85 * slit) * place;
  return {
    rain: rain * 0.22 * sky * (1 - 0.58 * m),
    patter,
    lfo: 0.45 * patter,
    city,
    wind: Math.min(0.55, 0.03 + p.wind * 0.02 + p.snow * 0.08 + (1 - street) * 0.12 + p.crest * 0.16) * (1 - 0.35 * m),
    hum: p.hum * 0.05,
    mach: mach * 0.22,
    tone: mach * 0.06,
    surf: surf * 0.22,
    impact: surf * p.surfImpact * 0.17,
    tire: traffic * 0.028,
    rumble: traffic * 0.018,
    room: m * (0.04 + 0.05 * rain),
    muffleHz,
  };
}

/**
 * A few percent either side of 1, on periods that are not 6 s, so the city
 * bed does not lock to the buffer length. Applied to the existing source.
 */
export function cityPlayback(time: number): number {
  const a = Math.sin((2 * Math.PI * time) / 2.7);
  const b = Math.sin((2 * Math.PI * time) / 5.3);
  return 1 + 0.018 * a + 0.014 * b;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class Ambience {
  private ctx: AudioContext | null = null;
  private rainGain!: GainNode;
  private patterGain!: GainNode;
  private lfoDepth: GainNode | null = null;
  private cityGain!: GainNode;
  private cityRate: AudioParam | null = null;
  private cityRateUntil = 0;
  private cityRateError = '';
  private windGain!: GainNode;
  private master!: GainNode;
  private muffleFilter: BiquadFilterNode | null = null;
  private humGain: GainNode | null = null;
  private machGain: GainNode | null = null;
  private machTone: GainNode | null = null;
  /** 0 on the street, 1 fully inside. Low-passes the whole bed, including market layers on `output`. */
  private interior = 0;
  /** 0..1 quiet sine, one oscillator, used by interiors that ask for it. */
  private hum = 0;
  /** 0..1 low industrial bed. Wallace precinct sets this near the ground. */
  private machinery = 0;
  private surfGain: GainNode | null = null;
  private impactGain: GainNode | null = null;
  private thunderGain: GainNode | null = null;
  /** 0..1 wash under the wall. Stored before the audio context exists. */
  private surfAmount = 0;
  /** 0..1 breaker transient, same clock as the visible swell. */
  private surfImpact = 0;
  /** 0..1 extra wind while the listener is on the crest. */
  private crestWind = 0;
  /** 0..1 tyre hiss and low traffic rumble. Stored before the audio context exists. */
  private traffic = 0;
  /** District weight on the shared city rumble. 1 until CitySound names a place. */
  private cityPlace = 1;
  private tireGain: GainNode | null = null;
  private rumbleGain: GainNode | null = null;
  private roomGain: GainNode | null = null;
  /** Master level before mute. Remembered in localStorage. */
  private volume = audioPrefs.volume;
  /** Photo mode ducks the bus without writing the saved volume. */
  private duck = 1;
  private resumeArmed = false;
  private rainLevel = 0;
  private windLevel = 0;
  private altLevel = 0;
  muted = audioPrefs.muted;

  constructor(register = true) {
    if (register) activeBus = this;
  }

  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    void ctx.resume();
    this.build(ctx);
    this.armResume();
  }

  /** Same bed on an OfflineAudioContext. Does not resume and does not arm a gesture. */
  mountOffline(ctx: BaseAudioContext): void {
    if (this.ctx) return;
    this.ctx = ctx as AudioContext;
    this.build(ctx);
  }

  /** Pin the master for an offline render. Does not write `nla.audio`. */
  pinMaster(volume = 0.8): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.muted = false;
    this.duck = 1;
    if (this.master) this.master.gain.value = this.masterLevel();
  }

  private build(ctx: BaseAudioContext): void {
    this.master = ctx.createGain();
    this.master.gain.value = this.masterLevel();
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 14000;
    muffle.Q.value = 0.35;
    this.muffleFilter = muffle;
    this.master.connect(muffle);
    muffle.connect(ctx.destination);

    const noise = (kind: 'white' | 'brown', seconds = 4, seam = false) => {
      const src = makeNoise(ctx, kind, seconds, seam);
      if (seam) {
        this.cityRate = src.playbackRate;
        this.pushCityRate(ctx.currentTime, 20);
      }
      return src;
    };

    // rain hiss
    const rain = noise('white');
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rain.connect(hp).connect(lp).connect(this.rainGain).connect(this.master);

    // heavier drops / patter on surfaces. The 13 Hz depth follows the patter target.
    const patter = noise('white', 3);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2500;
    bp.Q.value = 0.6;
    this.patterGain = ctx.createGain();
    this.patterGain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0;
    this.lfoDepth = lfoGain;
    lfo.connect(lfoGain).connect(this.patterGain.gain);
    lfo.start(ctx.currentTime);
    patter.connect(bp).connect(this.patterGain).connect(this.master);

    // city rumble (traffic, machinery, distant spinners). 6 s, seamless at the joint.
    const city = noise('brown', 6, true);
    const clp = ctx.createBiquadFilter();
    clp.type = 'lowpass';
    clp.frequency.value = 260;
    this.cityGain = ctx.createGain();
    this.cityGain.gain.value = 0.35;
    city.connect(clp).connect(this.cityGain).connect(this.master);

    // one quiet hum for interiors that request it. Not music: a single sine under the bed.
    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 74;
    const humLp = ctx.createBiquadFilter();
    humLp.type = 'lowpass';
    humLp.frequency.value = 160;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    hum.connect(humLp).connect(this.humGain).connect(this.master);
    hum.start(ctx.currentTime);

    // Low industrial bed: filtered noise plus a slow 41 Hz tone. Not music.
    const mach = noise('brown', 8);
    const machLp = ctx.createBiquadFilter();
    machLp.type = 'lowpass';
    machLp.frequency.value = 95;
    this.machGain = ctx.createGain();
    this.machGain.gain.value = 0;
    mach.connect(machLp).connect(this.machGain).connect(this.master);
    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.value = 41;
    this.machTone = ctx.createGain();
    this.machTone.gain.value = 0;
    tone.connect(this.machTone).connect(this.master);
    tone.start(ctx.currentTime);

    // wind
    const wind = noise('brown', 5);
    const wbp = ctx.createBiquadFilter();
    wbp.type = 'bandpass';
    wbp.frequency.value = 500;
    wbp.Q.value = 0.4;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    wind.connect(wbp).connect(this.windGain).connect(this.master);

    const wash = noise('brown', 6);
    const surfHp = ctx.createBiquadFilter();
    surfHp.type = 'highpass';
    surfHp.frequency.value = 80;
    const surfLp = ctx.createBiquadFilter();
    surfLp.type = 'lowpass';
    surfLp.frequency.value = 420;
    this.surfGain = ctx.createGain();
    this.surfGain.gain.value = 0;
    wash.connect(surfHp).connect(surfLp).connect(this.surfGain).connect(this.master);
    const hit = noise('white', 2);
    const surfBp = ctx.createBiquadFilter();
    surfBp.type = 'bandpass';
    surfBp.frequency.value = 180;
    surfBp.Q.value = 0.7;
    this.impactGain = ctx.createGain();
    this.impactGain.gain.value = 0;
    hit.connect(surfBp).connect(this.impactGain).connect(this.master);

    // Distant thunder. Gain stays at zero until a coastal flash cues it.
    // It does not move the rain, surf, or city gains.
    const thunder = noise('brown', 3);
    const thunderLp = ctx.createBiquadFilter();
    thunderLp.type = 'lowpass';
    thunderLp.frequency.value = 140;
    this.thunderGain = ctx.createGain();
    this.thunderGain.gain.value = 0;
    thunder.connect(thunderLp).connect(this.thunderGain).connect(this.master);

    // Tyre hiss and a low rumble. Noise only, no tones.
    const tire = noise('white', 3);
    const tireBp = ctx.createBiquadFilter();
    tireBp.type = 'bandpass';
    tireBp.frequency.value = 700;
    tireBp.Q.value = 0.7;
    this.tireGain = ctx.createGain();
    this.tireGain.gain.value = 0;
    tire.connect(tireBp).connect(this.tireGain).connect(this.master);
    const rumble = noise('brown', 5);
    const rumbleLp = ctx.createBiquadFilter();
    rumbleLp.type = 'lowpass';
    rumbleLp.frequency.value = 140;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    rumble.connect(rumbleLp).connect(this.rumbleGain).connect(this.master);

    // Quiet room air. It sits on the master so mute still cuts it, and the interior
    // low-pass takes the street off the top while this stays a low bed.
    const room = noise('brown', 4);
    const roomLp = ctx.createBiquadFilter();
    roomLp.type = 'lowpass';
    roomLp.frequency.value = 220;
    this.roomGain = ctx.createGain();
    this.roomGain.gain.value = 0;
    room.connect(roomLp).connect(this.roomGain).connect(this.master);
  }

  /** Extend the city source's rate curve. One existing AudioParam, no new node. */
  private pushCityRate(time: number, horizon = 16): void {
    const param = this.cityRate;
    if (!param) return;
    const start = Math.max(time, this.cityRateUntil);
    const step = 0.5;
    const n = Math.round(horizon / step);
    try {
      param.cancelScheduledValues(start);
      param.setValueAtTime(cityPlayback(start), start);
      for (let i = 1; i <= n; i++) {
        const at = start + i * step;
        param.linearRampToValueAtTime(cityPlayback(at), at);
      }
      this.cityRateUntil = start + n * step;
      this.cityRateError = '';
    } catch (err) {
      this.cityRateError = err instanceof Error ? err.message : String(err);
      this.cityRateUntil = time + 4;
    }
  }

  /** iOS drops a running context when the phone locks. The next gesture resumes it. */
  private armResume(): void {
    if (this.resumeArmed) return;
    this.resumeArmed = true;
    const kick = (fromVisibility: boolean) => {
      const ctx = this.ctx;
      if (!ctx) return;
      if (shouldResume(ctx.state, fromVisibility)) void ctx.resume();
    };
    document.addEventListener('pointerdown', () => kick(false));
    document.addEventListener('touchend', () => kick(false));
    document.addEventListener('keydown', () => kick(false));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') kick(true);
    });
  }

  private masterLevel(): number {
    return this.muted || this.volume <= 0.001 ? 0 : this.volume * this.duck;
  }

  /** 0..1 multiplier on the master. Not stored in `nla.audio`. */
  setDuck(v: number): void {
    this.duck = Math.max(0, Math.min(1, v));
    this.applyMaster();
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Master bus. Market layers connect here so mute applies to them too. */
  get output(): GainNode | null {
    return this.ctx ? this.master : null;
  }

  /** Empty when the city-rate curve scheduled. Offline renders read this. */
  get rateError(): string {
    return this.cityRateError;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    audioPrefs.muted = m;
    writeAudioPrefs();
    this.applyMaster();
  }

  /** 0..1. Remembered with the mute flag. */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    audioPrefs.volume = this.volume;
    writeAudioPrefs();
    this.applyMaster();
  }

  get volumeLevel(): number {
    return this.volume;
  }

  private applyMaster(): void {
    if (!this.master || !this.ctx) return;
    scheduleParam(this.master.gain, this.masterLevel(), this.ctx.currentTime, 0.04, 'master');
  }

  get interiorAmount(): number {
    return this.interior;
  }

  get trafficAmount(): number {
    return this.traffic;
  }

  /** Shared beds that are actually sounding: rain, city, wind, traffic, surf, machinery, room. */
  bedVoices(): number {
    let n = 0;
    const street = Math.max(0.15, 1 - this.altLevel / 400);
    if (this.rainLevel > 0.05) n += 2;
    if ((0.12 + 0.22 * street) * this.cityPlace > 0.05) n += 1;
    if (this.windLevel > 0.02 || this.crestWind > 0.05) n += 1;
    if (this.machinery > 0.05) n += 1;
    if (this.traffic > 0.05) n += 1;
    if (this.surfAmount > 0.05) n += 1;
    if (this.hum > 0.05 && this.interior > 0.2) n += 1;
    if (this.interior > 0.45) n += 1;
    return n;
  }

  /** 0..1. Stored even before the audio context exists. */
  setInterior(amount: number): void {
    this.interior = Math.max(0, Math.min(1, amount));
  }

  /** 0..1. Same oscillator for every interior. Gain stays near zero. */
  setHum(amount: number): void {
    this.hum = Math.max(0, Math.min(1, amount));
  }

  /** 0..1. Precinct machinery. Stored before the audio context exists. */
  setMachinery(amount: number): void {
    this.machinery = Math.max(0, Math.min(1, amount));
  }

  /** 0..1 nearby traffic. Stored before the audio context exists. */
  setTraffic(amount: number): void {
    this.traffic = Math.max(0, Math.min(1, amount));
  }

  /** 0..1. How much of the shared city rumble this district keeps. Not saved. */
  setCityPlace(amount: number): void {
    this.cityPlace = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 1;
  }

  /**
   * One distant crack on the master bus, `delay` seconds after the flash.
   * Silent until a strike. Does not retune the other beds.
   */
  cueThunder(delay: number, amount: number): void {
    const g = this.thunderGain;
    const ctx = this.ctx;
    if (!g || !ctx) return;
    const t = ctx.currentTime + Math.max(0, delay);
    const a = Math.max(0.0001, Math.min(0.2, amount));
    const p = g.gain;
    try {
      p.cancelScheduledValues(t);
      p.setValueAtTime(0.0001, t);
      p.exponentialRampToValueAtTime(a, t + 0.06);
      p.exponentialRampToValueAtTime(0.0001, t + 1.7);
    } catch {
      // A clock that is already past `t` rejects the ramp. The next strike still cues.
    }
  }

  /** 0..1 wash, 0..1 impact, 0..1 crest wind. Stored before the audio context exists. */
  setSurf(amount: number, impact: number, crest: number): void {
    this.surfAmount = Math.max(0, Math.min(1, amount));
    this.surfImpact = Math.max(0, Math.min(1, impact));
    this.crestWind = Math.max(0, Math.min(1, crest));
  }

  /** Write settled gains immediately. Offline renders use this; the frame loop uses `update`. */
  prime(rain: number, snow: number, wind: number, altitude: number, aboveClouds = 1): BedTargets {
    this.rainLevel = rain;
    this.windLevel = wind;
    this.altLevel = altitude;
    const g = ambienceTargets(this.levels(rain, snow, wind, altitude, aboveClouds));
    this.writeBed(g, null, 0.89);
    return g;
  }

  /** Park the city source at a fixed rate. The live bed does not call this. */
  holdCityRate(rate = 1): void {
    const param = this.cityRate;
    if (!param || !this.ctx) return;
    const t = this.ctx.currentTime;
    try {
      param.cancelScheduledValues(t);
      param.setValueAtTime(rate, t);
      this.cityRateUntil = t + 3600;
      this.cityRateError = '';
    } catch (err) {
      this.cityRateError = err instanceof Error ? err.message : String(err);
    }
  }

  /** City rumble alone, at a fixed gain, for the loop measurement. */
  soloCity(gain: number): void {
    this.writeBed({
      rain: 0, patter: 0, lfo: 0, city: gain, wind: 0, hum: 0,
      mach: 0, tone: 0, surf: 0, impact: 0, tire: 0, rumble: 0, room: 0,
      muffleHz: 14000,
    }, null, 1);
  }

  /** altitude in meters above ground: street-level sounds fade when flying high. */
  update(rain: number, snow: number, wind: number, altitude: number, aboveClouds = 1): void {
    this.rainLevel = rain;
    this.windLevel = wind;
    this.altLevel = altitude;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const wobble = 0.78 + 0.22 * Math.sin(t * 0.7);
    this.writeBed(ambienceTargets(this.levels(rain, snow, wind, altitude, aboveClouds)), t, wobble);
    if (this.cityRate && t + 4 >= this.cityRateUntil) this.pushCityRate(t);
  }

  private levels(rain: number, snow: number, wind: number, altitude: number, aboveClouds: number): BedInput {
    return {
      rain, snow, wind, altitude, aboveClouds,
      interior: this.interior,
      hum: this.hum,
      machinery: this.machinery,
      surf: this.surfAmount,
      surfImpact: this.surfImpact,
      crest: this.crestWind,
      traffic: this.traffic,
      place: this.cityPlace,
    };
  }

  private writeBed(g: BedTargets, time: number | null, wobble: number): void {
    const set = (param: AudioParam | undefined, value: number, tc: number, name: string, epsilon = 0.001) => {
      scheduleParam(param, value, time, tc, name, epsilon);
    };
    set(this.roomGain?.gain, g.room, 0.4, 'room');
    set(this.muffleFilter?.frequency, g.muffleHz, 0.35, 'muffle', 1);
    set(this.humGain?.gain, g.hum, 0.45, 'hum');
    // First writer a non-finite camera height reaches. harborHum / southBayHum
    // fold that height into the machinery amount, and this gain is scheduled
    // before the tone. A finite 390×844 load does not hit it; the log names `mach`.
    set(this.machGain?.gain, g.mach * wobble, 0.5, 'mach');
    set(this.machTone?.gain, g.tone, 0.5, 'tone');
    set(this.surfGain?.gain, g.surf, 0.35, 'surf');
    set(this.impactGain?.gain, g.impact, 0.03, 'impact');
    set(this.tireGain?.gain, g.tire, 0.35, 'tire');
    set(this.rumbleGain?.gain, g.rumble, 0.4, 'rumble');
    set(this.rainGain?.gain, g.rain, 0.5, 'rain');
    set(this.patterGain?.gain, g.patter, 0.5, 'patter');
    set(this.lfoDepth?.gain, g.lfo, 0.5, 'lfo');
    set(this.cityGain?.gain, g.city, 0.8, 'city');
    set(this.windGain?.gain, g.wind, 0.45, 'wind');
  }
}

/**
 * Looping noise. The 6 s city bed overlap-blends an 80 ms tail back into the
 * head so the brown integrator continues across the joint. The buffer stays 6 s.
 */
function makeNoise(ctx: BaseAudioContext, kind: 'white' | 'brown', seconds: number, seam: boolean): AudioBufferSourceNode {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const fade = seam ? Math.min(Math.floor(rate * 0.08), len >> 1) : 0;
  const total = len + fade;
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const tmp = new Float32Array(total);
    let last = 0;
    for (let i = 0; i < total; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') tmp[i] = w;
      else {
        last = (last + 0.02 * w) / 1.02;
        tmp[i] = last * 3.5;
      }
    }
    const d = buf.getChannelData(ch);
    d.set(tmp.subarray(0, len));
    if (fade > 1) {
      const span = fade - 1;
      for (let i = 0; i < fade; i++) {
        const t = i / span;
        const rise = Math.sin(t * Math.PI * 0.5);
        const fall = Math.cos(t * Math.PI * 0.5);
        d[i] = (d[i] ?? 0) * rise + (tmp[len + i] ?? 0) * fall;
      }
    }
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start(ctx.currentTime);
  return src;
}
