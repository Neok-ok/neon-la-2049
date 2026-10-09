// Pure module (worker-safe). Megablock kit: cantilevered top-heavy masses, slab-on-podium, courtyard
// and long bars, with ribbed / coffered / panelled façades, rooftop plant and lit walkway decks.
// One plan → the same parts at every LOD. Stages 11, 12 and 20 should build residential blocks from
// these plans (raise `residential`, lower `height`) instead of inventing another box archetype.
//
// Frame matches the megatower kit: origin at the footprint centre on the ground, +Y up, local X = `w`
// (block B / −t), local Z = `d` (block A / +s). Faces: 0 = +Z, 1 = +X, 2 = −Z, 3 = −X.
// Everything stays inside the footprint, so a street centred outside the lot stays clear.
import { Rng } from '../../../core/rng';
import { Style } from '../../../world/fabric/types';
import type { KitCollider, KitHolo, KitSign, Face } from '../megatower/tower';
import { kitBox, type FaceStyle, type KitDetail, type MassSink } from '../megatower/sink';

export type MegablockForm = 'cantilever' | 'slab-podium' | 'courtyard' | 'bar';
export type FacadeFamily = 'ribbed' | 'coffered' | 'panelled';

export interface MegablockPlan {
  /** 0..1, drives every random choice. */
  seed: number;
  /** Roof of the main mass (m). Antennae may stand above it. Keep fabric under 320. */
  height: number;
  /** Footprint along kit X (width) and kit Z (depth), metres. */
  w: number;
  d: number;
  form: MegablockForm;
  family: FacadeFamily;
  /** Night lit fraction of ordinary windows. */
  lit?: number;
  tint?: number;
  /**
   * 0 = downtown plant (tanks, pad, mast). 1 = residential laundry, AC and balcony cages.
   * Stages 11, 12 and 20 should pass about 0.7–1.
   */
  residential?: number;
  /** Fewer ribs, coffers and rails. Fabric districts should pass true. */
  compact?: boolean;
  /** Lit decks. Default on. Pass the street's shared heights so a deck can meet a neighbour. */
  walkways?: boolean;
  /** Preferred deck heights (m). The kit keeps the ones the mass actually covers. */
  walkAt?: number[];
  /** Hologram / billboard slots wanted (0–2). They come back as signs the caller places. */
  holo?: number;
}

export interface MegablockParts {
  colliders: KitCollider[];
  holos: KitHolo[];
  signs: KitSign[];
  /** Highest walkable roof of the main mass. */
  roof: number;
  /** Highest solid, including the mast. */
  top: number;
  halfW: number;
  halfD: number;
  /** Street-level mass, so a dresser can put kiosks in the overhang. */
  baseHalfW: number;
  baseHalfD: number;
  /** Deck heights that were actually built. */
  walkYs: number[];
  /** Open court half-extents, when `form` is `courtyard`. */
  court: { halfW: number; halfD: number } | null;
}

const FN: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const FAMILY_STYLE: Record<FacadeFamily, number> = {
  ribbed: Style.Ribbed,
  coffered: Style.Coffer,
  panelled: Style.Panel,
};
const NEON = [1, 0, 6, 5, 2, 3];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

class Builder {
  readonly parts: MegablockParts;
  readonly r: Rng;
  readonly lit: number;
  readonly tint: number;
  readonly home: number;
  readonly compact: boolean;
  private k = 0;

  constructor(readonly p: MegablockPlan, readonly sink: MassSink) {
    this.r = new Rng((Math.floor(p.seed * 4294967295) ^ 0x6d3a19b1) >>> 0);
    this.lit = p.lit ?? 0.38;
    this.tint = p.tint ?? 0.9;
    this.home = clamp(p.residential ?? 0, 0, 1);
    this.compact = p.compact !== false;
    this.parts = {
      colliders: [], holos: [], signs: [],
      roof: p.height, top: p.height, halfW: p.w / 2, halfD: p.d / 2,
      baseHalfW: p.w / 2, baseHalfD: p.d / 2, walkYs: [], court: null,
    };
  }

  get show2(): boolean { return this.sink.maxDetail >= 2; }
  get simple(): boolean { return this.sink.maxDetail <= 0; }

  face(style: number, lit = this.lit, tint = this.tint): FaceStyle {
    this.k++;
    return { style, lit, tint, seed: (this.p.seed * 3.17 + this.k * 0.173) % 1 };
  }

  box(lx: number, lz: number, y0: number, w: number, d: number, h: number, s: FaceStyle, detail: KitDetail): void {
    if (h < 0.2 || w < 0.6 || d < 0.6) return;
    if (detail > this.sink.maxDetail) return;
    kitBox(this.sink, lx, lz, y0, w, d, h, s, detail, true);
  }

  collide(lx: number, lz: number, w: number, d: number, y0: number, top: number): void {
    this.parts.colliders.push({ lx, lz, hw: w / 2, hd: d / 2, y0, top });
    this.parts.halfW = Math.max(this.parts.halfW, Math.abs(lx) + w / 2);
    this.parts.halfD = Math.max(this.parts.halfD, Math.abs(lz) + d / 2);
  }

  /** A proud piece on one face. `depth` sticks out of the mass; sizes stay ≥ 0.6 so the fabric sink keeps them. */
  proud(f: Face, halfOut: number, along: number, y: number, len: number, depth: number, thick: number, s: FaceStyle, detail: KitDetail): void {
    const [nx, nz] = FN[f];
    const out = halfOut + depth * 0.5 + 0.12;
    const lx = f % 2 === 0 ? along : nx * out;
    const lz = f % 2 === 0 ? nz * out : along;
    const w = f % 2 === 0 ? len : depth;
    const d = f % 2 === 0 ? depth : len;
    this.box(lx, lz, y, Math.max(0.65, w), Math.max(0.65, d), thick, s, detail);
  }

  longFaces(w: number, d: number): Face[] {
    return w >= d ? [0, 2] : [1, 3];
  }

  family(style: number, w: number, d: number, y0: number, y1: number): void {
    if (this.simple) return;
    const faces = this.longFaces(w, d);
    const span = y1 - y0;
    if (span < 16) return;
    if (this.p.family === 'ribbed') this.ribs(style, w, d, y0, y1, faces);
    else if (this.p.family === 'coffered') this.coffers(w, d, y0, y1, faces);
    else this.panels(w, d, y0, y1, faces);
  }

  ribs(style: number, w: number, d: number, y0: number, y1: number, faces: Face[]): void {
    const step = this.compact ? 15 : 10;
    const cap = this.compact ? 6 : 11;
    for (const f of faces) {
      const len = f % 2 === 0 ? w : d;
      const half = f % 2 === 0 ? d / 2 : w / 2;
      const n = clamp(Math.floor(len / step), 2, cap);
      for (let i = 0; i < n; i++) {
        const a = -len / 2 + (i + 0.5) * (len / n);
        this.proud(f, half, a, y0 + 3, 0.9, 1.55, y1 - y0 - 6, this.face(style, this.lit * 0.8, this.tint * 0.92), i % 2 === 0 ? 1 : 2);
      }
    }
  }

  coffers(w: number, d: number, y0: number, y1: number, faces: Face[]): void {
    const bands = this.compact ? 3 : 4;
    const span = y1 - y0;
    for (const f of faces) {
      const len = f % 2 === 0 ? w : d;
      const half = f % 2 === 0 ? d / 2 : w / 2;
      for (let b = 1; b <= bands; b++) {
        const y = y0 + (b * span) / (bands + 1);
        this.proud(f, half, 0, y, len * 0.96, 0.85, 1.25, this.face(Style.Solid, 0.02, this.tint * 0.75), 1);
      }
      if (!this.show2) continue;
      const n = clamp(Math.floor(len / (this.compact ? 18 : 12)), 2, this.compact ? 4 : 7);
      for (let i = 0; i < n; i++) {
        const a = -len / 2 + (i + 0.5) * (len / n);
        this.proud(f, half, a, y0 + 4, 0.7, 0.7, span - 8, this.face(Style.Solid, 0, this.tint * 0.8), 2);
      }
    }
  }

  panels(w: number, d: number, y0: number, y1: number, faces: Face[]): void {
    // Corner pilasters, once.
    const pw = 1.6, ph = y1 - y0 - 2;
    const insetX = w / 2 - 0.7, insetZ = d / 2 - 0.7;
    const pier = this.face(Style.Solid, 0, this.tint * 0.7);
    if (!this.simple) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        this.box(sx * insetX, sz * insetZ, y0 + 1, pw, pw, ph, pier, 1);
      }
    }
    const span = y1 - y0;
    for (const f of faces) {
      const len = (f % 2 === 0 ? w : d) - 4;
      const half = f % 2 === 0 ? d / 2 : w / 2;
      for (const t of [0.34, 0.67]) {
        this.proud(f, half, 0, y0 + span * t, len, 1.15, 1.7, this.face(Style.Solid, 0.04, this.tint * 0.72), 1);
      }
    }
  }

  /** Ring decks around a mass. `halfW/halfD` are the mass half-extents the deck springs from. */
  decks(halfW: number, halfD: number, ys: number[]): void {
    if (this.p.walkways === false || this.simple) return;
    const reach = this.compact ? 4.4 : 5.6;
    const thick = 1.3;
    const glow = this.face(Style.Glow, 0.72, this.home > 0.5 ? 1.05 : 1.65);
    const deck = this.face(Style.Solid, 0.05, this.tint * 0.85);
    const rail = this.face(Style.Solid, 0, this.tint * 0.7);
    for (const y of ys) {
      if (this.parts.walkYs.includes(y)) continue;
      this.parts.walkYs.push(y);
      for (let f = 0 as Face; f < 4; f = (f + 1) as Face) {
        const half = f % 2 === 0 ? halfD : halfW;
        const len = (f % 2 === 0 ? halfW : halfD) * 2 - 1.2;
        this.proud(f, half, 0, y, Math.max(4, len), reach, thick, deck, 1);
        this.proud(f, half + reach - 0.35, 0, y + thick - 0.15, Math.max(4, len), 0.7, 0.55, glow, 1);
        if (this.show2 && !this.compact) this.proud(f, half + reach - 0.2, 0, y + thick, Math.max(4, len * 0.92), 0.65, 0.95, rail, 2);
      }
    }
  }

  soffit(halfW: number, halfD: number, y: number): void {
    if (this.simple) return;
    const glow = this.face(Style.Glow, 0.42, this.home > 0.5 ? 1.1 : 1.45);
    for (const f of this.longFaces(halfW * 2, halfD * 2)) {
      const half = f % 2 === 0 ? halfD : halfW;
      const len = (f % 2 === 0 ? halfW : halfD) * 1.7;
      this.proud(f, half - 0.4, 0, y - 0.35, Math.max(6, len), 1.4, 0.6, glow, 1);
    }
  }

  roofClutter(y: number, halfW: number, halfD: number): void {
    if (!this.show2 || this.simple) return;
    const r = this.r;
    const insetW = Math.max(2, halfW - 3), insetD = Math.max(2, halfD - 3);
    const tanks = this.home > 0.45 ? r.int(3, 6) : r.int(1, 3);
    for (let i = 0; i < tanks; i++) {
      const tw = r.range(3.2, this.home > 0.4 ? 6 : 9);
      const td = r.range(3.2, this.home > 0.4 ? 6 : 8);
      const lx = r.range(-insetW, insetW);
      const lz = r.range(-insetD, insetD);
      this.box(lx, lz, y, tw, td, r.range(2.4, this.home > 0.4 ? 4.2 : 6.5), this.face(Style.Industrial, 0.08, r.range(0.55, 0.85)), 2);
      if (this.home > 0.45 && i % 2 === 0) {
        // laundry cage: a slatted box on top of the tank
        this.box(lx, lz, y + 3.2, tw * 0.8, td * 0.8, 1.6, this.face(Style.Solid, 0.15, 0.7), 2);
      }
    }
    // mast + crossarm
    const mx = insetW * 0.65, mz = -insetD * 0.4;
    const mastH = r.range(this.home > 0.5 ? 6 : 11, this.home > 0.5 ? 14 : 24);
    this.box(mx, mz, y, 0.7, 0.7, mastH, this.face(Style.Solid, 0, 0.55), 2);
    this.box(mx, mz, y + mastH - 1.2, r.range(4, 8), 0.65, 0.65, this.face(Style.Solid, 0, 0.5), 2);
    this.parts.top = Math.max(this.parts.top, y + mastH);
    // amber pad, downtown only, on a roof big enough to land a spinner
    if (this.home < 0.35 && Math.min(halfW, halfD) > 16 && y > 80 && r.chance(0.6)) {
      const px = -insetW * 0.45, pz = insetD * 0.35;
      this.box(px, pz, y, 14, 14, 0.45, this.face(Style.Solid, 0.1, 0.6), 2);
      const pad = this.face(Style.Glow, 0.85, 1.02);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(px + sx * 6.2, pz + sz * 6.2, y + 0.45, 1.3, 1.3, 0.6, pad, 2);
    }
    // corner obstruction glows so the roof reads from the avenue
    const beacon = this.face(Style.Glow, 0.9, 1.0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.box(sx * (halfW - 1.4), sz * (halfD - 1.4), y, 0.8, 0.8, 1.4, beacon, 1);
    }
  }

  shops(halfW: number, halfD: number, top: number): void {
    const r = this.r;
    for (let f = 0 as Face; f < 4; f = (f + 1) as Face) {
      const len = f % 2 === 0 ? halfW * 2 : halfD * 2;
      const half = f % 2 === 0 ? halfD : halfW;
      const n = clamp(Math.floor(len / 22), 1, this.compact ? 3 : 5);
      for (let i = 0; i < n; i++) {
        const a = -len / 2 + (i + 0.5) * (len / n);
        const [nx, nz] = FN[f];
        const lx = f % 2 === 0 ? a : nx * (half + 0.4);
        const lz = f % 2 === 0 ? nz * (half + 0.4) : a;
        const w = r.range(3.2, 8.5), h = r.range(1.2, 2.4);
        this.parts.signs.push({
          lx, lz, y: r.range(3.2, Math.max(4.2, top - 1)), face: f, w, h,
          color: NEON[(i + f + Math.floor(this.p.seed * 20)) % NEON.length]!, kind: 0,
        });
      }
    }
    // one corner blade
    this.parts.signs.push({
      lx: halfW * 0.92, lz: halfD * 0.92, y: r.range(8, 16), face: 0,
      w: 1.4, h: r.range(7, 13), color: NEON[Math.floor(this.p.seed * 5) % NEON.length]!, kind: 1,
    });
  }

  billboard(halfW: number, halfD: number, y0: number, y1: number): void {
    const want = this.p.holo ?? 0;
    if (want <= 0 || y1 - y0 < 28) return;
    const f: Face = halfW >= halfD ? 0 : 1;
    const [nx, nz] = FN[f];
    const half = f % 2 === 0 ? halfD : halfW;
    const len = f % 2 === 0 ? halfW * 2 : halfD * 2;
    const bw = clamp(len * 0.42, 16, 22);
    const bh = clamp((y1 - y0) * 0.22, 10, 16);
    const y = y0 + (y1 - y0) * 0.46;
    const lx = f % 2 === 0 ? 0 : nx * (half + 0.6);
    const lz = f % 2 === 0 ? nz * (half + 0.6) : 0;
    this.parts.holos.push({ lx, lz, y, face: f, w: bw, h: bh, rank: 1, kind: 'shaft' });
    this.parts.signs.push({ lx, lz, y, face: f, w: bw, h: bh, color: this.home > 0.5 ? 2 : 5, kind: 2 });
    if (want > 1 && this.show2) {
      const f2 = ((f + 1) % 4) as Face;
      const [nx2, nz2] = FN[f2];
      const half2 = f2 % 2 === 0 ? halfD : halfW;
      const lx2 = f2 % 2 === 0 ? halfW * 0.2 : nx2 * (half2 + 0.6);
      const lz2 = f2 % 2 === 0 ? nz2 * (half2 + 0.6) : halfD * 0.2;
      this.parts.signs.push({ lx: lx2, lz: lz2, y: y0 + 18, face: f2, w: 10, h: 7, color: 0, kind: 2 });
    }
  }

  run(): MegablockParts {
    const form = this.p.form;
    if (form === 'courtyard') this.courtyard();
    else if (form === 'bar') this.bar();
    else if (form === 'slab-podium') this.slabPodium();
    else this.cantilever();
    this.parts.walkYs.sort((a, b) => a - b);
    return this.parts;
  }

  usableWalks(y0: number, y1: number): number[] {
    const raw = this.p.walkAt ?? [];
    const out: number[] = [];
    for (const y of raw) if (y > y0 + 4 && y < y1 - 6) out.push(y);
    // a private upper deck so a tall mass still has a lit line when the street decks sit low
    const upper = y0 + (y1 - y0) * 0.62;
    if (upper < y1 - 8 && (out.length === 0 || upper > out[out.length - 1]! + 18)) out.push(upper);
    return out.slice(0, this.compact ? 2 : 3);
  }

  cantilever(): void {
    const r = this.r;
    const { w, d, height } = this.p;
    const split = r.range(0.3, 0.44);
    const baseS = r.range(0.68, 0.8);
    const baseH = height * split;
    const bw = w * baseS, bd = d * baseS;
    const shift = r.range(-0.04, 0.05) * w;
    const shiftZ = r.range(-0.03, 0.04) * d;
    const uw = w * 0.94, ud = d * 0.94;
    // keep the shifted upper mass inside the footprint
    const lx = clamp(shift, -(w - uw) / 2, (w - uw) / 2);
    const lz = clamp(shiftZ, -(d - ud) / 2, (d - ud) / 2);
    const style = FAMILY_STYLE[this.p.family];
    const mass = this.face(style);
    const base = this.face(style, this.lit * 0.85, this.tint * 0.95);
    this.box(0, 0, 0, bw, bd, baseH, base, 0);
    this.box(lx, lz, baseH, uw, ud, height - baseH, mass, 0);
    this.collide(0, 0, bw, bd, 0, baseH);
    this.collide(lx, lz, uw, ud, baseH, height);
    this.parts.baseHalfW = bw / 2;
    this.parts.baseHalfD = bd / 2;
    this.parts.roof = height;
    if (!this.simple) {
      this.box(lx, lz, baseH - 1.1, uw + 1.2, ud + 1.2, 2.2, this.face(Style.Solid, 0, this.tint * 0.8), 1);
      this.soffit(uw / 2, ud / 2, baseH);
      this.family(style, uw, ud, baseH + 2, height - 2);
      const core = Math.min(9, Math.min(w, d) * 0.16);
      this.box(w * 0.22, -d * 0.16, height, core, core, r.range(6, 14), this.face(Style.Slit, 0.35, this.tint), 1);
      this.parts.top = height + 14;
    }
    this.decks(uw / 2, ud / 2, this.usableWalks(baseH, height));
    this.shops(bw / 2, bd / 2, Math.min(baseH, 12));
    this.billboard(uw / 2, ud / 2, baseH, height);
    this.roofClutter(height, uw / 2 - 1, ud / 2 - 1);
  }

  slabPodium(): void {
    const r = this.r;
    const { w, d, height } = this.p;
    const podH = clamp(r.range(16, 30), 14, height * 0.34);
    const arcade = 6.4;
    const bw = w * 0.84, bd = d * 0.84;
    const slab = r.range(0.58, 0.76);
    const sw = w * slab, sd = d * slab;
    const lx = clamp(r.range(-0.06, 0.06) * w, -(w - sw) / 2, (w - sw) / 2);
    const lz = clamp(r.range(-0.05, 0.05) * d, -(d - sd) / 2, (d - sd) / 2);
    const style = FAMILY_STYLE[this.p.family];
    this.box(0, 0, 0, bw, bd, arcade, this.face(Style.Megablock, this.lit * 0.7, this.tint), 0);
    this.box(0, 0, arcade, w * 0.98, d * 0.98, podH - arcade, this.face(Style.Megablock, this.lit * 0.55, this.tint * 0.9), 0);
    this.box(lx, lz, podH, sw, sd, height - podH, this.face(style), 0);
    this.collide(0, 0, bw, bd, 0, arcade);
    this.collide(0, 0, w * 0.98, d * 0.98, arcade, podH);
    this.collide(lx, lz, sw, sd, podH, height);
    this.parts.baseHalfW = bw / 2;
    this.parts.baseHalfD = bd / 2;
    this.parts.roof = height;
    if (!this.simple) {
      this.soffit(w * 0.49, d * 0.49, arcade);
      // four corner piers under the podium overhang
      const pier = this.face(Style.Solid, 0, this.tint * 0.75);
      const ox = w * 0.49 - 1.3, oz = d * 0.49 - 1.3;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(sx * ox, sz * oz, 0, 1.5, 1.5, arcade, pier, 1);
      this.family(style, sw, sd, podH + 1, height - 2);
      this.box(0, 0, podH - 1.4, w + 0.8, d + 0.8, 1.8, this.face(Style.Solid, 0.05, this.tint * 0.7), 1);
    }
    this.decks(sw / 2, sd / 2, this.usableWalks(podH, height));
    // a lip deck on the podium roof, the public terrace
    if (!this.simple) this.decks(w * 0.49, d * 0.49, [podH].filter((y) => y > 12));
    this.shops(bw / 2, bd / 2, arcade);
    this.billboard(sw / 2, sd / 2, podH, height);
    this.roofClutter(height, sw / 2 - 1, sd / 2 - 1);
  }

  bar(): void {
    const r = this.r;
    const { w, d, height } = this.p;
    const split = r.range(0.36, 0.5);
    const bw = w * r.range(0.72, 0.84), bd = d * r.range(0.7, 0.82);
    const style = FAMILY_STYLE[this.p.family];
    const baseH = height * split;
    this.box(0, 0, 0, bw, bd, baseH, this.face(style, this.lit * 0.8), 0);
    this.box(0, 0, baseH, w * 0.96, d * 0.96, height - baseH, this.face(style), 0);
    this.collide(0, 0, bw, bd, 0, baseH);
    this.collide(0, 0, w * 0.96, d * 0.96, baseH, height);
    this.parts.baseHalfW = bw / 2;
    this.parts.baseHalfD = bd / 2;
    this.parts.roof = height;
    if (!this.simple) {
      this.soffit(w * 0.48, d * 0.48, baseH);
      this.family(style, w * 0.96, d * 0.96, baseH + 1, height - 2);
      if (this.home > 0.4) this.balconies(w * 0.48, d * 0.48, baseH, height);
    }
    this.decks(w * 0.48, d * 0.48, this.usableWalks(baseH, height));
    this.shops(bw / 2, bd / 2, Math.min(10, baseH));
    this.billboard(w * 0.48, d * 0.48, baseH, height);
    this.roofClutter(height, w * 0.46, d * 0.46);
  }

  balconies(halfW: number, halfD: number, y0: number, y1: number): void {
    const faces = this.longFaces(halfW * 2, halfD * 2);
    const step = 14;
    let n = 0;
    for (let y = y0 + 8; y < y1 - 6 && n < (this.compact ? 4 : 8); y += step, n++) {
      for (const f of faces) {
        const half = f % 2 === 0 ? halfD : halfW;
        const len = (f % 2 === 0 ? halfW : halfD) * 1.4;
        this.proud(f, half, 0, y, Math.max(4, len), 1.3, 0.7, this.face(Style.Solid, 0.12, this.tint), 2);
      }
    }
  }

  courtyard(): void {
    const r = this.r;
    const { w, d, height } = this.p;
    const t = clamp(Math.min(w, d) * r.range(0.2, 0.3), 8, Math.min(w, d) * 0.36);
    const style = FAMILY_STYLE[this.p.family];
    const mass = this.face(style, this.lit * (0.45 + this.home * 0.25));
    // four wings, corners shared by the long pair so the court stays open
    const wings: Array<[number, number, number, number]> = [
      [0, d / 2 - t / 2, w, t],
      [0, -d / 2 + t / 2, w, t],
      [w / 2 - t / 2, 0, t, d - t * 2],
      [-w / 2 + t / 2, 0, t, d - t * 2],
    ];
    for (const [lx, lz, ww, dd] of wings) {
      if (ww < 4 || dd < 4) continue;
      this.box(lx, lz, 0, ww, dd, height, mass, 0);
      this.collide(lx, lz, ww, dd, 0, height);
    }
    this.parts.baseHalfW = w / 2;
    this.parts.baseHalfD = d / 2;
    this.parts.court = { halfW: Math.max(2, w / 2 - t), halfD: Math.max(2, d / 2 - t) };
    this.parts.roof = height;
    if (!this.simple) {
      this.family(style, w, d, 2, height - 2);
      if (this.home > 0.35) this.balconies(w / 2, d / 2, 6, height);
      // a bridge across the court at mid height, the residential "laundry walk"
      const y = height * 0.55;
      if (y > 12 && this.parts.court.halfW > 4) {
        this.box(0, 0, y, t * 0.7, d - t * 2, 1.2, this.face(Style.Solid, 0.08, this.tint), 1);
        this.box(0, 0, y + 1.05, t * 0.7, d - t * 2, 0.5, this.face(Style.Glow, 0.4, 1.15), 2);
      }
    }
    this.decks(w / 2, d / 2, this.usableWalks(8, height).slice(0, 1));
    this.shops(w / 2 - 1, d / 2 - 1, 8);
    this.roofClutter(height, w / 2 - t * 0.4, t * 0.35);
  }
}

export function buildMegablock(plan: MegablockPlan, sink: MassSink): MegablockParts {
  return new Builder(plan, sink).run();
}
