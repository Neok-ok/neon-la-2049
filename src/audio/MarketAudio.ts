// Positional market bed: rain on awnings, a murmur, stall sizzle, a distant spinner.
// Procedural noise only — no samples, no music. Panners are equalpower (HRTF is unreliable on iOS).
import type { Ambience } from './Ambience';

function noise(ctx: AudioContext, seconds: number, brown: boolean): AudioBufferSourceNode {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (!brown) d[i] = w;
    else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start();
  return src;
}

function panner(ctx: AudioContext, ref: number, max: number, roll: number): PannerNode {
  const p = ctx.createPanner();
  p.panningModel = 'equalpower';
  p.distanceModel = 'inverse';
  p.refDistance = ref;
  p.maxDistance = max;
  p.rolloffFactor = roll;
  return p;
}

function setPos(node: PannerNode, x: number, y: number, z: number): void {
  if (node.positionX) {
    node.positionX.value = x;
    node.positionY.value = y;
    node.positionZ.value = z;
  } else node.setPosition(x, y, z);
}

export class MarketAudio {
  private built = false;
  private awning!: GainNode;
  private murmur!: GainNode;
  private sizzle!: GainNode;
  private spinner!: GainNode;
  private sizzlePan!: PannerNode;
  private murmurPan!: PannerNode;
  private spinPan!: PannerNode;
  private spinnerFilter!: BiquadFilterNode;

  constructor(private ambience: Ambience) {}

  update(
    cam: { x: number; y: number; z: number },
    forward: { x: number; y: number; z: number },
    up: { x: number; y: number; z: number },
    rain: number,
    inMarket: boolean,
    alt: number,
    sizzleAt: { x: number; y: number; z: number } | null,
    spinnerAt: { x: number; y: number; z: number; dist: number } | null,
  ): void {
    const ctx = this.ambience.context;
    const out = this.ambience.output;
    if (!ctx || !out) return;
    if (!this.built) this.build(ctx, out);

    const close = inMarket && alt < 25 ? 1 : inMarket && alt < 80 ? (80 - alt) / 55 : 0;
    const under = inMarket && alt < 8 ? 1 : 0;
    this.awning.gain.value = rain * (0.05 + under * 0.22) * (close > 0 ? 1 : 0);
    this.murmur.gain.value = close * 0.2;
    if (sizzleAt) {
      setPos(this.sizzlePan, sizzleAt.x, sizzleAt.y + 1.1, sizzleAt.z);
      setPos(this.murmurPan, sizzleAt.x, sizzleAt.y + 1.6, sizzleAt.z);
      const d = Math.hypot(sizzleAt.x - cam.x, sizzleAt.z - cam.z);
      this.sizzle.gain.value = close * Math.max(0, 1 - d / 28) * 0.35;
    } else this.sizzle.gain.value = 0;

    if (spinnerAt && spinnerAt.dist < 700) {
      setPos(this.spinPan, spinnerAt.x, spinnerAt.y, spinnerAt.z);
      const t = 1 - spinnerAt.dist / 700;
      this.spinner.gain.value = t * t * 0.16;
      this.spinnerFilter.frequency.value = 180 + t * 900;
    } else this.spinner.gain.value = 0;

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

  private build(ctx: AudioContext, master: GainNode): void {
    this.built = true;
    const awningSrc = noise(ctx, 2, false);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    this.awning = ctx.createGain();
    this.awning.gain.value = 0;
    awningSrc.connect(hp).connect(this.awning).connect(master);

    const murmurSrc = noise(ctx, 4, true);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.7;
    this.murmur = ctx.createGain();
    this.murmur.gain.value = 0;
    this.murmurPan = panner(ctx, 10, 70, 1.1);
    murmurSrc.connect(bp).connect(this.murmur).connect(this.murmurPan).connect(master);

    const sizzleSrc = noise(ctx, 2, false);
    const shp = ctx.createBiquadFilter();
    shp.type = 'bandpass';
    shp.frequency.value = 3200;
    shp.Q.value = 1.4;
    this.sizzle = ctx.createGain();
    this.sizzle.gain.value = 0;
    this.sizzlePan = panner(ctx, 4, 36, 1.5);
    sizzleSrc.connect(shp).connect(this.sizzle).connect(this.sizzlePan).connect(master);

    const spinSrc = noise(ctx, 3, false);
    this.spinnerFilter = ctx.createBiquadFilter();
    this.spinnerFilter.type = 'bandpass';
    this.spinnerFilter.frequency.value = 280;
    this.spinnerFilter.Q.value = 2.5;
    this.spinner = ctx.createGain();
    this.spinner.gain.value = 0;
    this.spinPan = panner(ctx, 40, 700, 0.55);
    spinSrc.connect(this.spinnerFilter).connect(this.spinner).connect(this.spinPan).connect(master);
  }
}
