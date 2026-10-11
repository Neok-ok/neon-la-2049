// Living-city bus. Procedural: one shared noise buffer, biquads, delay combs, two oscillators.
// No new AudioBuffer. Distant pieces disconnect so the audio thread stops pulling them.
// D6 thunder, surf and the breaker stay on Ambience. This bus ducks when that wash is up.
import type { Tier } from '../core/quality';
import { scheduleParam } from './param';
import { setPos, setPanningModel } from './synth';
import {
  TIER_PLAN,
  surfaceVoices,
  type LivingFrame,
  type SpaceEar,
} from './livingModel';

type TierPlan = (typeof TIER_PLAN)[Tier];

interface SurfaceNode {
  filter: BiquadFilterNode;
  gain: GainNode;
  live: boolean;
}

interface Comb {
  delay: DelayNode;
  fb: GainNode;
  damp: BiquadFilterNode;
  into: GainNode;
  live: boolean;
}

const COMB_BASE = [0.031, 0.037, 0.043, 0.047];
const HEARD = 0.004;

export class LivingSound {
  voices = 0;
  private ctx: BaseAudioContext | null = null;
  private master: AudioNode | null = null;
  private tier: Tier = 'medium';
  private bus: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private compOn = false;
  private source: AudioBufferSourceNode | null = null;
  private body: GainNode | null = null;
  private bodyLive = false;
  /** Sum of the dry rain, before the space low-pass. */
  private dry: GainNode | null = null;
  private air: BiquadFilterNode | null = null;
  private early: DelayNode | null = null;
  private earlyIn: GainNode | null = null;
  private earlyGain: GainNode | null = null;
  private earlyLive = false;
  private readonly surfaces: SurfaceNode[] = [];
  private impactFilter: BiquadFilterNode | null = null;
  private impactGain: GainNode | null = null;
  private impactLive = false;
  private impactUntil = 0;
  private tank: GainNode | null = null;
  private wet: GainNode | null = null;
  private wetBus: GainNode | null = null;
  private readonly combs: Comb[] = [];
  private readonly allpasses: BiquadFilterNode[] = [];
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private sirenPan: PannerNode | null = null;
  private sirenLive = false;
  private humOsc: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  private humPan: PannerNode | null = null;
  private humLive = false;
  private reverbIn: GainNode | null = null;
  private readonly sends = new WeakSet<GainNode>();

  /** Gain other voices can send into the canyon tank. Null until mount, and silent on the low tier. */
  get send(): GainNode | null {
    return this.reverbIn;
  }

  mount(ctx: BaseAudioContext, master: AudioNode, white: AudioBuffer, tier: Tier): void {
    if (this.ctx) {
      if (tier !== this.tier) this.retune(tier);
      return;
    }
    this.ctx = ctx;
    this.master = master;
    this.tier = tier;
    const bus = ctx.createGain();
    // Keeps the little-tokyo downpour under the -3 dBFS ceiling with the bed left alone.
    bus.gain.value = 0.62;
    this.bus = bus;
    this.wireBus(tier);

    const body = ctx.createGain();
    body.gain.value = 1;
    this.body = body;
    const dry = ctx.createGain();
    dry.gain.value = 1;
    const air = ctx.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = 14000;
    air.Q.value = 0.707;
    dry.connect(air);
    air.connect(bus);
    this.dry = dry;
    this.air = air;
    const src = ctx.createBufferSource();
    src.buffer = white;
    src.loop = true;
    src.start(ctx.currentTime);
    this.source = src;

    const impactFilter = ctx.createBiquadFilter();
    impactFilter.type = 'bandpass';
    impactFilter.frequency.value = 2000;
    impactFilter.Q.value = 2;
    const impactGain = ctx.createGain();
    impactGain.gain.value = 0.0001;
    this.impactFilter = impactFilter;
    this.impactGain = impactGain;

    const tank = ctx.createGain();
    tank.gain.value = 1;
    const wetBus = ctx.createGain();
    wetBus.gain.value = 1;
    const wet = ctx.createGain();
    wet.gain.value = 0;
    this.tank = tank;
    this.wetBus = wetBus;
    this.wet = wet;
    wet.connect(bus);
    air.connect(tank);
    const early = ctx.createDelay(0.25);
    early.delayTime.value = 0.001;
    const earlyIn = ctx.createGain();
    earlyIn.gain.value = 1;
    const earlyGain = ctx.createGain();
    earlyGain.gain.value = 0;
    earlyIn.connect(early);
    early.connect(earlyGain);
    earlyGain.connect(bus);
    this.early = early;
    this.earlyIn = earlyIn;
    this.earlyGain = earlyGain;

    const reverbIn = ctx.createGain();
    reverbIn.gain.value = 0;
    this.reverbIn = reverbIn;

    this.retune(tier);
  }

  retune(tier: Tier): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;
    this.tier = tier;
    const plan = TIER_PLAN[tier];
    this.wireBus(tier);
    while (this.surfaces.length < plan.surfaces) this.addSurface(ctx);
    while (this.combs.length < plan.combs) this.addComb(ctx);
    while (this.allpasses.length < plan.allpasses) this.addAllpass(ctx);
    if (plan.siren) this.ensureSiren(ctx);
    if (plan.hum) this.ensureHum(ctx);
    if (this.sirenPan) setPanningModel(this.sirenPan, plan.hrtf);
    if (this.humPan) setPanningModel(this.humPan, plan.hrtf);
    this.syncGraph(plan);
  }

  update(frame: LivingFrame, time: number): void {
    this.apply(frame, time, false, 0);
  }

  /** Offline render. Schedules impacts across `seconds` from the audio clock. */
  prime(frame: LivingFrame, seconds: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.apply(frame, ctx.currentTime, true, seconds);
  }

  /**
   * A siren pass written as automation, so an offline clip contains the Doppler glide.
   * `at` is the audio-clock time where the model's `time` field is `modelTime`.
   */
  primeSiren(frameAt: (modelTime: number) => LivingFrame, modelStart: number, seconds: number): void {
    const ctx = this.ctx;
    const osc = this.sirenOsc;
    const gain = this.sirenGain;
    const pan = this.sirenPan;
    if (!ctx || !osc || !gain || !pan) return;
    const t0 = ctx.currentTime;
    const step = 0.08;
    const n = Math.max(1, Math.floor(seconds / step));
    const first = frameAt(modelStart);
    if (first.siren.on) {
      setPos(pan, first.siren.x, first.siren.y, first.siren.z);
      this.connectSiren(true);
    }
    try {
      osc.frequency.cancelScheduledValues(t0);
      gain.gain.cancelScheduledValues(t0);
      osc.frequency.setValueAtTime(first.siren.freq, t0);
      gain.gain.setValueAtTime(Math.max(0.0001, first.siren.gain), t0);
      for (let i = 1; i <= n; i++) {
        const at = t0 + i * step;
        const frame = frameAt(modelStart + i * step);
        osc.frequency.linearRampToValueAtTime(Math.max(40, frame.siren.freq), at);
        gain.gain.linearRampToValueAtTime(Math.max(0.0001, frame.siren.gain), at);
      }
    } catch {
      // A clock already past t0 skips the ramp. The live path still aims each frame.
    }
  }

  attachSend(gain: GainNode, on: boolean): void {
    const send = this.reverbIn;
    if (!send || TIER_PLAN[this.tier].combs === 0) return;
    if (on && !this.sends.has(gain)) {
      gain.connect(send);
      this.sends.add(gain);
    } else if (!on && this.sends.has(gain)) {
      try { gain.disconnect(send); } catch { /* already detached */ }
      this.sends.delete(gain);
    }
  }

  private apply(frame: LivingFrame, time: number, prime: boolean, seconds: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.body || !this.bus) return;
    const plan = TIER_PLAN[this.tier];
    const when: number | null = prime ? null : time;
    const voices = surfaceVoices(frame.weights, plan.surfaces);
    const sounding = frame.level > HEARD || frame.impact > HEARD;
    this.connectBody(sounding && plan.surfaces > 0);
    for (let i = 0; i < this.surfaces.length; i++) {
      const node = this.surfaces[i]!;
      const on = i < plan.surfaces;
      const voice = voices[i];
      if (on && voice && sounding) {
        this.connectSurface(node, true);
        const g = frame.level * voice.gain * voice.body;
        aim(node.gain.gain, g, when, 0.2, 'surface');
        aim(node.filter.frequency, voice.freq, when, 0.25, 'surfaceHz', 1);
        aim(node.filter.Q, Math.max(0.1, voice.q), when, 0.25, 'surfaceQ', 0.05);
        if (node.filter.type !== voice.type) node.filter.type = voice.type;
      } else {
        aim(node.gain.gain, 0, when, 0.15, 'surface');
        this.connectSurface(node, false);
      }
    }
    this.applySpace(frame.space, frame.wet, when);
    this.applyImpact(frame, time, prime, seconds, when);
    this.applySiren(frame, when);
    this.applyHum(frame, when);
    let n = 0;
    if (sounding && plan.surfaces > 0) n += 1;
    if (frame.impact > HEARD && plan.drips > 0) n += 1;
    if (frame.wet > 0.02 && plan.combs > 0) n += 1;
    if (frame.siren.on && frame.siren.gain > HEARD) n += 1;
    if (frame.hum > HEARD) n += 1;
    this.voices = n;
  }

  private applySpace(space: SpaceEar, wet: number, time: number | null): void {
    const plan = TIER_PLAN[this.tier];
    if (this.air) aim(this.air.frequency, Math.max(180, space.airHz), time, 0.35, 'airHz', 1);
    const use = plan.combs > 0 && wet > 0.02;
    const earlyLevel = !use ? 0
      : space.kind === 'alley' ? 0.62
        : space.kind === 'freeway' ? 0.38
          : space.kind === 'interior' ? 0.16
            : space.kind === 'open' ? 0.08
              : 0.22;
    if (this.early && this.earlyGain) {
      this.connectEarly(earlyLevel > 0.02);
      const delaySec = Math.max(0.008, Math.min(0.22, space.early));
      if (time == null) {
        this.early.delayTime.cancelScheduledValues(0);
        this.early.delayTime.setValueAtTime(delaySec, 0);
      } else aim(this.early.delayTime, delaySec, time, 0.4, 'early', 0.0005);
      aim(this.earlyGain.gain, earlyLevel, time, 0.35, 'earlyGain');
    }
    aim(this.wet?.gain, use ? wet : 0, time, 0.35, 'spaceWet');
    aim(this.reverbIn?.gain, use ? 0.35 : 0, time, 0.3, 'spaceSend');
    const combCount = space.kind === 'alley' ? 0 : space.kind === 'interior' ? Math.min(1, plan.combs) : plan.combs;
    for (let i = 0; i < this.combs.length; i++) {
      const comb = this.combs[i]!;
      const on = i < combCount && use;
      this.connectComb(comb, on);
      if (!on) continue;
      const base = i === 0 ? space.early : COMB_BASE[i]! * space.scale;
      const delay = Math.max(0.008, Math.min(0.22, base));
      aim(comb.delay.delayTime, delay, time, 0.4, 'comb', 0.0005);
      aim(comb.fb.gain, Math.min(0.72, space.feedback), time, 0.4, 'combFb');
      aim(comb.into.gain, i === 0 ? 0.72 : 0.26, time, 0.4, 'combInto');
      const damp = space.lid > 0.5 ? Math.min(space.dampHz, 900) : space.dampHz;
      aim(comb.damp.frequency, damp, time, 0.4, 'combHz', 1);
    }
    for (let i = 0; i < this.allpasses.length; i++) {
      const ap = this.allpasses[i]!;
      const hz = space.kind === 'freeway' ? 480 : space.kind === 'interior' ? 700 : space.kind === 'alley' ? 1500 : 1100;
      aim(ap.frequency, hz, time, 0.4, 'allpass', 1);
    }
  }

  private applyImpact(frame: LivingFrame, time: number, prime: boolean, seconds: number, when: number | null): void {
    const plan = TIER_PLAN[this.tier];
    const filter = this.impactFilter;
    const gain = this.impactGain;
    if (!filter || !gain) return;
    const on = plan.drips > 0 && frame.impact > HEARD;
    this.connectImpact(on);
    if (!on) return;
    const toneHz = frame.dominant === 'puddle' ? 340
      : frame.dominant === 'concrete' ? 900
        : frame.dominant === 'fabric' ? 1200
          : frame.dominant === 'umbrella' ? 2600
            : frame.dominant === 'glass' ? 7000
              : 4500;
    const q = frame.dominant === 'metal' ? 8 : frame.dominant === 'glass' ? 5 : frame.dominant === 'puddle' ? 0.8 : 1.2;
    if (filter.type !== 'bandpass') filter.type = 'bandpass';
    aim(filter.frequency, toneHz, when, 0.2, 'impactHz', 1);
    aim(filter.Q, q, when, 0.2, 'impactQ', 0.05);
    if (prime) this.scheduleImpacts(time, time + Math.max(0.2, seconds), frame.interval, frame.impact, true);
    else if (time + 0.45 >= this.impactUntil) this.scheduleImpacts(Math.max(time, this.impactUntil), time + 1.2, frame.interval, frame.impact, false);
  }

  private scheduleImpacts(from: number, until: number, interval: number, peak: number, reset: boolean): void {
    const gain = this.impactGain;
    if (!gain || !(until > from)) return;
    const p = gain.gain;
    const step = Math.max(0.09, interval);
    try {
      if (reset) {
        p.cancelScheduledValues(from);
        p.setValueAtTime(0.0001, from);
      }
      const gap = Math.max(0.1, step);
      let t = from + 0.04;
      while (t + 0.08 < until) {
        const flutter = 0.55 + 0.45 * (((Math.floor(t * 1000) * 17) % 100) / 100);
        const hit = Math.max(0.0002, peak * flutter);
        p.linearRampToValueAtTime(0.0001, t);
        p.linearRampToValueAtTime(hit, t + 0.004);
        p.exponentialRampToValueAtTime(0.0001, t + 0.075);
        t += gap * (0.85 + (((Math.floor(t * 1000) * 13) % 100) / 100) * 0.3);
      }
      this.impactUntil = until;
    } catch {
      this.impactUntil = from + 0.5;
    }
  }

  private applySiren(frame: LivingFrame, time: number | null): void {
    const plan = TIER_PLAN[this.tier];
    if (!this.sirenOsc || !this.sirenGain || !this.sirenPan) return;
    if (!plan.siren) {
      this.connectSiren(false);
      return;
    }
    const on = frame.siren.on && frame.siren.gain > HEARD;
    this.connectSiren(on);
    if (!on) {
      aim(this.sirenGain.gain, 0, time, 0.2, 'siren');
      return;
    }
    setPos(this.sirenPan, frame.siren.x, frame.siren.y, frame.siren.z);
    aim(this.sirenGain.gain, frame.siren.gain, time, 0.12, 'siren');
    aim(this.sirenOsc.frequency, frame.siren.freq, time, 0.05, 'sirenHz', 1);
  }

  private applyHum(frame: LivingFrame, time: number | null): void {
    const plan = TIER_PLAN[this.tier];
    if (!this.humOsc || !this.humGain || !this.humPan) return;
    if (!plan.hum) {
      this.connectHum(false);
      return;
    }
    const on = frame.hum > HEARD;
    this.connectHum(on);
    if (!on) {
      aim(this.humGain.gain, 0, time, 0.2, 'hum');
      return;
    }
    setPos(this.humPan, frame.signX, frame.signY, frame.signZ);
    aim(this.humGain.gain, frame.hum, time, 0.15, 'hum');
    aim(this.humOsc.frequency, 120, time, 0.4, 'humHz', 1);
  }

  private wireBus(tier: Tier): void {
    const ctx = this.ctx;
    const bus = this.bus;
    const master = this.master;
    if (!ctx || !bus || !master) return;
    const want = tier !== 'low';
    if (want && !this.comp) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 8;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.12;
      this.comp = comp;
    }
    if (want && this.comp && !this.compOn) {
      try { bus.disconnect(); } catch { /* first connect */ }
      bus.connect(this.comp);
      this.comp.connect(master);
      this.compOn = true;
    } else if (!want && this.compOn) {
      try { bus.disconnect(); } catch { /* already */ }
      if (this.comp) try { this.comp.disconnect(); } catch { /* already */ }
      bus.connect(master);
      this.compOn = false;
    } else if (!want && !this.compOn) {
      try { bus.disconnect(); } catch { /* first */ }
      bus.connect(master);
    }
  }

  private addSurface(ctx: BaseAudioContext): void {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    filter.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(this.dry!);
    this.surfaces.push({ filter, gain: g, live: false });
  }

  private addComb(ctx: BaseAudioContext): void {
    const delay = ctx.createDelay(0.25);
    delay.delayTime.value = 0.03;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2500;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const into = ctx.createGain();
    into.gain.value = 0.26;
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    delay.connect(into);
    into.connect(this.wetBus ?? this.wet!);
    this.combs.push({ delay, fb, damp, into, live: false });
  }

  private addAllpass(ctx: BaseAudioContext): void {
    const ap = ctx.createBiquadFilter();
    ap.type = 'allpass';
    ap.frequency.value = 1100;
    ap.Q.value = 0.6;
    const wetBus = this.wetBus;
    const wet = this.wet;
    if (!wetBus || !wet) return;
    if (this.allpasses.length === 0) {
      try { wetBus.disconnect(wet); } catch { /* not yet wired */ }
      wetBus.connect(ap);
      ap.connect(wet);
      this.wetLinked = true;
    } else {
      const prev = this.allpasses[this.allpasses.length - 1]!;
      try { prev.disconnect(wet); } catch { /* retune */ }
      prev.connect(ap);
      ap.connect(wet);
    }
    this.allpasses.push(ap);
  }

  private ensureSiren(ctx: BaseAudioContext): void {
    if (this.sirenOsc) return;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 680;
    const g = ctx.createGain();
    g.gain.value = 0;
    const pan = panner(ctx);
    const shape = ctx.createWaveShaper();
    shape.curve = softClip();
    osc.connect(shape).connect(g).connect(pan);
    osc.start(ctx.currentTime);
    this.sirenOsc = osc;
    this.sirenGain = g;
    this.sirenPan = pan;
  }

  private ensureHum(ctx: BaseAudioContext): void {
    if (this.humOsc) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 120;
    const g = ctx.createGain();
    g.gain.value = 0;
    const pan = panner(ctx);
    pan.refDistance = 1.2;
    pan.rolloffFactor = 1.7;
    pan.maxDistance = 16;
    osc.connect(g).connect(pan);
    osc.start(ctx.currentTime);
    this.humOsc = osc;
    this.humGain = g;
    this.humPan = pan;
  }

  private wetLinked = false;
  private reverbLinked = false;

  private syncGraph(plan: TierPlan): void {
    if (!this.wetBus || !this.tank || !this.reverbIn || !this.wet) return;
    if (!this.wetLinked && this.allpasses.length === 0) {
      this.wetBus.connect(this.wet);
      this.wetLinked = true;
    }
    if (plan.combs > 0 && !this.reverbLinked) {
      this.reverbIn.connect(this.tank);
      this.reverbLinked = true;
    }
  }

  private connectBody(on: boolean): void {
    const src = this.source;
    const body = this.body;
    if (!src || !body) return;
    if (on && !this.bodyLive) {
      src.connect(body);
      for (const node of this.surfaces) {
        if (node.live) body.connect(node.filter);
      }
      this.bodyLive = true;
    } else if (!on && this.bodyLive) {
      try { src.disconnect(body); } catch { /* parked */ }
      try { body.disconnect(); } catch { /* parked */ }
      this.bodyLive = false;
    }
  }

  private connectSurface(node: SurfaceNode, on: boolean): void {
    const body = this.body;
    if (!body) return;
    if (on && !node.live) {
      node.filter.connect(node.gain);
      if (this.bodyLive) body.connect(node.filter);
      node.live = true;
    } else if (!on && node.live) {
      try { node.filter.disconnect(node.gain); } catch { /* parked */ }
      try { body.disconnect(node.filter); } catch { /* parked */ }
      node.live = false;
    }
  }

  private connectImpact(on: boolean): void {
    const src = this.source;
    const filter = this.impactFilter;
    const gain = this.impactGain;
    const dry = this.dry;
    if (!src || !filter || !gain || !dry) return;
    if (on && !this.impactLive) {
      src.connect(filter);
      filter.connect(gain);
      gain.connect(dry);
      this.impactLive = true;
    } else if (!on && this.impactLive) {
      try { src.disconnect(filter); } catch { /* parked */ }
      try { gain.disconnect(); } catch { /* parked */ }
      this.impactLive = false;
    }
  }

  private connectEarly(on: boolean): void {
    const air = this.air;
    const earlyIn = this.earlyIn;
    if (!air || !earlyIn) return;
    if (on && !this.earlyLive) {
      air.connect(earlyIn);
      this.earlyLive = true;
    } else if (!on && this.earlyLive) {
      try { air.disconnect(earlyIn); } catch { /* parked */ }
      this.earlyLive = false;
    }
  }

  private connectComb(comb: Comb, on: boolean): void {
    const tank = this.tank;
    if (!tank) return;
    if (on && !comb.live) {
      tank.connect(comb.delay);
      comb.live = true;
    } else if (!on && comb.live) {
      try { tank.disconnect(comb.delay); } catch { /* parked */ }
      comb.live = false;
    }
  }

  private connectSiren(on: boolean): void {
    const pan = this.sirenPan;
    const bus = this.bus;
    if (!pan || !bus) return;
    if (on && !this.sirenLive) {
      pan.connect(bus);
      if (this.tank) pan.connect(this.tank);
      this.sirenLive = true;
    } else if (!on && this.sirenLive) {
      try { pan.disconnect(); } catch { /* parked */ }
      this.sirenLive = false;
    }
  }

  private connectHum(on: boolean): void {
    const pan = this.humPan;
    const bus = this.bus;
    if (!pan || !bus) return;
    if (on && !this.humLive) {
      pan.connect(bus);
      this.humLive = true;
    } else if (!on && this.humLive) {
      try { pan.disconnect(); } catch { /* parked */ }
      this.humLive = false;
    }
  }
}

function aim(param: AudioParam | undefined, value: number, time: number | null, tc: number, name: string, epsilon = 0.001): void {
  scheduleParam(param, value, time, tc, name, epsilon);
}

function panner(ctx: BaseAudioContext): PannerNode {
  const p = ctx.createPanner();
  p.panningModel = 'equalpower';
  p.distanceModel = 'inverse';
  p.refDistance = 25;
  p.maxDistance = 900;
  p.rolloffFactor = 0.2;
  return p;
}

function softClip(): Float32Array<ArrayBuffer> {
  const n = 256;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 2.2);
  }
  return curve;
}
