// The city-sound graph: a handful of looping sources, a nearest-N panner pool, one canyon
// delay. Nodes are created once. The frame loop only moves gains.
import { SLOT_KINDS, type SlotKind } from './registry';
import { looping, noiseBuffer, panner, tongueBuffer } from './synth';

export interface StreetSlot {
  kind: SlotKind;
  gain: GainNode;
  filter: BiquadFilterNode;
  pan: PannerNode;
  connected: boolean;
  key: number;
  target: number;
}

export interface CityGraph {
  drone: GainNode;
  murmur: GainNode;
  industrial: GainNode;
  /** One gain per invented babble recipe. Two can be open during a crossfade. */
  pa: GainNode[];
  wet: GainNode;
  delay: DelayNode;
  feedback: GainNode;
  horn: GainNode;
  awning: GainNode;
  spinner: GainNode;
  spinnerFilter: BiquadFilterNode;
  spinnerPan: PannerNode;
  slots: StreetSlot[];
  white: AudioBuffer;
  tongues: AudioBuffer[];
}

const SLOT_FILTER: Record<SlotKind, { type: BiquadFilterType; freq: number; q: number; ref: number; max: number; roll: number }> = {
  sizzle: { type: 'bandpass', freq: 3200, q: 1.35, ref: 3.2, max: 26, roll: 1.55 },
  clatter: { type: 'bandpass', freq: 880, q: 1.1, ref: 2.4, max: 16, roll: 1.7 },
  murmur: { type: 'bandpass', freq: 460, q: 0.75, ref: 6, max: 28, roll: 1.15 },
  neon: { type: 'bandpass', freq: 6800, q: 4.5, ref: 1.1, max: 8, roll: 2.4 },
  steam: { type: 'bandpass', freq: 1500, q: 0.55, ref: 2.2, max: 18, roll: 1.45 },
};

export function mountCityGraph(ctx: BaseAudioContext, master: AudioNode, slots: number): CityGraph {
  const white = noiseBuffer(ctx, 2, false, 1);
  const brown = noiseBuffer(ctx, 4, true, 2);
  const tongues = [0, 1, 2, 3].map((i) => tongueBuffer(ctx, i));

  const drone = gain(ctx, 0);
  const dlp = ctx.createBiquadFilter();
  dlp.type = 'lowpass';
  dlp.frequency.value = 150;
  looping(ctx, brown).connect(dlp).connect(drone).connect(master);

  const murmur = gain(ctx, 0);
  const mbp = ctx.createBiquadFilter();
  mbp.type = 'bandpass';
  mbp.frequency.value = 420;
  mbp.Q.value = 0.65;
  looping(ctx, brown).connect(mbp).connect(murmur).connect(master);

  const industrial = gain(ctx, 0);
  const ibp = ctx.createBiquadFilter();
  ibp.type = 'bandpass';
  ibp.frequency.value = 170;
  ibp.Q.value = 0.7;
  looping(ctx, brown).connect(ibp).connect(industrial).connect(master);

  const pa: GainNode[] = [];
  const sum = ctx.createGain();
  for (let i = 0; i < tongues.length; i++) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 780 + i * 140;
    filter.Q.value = 0.7;
    const g = gain(ctx, 0);
    looping(ctx, tongues[i]!).connect(filter).connect(g).connect(sum);
    pa.push(g);
  }
  sum.connect(master);

  const delay = ctx.createDelay(0.45);
  delay.delayTime.value = 0.16;
  const feedback = gain(ctx, 0.22);
  const fbLp = ctx.createBiquadFilter();
  fbLp.type = 'lowpass';
  fbLp.frequency.value = 1500;
  delay.connect(fbLp).connect(feedback).connect(delay);
  const wet = gain(ctx, 0);
  delay.connect(wet).connect(master);
  sum.connect(delay);

  const horn = gain(ctx, 0);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 52;
  const hlp = ctx.createBiquadFilter();
  hlp.type = 'lowpass';
  hlp.frequency.value = 180;
  const hnoise = gain(ctx, 0.35);
  const hbp = ctx.createBiquadFilter();
  hbp.type = 'bandpass';
  hbp.frequency.value = 95;
  hbp.Q.value = 1.6;
  looping(ctx, white).connect(hbp).connect(hnoise);
  osc.connect(hlp).connect(horn).connect(master);
  hnoise.connect(horn);
  osc.start(ctx.currentTime);

  const awning = gain(ctx, 0);
  const ahp = ctx.createBiquadFilter();
  ahp.type = 'highpass';
  ahp.frequency.value = 1700;
  looping(ctx, white).connect(ahp).connect(awning).connect(master);

  const spinnerFilter = ctx.createBiquadFilter();
  spinnerFilter.type = 'bandpass';
  spinnerFilter.frequency.value = 280;
  spinnerFilter.Q.value = 2.4;
  const spinner = gain(ctx, 0);
  const spinnerPan = panner(ctx, 40, 700, 0.55);
  looping(ctx, white).connect(spinnerFilter).connect(spinner).connect(spinnerPan).connect(master);

  const pool: StreetSlot[] = [];
  const n = Math.max(0, Math.min(SLOT_KINDS.length, slots));
  for (let i = 0; i < n; i++) pool.push(makeSlot(ctx, master, white, SLOT_KINDS[i]!));

  return {
    drone, murmur, industrial, pa, wet, delay, feedback,
    horn, awning, spinner, spinnerFilter, spinnerPan, slots: pool, white, tongues,
  };
}

export function makeSlot(ctx: BaseAudioContext, master: AudioNode, white: AudioBuffer, kind: SlotKind): StreetSlot {
  const spec = SLOT_FILTER[kind];
  const filter = ctx.createBiquadFilter();
  filter.type = spec.type;
  filter.frequency.value = spec.freq;
  filter.Q.value = spec.q;
  const g = gain(ctx, 0);
  const pan = panner(ctx, spec.ref, spec.max, spec.roll);
  looping(ctx, white).connect(filter).connect(g).connect(pan).connect(master);
  return { kind, gain: g, filter, pan, connected: true, key: 0, target: 0 };
}

function gain(ctx: BaseAudioContext, v: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}
