// Procedural ambience (no music, no samples): rain hiss + patter, distant city rumble, wind.
// Starts on the first user gesture (required by iOS Safari).
export class Ambience {
  private ctx: AudioContext | null = null;
  private rainGain!: GainNode;
  private patterGain!: GainNode;
  private cityGain!: GainNode;
  private windGain!: GainNode;
  private master!: GainNode;
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
    this.master.connect(ctx.destination);

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

    // wind
    const wind = noise('brown', 5);
    const wbp = ctx.createBiquadFilter();
    wbp.type = 'bandpass';
    wbp.frequency.value = 500;
    wbp.Q.value = 0.4;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    wind.connect(wbp).connect(this.windGain).connect(this.master);
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

  /** altitude in meters above ground: street-level sounds fade when flying high. */
  update(rain: number, snow: number, wind: number, altitude: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const street = Math.max(0.15, 1 - altitude / 400);
    this.rainGain.gain.setTargetAtTime(rain * 0.32, t, 0.5);
    this.patterGain.gain.setTargetAtTime(rain * 0.25 * street, t, 0.5);
    this.cityGain.gain.setTargetAtTime(0.18 + 0.3 * street, t, 0.8);
    this.windGain.gain.setTargetAtTime(Math.min(0.5, 0.03 + wind * 0.02 + snow * 0.08 + (1 - street) * 0.12), t, 0.8);
  }
}
