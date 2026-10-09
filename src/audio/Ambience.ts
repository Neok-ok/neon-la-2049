// Procedural ambience (no music, no samples): rain hiss + patter, distant city rumble, wind.
// Starts on the first user gesture (required by iOS Safari).
export class Ambience {
  private ctx: AudioContext | null = null;
  private rainGain!: GainNode;
  private patterGain!: GainNode;
  private cityGain!: GainNode;
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
  /** 0..1 wash under the wall. Stored before the audio context exists. */
  private surfAmount = 0;
  /** 0..1 breaker transient, same clock as the visible swell. */
  private surfImpact = 0;
  /** 0..1 extra wind while the listener is on the crest. */
  private crestWind = 0;
  /** 0..1 tyre hiss and low traffic rumble. Stored before the audio context exists. */
  private traffic = 0;
  private tireGain: GainNode | null = null;
  private rumbleGain: GainNode | null = null;
  muted = false;

  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 14000;
    muffle.Q.value = 0.35;
    this.muffleFilter = muffle;
    this.master.connect(muffle);
    muffle.connect(ctx.destination);

    const noise = (kind: 'white' | 'brown', seconds = 4) => {
      const len = ctx.sampleRate * seconds;
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        let last = 0;
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1;
          if (kind === 'white') d[i] = w;
          else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
        }
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.start();
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

    // heavier drops / patter on surfaces
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
    lfoGain.gain.value = 0.25;
    lfo.connect(lfoGain).connect(this.patterGain.gain);
    lfo.start();
    patter.connect(bp).connect(this.patterGain).connect(this.master);

    // city rumble (traffic, machinery, distant spinners)
    const city = noise('brown', 6);
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
    hum.start();

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
    tone.start();

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
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Master bus. Market layers connect here so mute applies to them too. */
  get output(): GainNode | null {
    return this.ctx ? this.master : null;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.8;
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

  /** 0..1 wash, 0..1 impact, 0..1 crest wind. Stored before the audio context exists. */
  setSurf(amount: number, impact: number, crest: number): void {
    this.surfAmount = Math.max(0, Math.min(1, amount));
    this.surfImpact = Math.max(0, Math.min(1, impact));
    this.crestWind = Math.max(0, Math.min(1, crest));
  }

  /** altitude in meters above ground: street-level sounds fade when flying high. */
  update(rain: number, snow: number, wind: number, altitude: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = this.interior;
    if (this.muffleFilter) this.muffleFilter.frequency.setTargetAtTime(Math.max(280, 15000 - m * 14720), t, 0.35);
    if (this.humGain) this.humGain.gain.setTargetAtTime(this.hum * 0.016, t, 0.45);
    const mach = this.machinery * (1 - 0.55 * m);
    const wobble = 0.78 + 0.22 * Math.sin(t * 0.7);
    if (this.machGain) this.machGain.gain.setTargetAtTime(mach * 0.04 * wobble, t, 0.5);
    if (this.machTone) this.machTone.gain.setTargetAtTime(mach * 0.01, t, 0.5);
    const surf = this.surfAmount * (1 - 0.45 * m);
    if (this.surfGain) this.surfGain.gain.setTargetAtTime(surf * 0.075, t, 0.35);
    if (this.impactGain) this.impactGain.gain.setTargetAtTime(surf * this.surfImpact * 0.17, t, 0.03);
    const traffic = this.traffic * (1 - 0.62 * m);
    if (this.tireGain) this.tireGain.gain.setTargetAtTime(traffic * 0.028, t, 0.35);
    if (this.rumbleGain) this.rumbleGain.gain.setTargetAtTime(traffic * 0.018, t, 0.4);
    const street = Math.max(0.15, 1 - altitude / 400);
    this.rainGain.gain.setTargetAtTime(rain * 0.32 * (1 - 0.58 * m), t, 0.5);
    this.patterGain.gain.setTargetAtTime(rain * 0.25 * street * (1 - 0.72 * m), t, 0.5);
    this.cityGain.gain.setTargetAtTime((0.18 + 0.3 * street) * (1 - 0.5 * m), t, 0.8);
    this.windGain.gain.setTargetAtTime(Math.min(0.55, 0.03 + wind * 0.02 + snow * 0.08 + (1 - street) * 0.12 + this.crestWind * 0.16) * (1 - 0.35 * m), t, 0.45);
  }
}
