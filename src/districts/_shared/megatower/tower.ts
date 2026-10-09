// Pure module (worker-safe). Modular megatower kit: podium, shaft segments with setbacks, mechanical floors,
// pilasters, fins, raking buttresses, crowns, masts, pads, hologram slots, neon slots and aviation lights.
// One plan → the same parts at every LOD. The sink's maxDetail decides how much of it becomes geometry.
//
// Tower frame: origin at the base centre on the ground, +Y up, local X = width `w`, local Z = depth `d`.
// Faces: 0 = +Z (front, the entrance), 1 = +X, 2 = −Z, 3 = −X.
import { Rng } from '../../../core/rng';
import { Style } from '../../../world/fabric/types';
import { kitBox, type FaceStyle, type KitDetail, type MassSink } from './sink';

export type TowerForm = 'slab' | 'stepped' | 'cross' | 'twin' | 'stack' | 'blade';
export type CrownKind = 'hammer' | 'stepped' | 'lantern' | 'flare' | 'blade' | 'cage' | 'ziggurat';
/** red: synchronised 0.5 Hz obstruction flash · steady: red · strobe: white double flash · pad: amber · warm: floodlight. */
export type LightKind = 'red' | 'steady' | 'strobe' | 'pad' | 'police' | 'warm';
export type Face = 0 | 1 | 2 | 3;

export interface TowerPlan {
  /** 0..1, drives every random choice. */
  seed: number;
  /** Roof of the crown (m). Mast extra. */
  height: number;
  /** Shaft footprint at the podium roof. */
  w: number;
  d: number;
  podium?: { w: number; d: number; h: number } | null;
  form: TowerForm;
  crown: CrownKind;
  crownH?: number;
  /** Mast above the crown (m). 0 = none. */
  mast?: number;
  /** Fin spacing in metres on the long faces. 0 = none. */
  fins?: number;
  buttress?: boolean;
  /** Night lit fraction of ordinary windows, 0..1. */
  lit?: number;
  tint?: number;
  /** Hologram slots wanted (crown first, then shaft, gap, podium). */
  holo?: number;
  pads?: boolean;
  /** Mechanical floor spacing (m). */
  mechEvery?: number;
  /** Fabric towers: fewer, larger pieces and no hero clutter. */
  compact?: boolean;
  /** Rooftop flame stacks (1982 homage). */
  flames?: boolean;
  /** Spandrel ledge spacing (m). Default 18–26 m on full towers, none on compact ones; 0 = none. */
  ledges?: number;
}

export interface KitCollider { lx: number; lz: number; hw: number; hd: number; y0: number; top: number }
export interface KitHolo { lx: number; lz: number; y: number; face: Face; w: number; h: number; rank: 0 | 1 | 2; kind: 'crown' | 'shaft' | 'gap' | 'podium' | 'bridge' }
export interface KitLight { lx: number; y: number; lz: number; kind: LightKind }
export interface KitSign { lx: number; lz: number; y: number; face: Face; w: number; h: number; color: number; kind: 0 | 1 | 2 }
export interface KitFlame { lx: number; y: number; lz: number; size: number }

export interface TowerParts {
  colliders: KitCollider[];
  holos: KitHolo[];
  lights: KitLight[];
  signs: KitSign[];
  flames: KitFlame[];
  /** Crown roof (m). */
  roof: number;
  /** Highest point including the mast (m). */
  top: number;
  /** Footprint half-extents incl. podium and buttresses (m). */
  halfW: number;
  halfD: number;
}

/** A rectangular (or tapering) mass. w1/d1 are the top dimensions. */
interface Seg {
  lx: number; lz: number;
  w: number; d: number; w1: number; d1: number;
  y0: number; y1: number;
  style: number; lit: number;
  fins: number;
  finFaces: number;
  pilasters: boolean;
}

const FN: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const NEON = [0, 1, 2, 5, 6, 3, 4];

const st = (style: number, lit: number, tint: number, seed: number): FaceStyle => ({ style, lit, tint, seed });
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

class Builder {
  readonly parts: TowerParts;
  readonly r: Rng;
  readonly lit: number;
  readonly tint: number;
  readonly ledgeEvery: number;
  private k = 0;

  constructor(readonly p: TowerPlan, readonly sink: MassSink) {
    this.r = new Rng(Math.floor(p.seed * 4294967295) ^ 0x5bd1e995);
    this.lit = p.lit ?? 0.42;
    this.tint = p.tint ?? 0.9;
    this.ledgeEvery = p.ledges ?? (p.compact ? 0 : this.r.range(18, 26));
    this.parts = { colliders: [], holos: [], lights: [], signs: [], flames: [], roof: p.height, top: p.height, halfW: p.w / 2, halfD: p.d / 2 };
  }

  /** Distinct facade seed per piece group so neighbouring masses do not share a window lottery. */
  face(style: number, lit = this.lit, tint = this.tint): FaceStyle {
    this.k++;
    return st(style, lit, tint, (this.p.seed * 7.31 + this.k * 0.137) % 1);
  }

  get lod0(): boolean { return this.sink.maxDetail >= 2; }
  get simple(): boolean { return this.sink.maxDetail === 0; }

  box(lx: number, lz: number, y0: number, w: number, d: number, h: number, s: FaceStyle, detail: KitDetail, cap = true): void {
    if (h <= 0.01 || w <= 0.01 || d <= 0.01) return;
    kitBox(this.sink, lx, lz, y0, w, d, h, s, detail, cap);
  }

  collide(lx: number, lz: number, w: number, d: number, y0: number, top: number): void {
    this.parts.colliders.push({ lx, lz, hw: w / 2, hd: d / 2, y0, top });
  }

  light(lx: number, y: number, lz: number, kind: LightKind): void {
    this.parts.lights.push({ lx, y, lz, kind });
  }

  // ------------------------------------------------------------------ podium
  podium(): void {
    const pd = this.p.podium;
    if (!pd) return;
    const r = this.r;
    const arcadeH = clamp(pd.h * 0.22, 8, 12.5);
    const inset = clamp(Math.min(pd.w, pd.d) * 0.045, 4.5, 8);
    const heavy = this.face(Style.Megablock, this.lit * 0.9, this.tint * 1.05);
    const shops = this.face(Style.Market, 0.75, 0.95);
    this.parts.halfW = Math.max(this.parts.halfW, pd.w / 2);
    this.parts.halfD = Math.max(this.parts.halfD, pd.d / 2);
    if (this.simple) {
      this.box(0, 0, 0, pd.w, pd.d, pd.h, heavy, 0);
    } else {
      // street arcade: the podium overhangs a recessed shop/lobby floor
      this.box(0, 0, 0, pd.w - inset * 2, pd.d - inset * 2, arcadeH, shops, 0);
      this.box(0, 0, arcadeH, pd.w, pd.d, pd.h - arcadeH, heavy, 0);
      // cornice and parapet
      this.box(0, 0, pd.h - 2.4, pd.w + 1.6, pd.d + 1.6, 2.4, this.face(Style.Solid, 0, this.tint), 1);
    }
    this.collide(0, 0, pd.w - inset * 2, pd.d - inset * 2, 0, arcadeH);
    this.collide(0, 0, pd.w, pd.d, arcadeH, pd.h);

    // piers under the overhang, with a cold soffit strip. Colliders so walkers weave between them.
    const pier = this.face(Style.Solid, 0, this.tint * 0.9);
    const soffit = this.face(Style.Glow, 0.32, 1.85);
    for (let f = 0 as Face; f < 4; f = (f + 1) as Face) {
      const len = f % 2 === 0 ? pd.w : pd.d;
      const half = f % 2 === 0 ? pd.d / 2 : pd.w / 2;
      const [nx, nz] = FN[f];
      const tx = f % 2 === 0 ? 1 : 0, tz = 1 - tx;
      const n = Math.max(2, Math.floor(len / (this.p.compact ? 19 : 9.5)));
      const step = (len - 3) / n;
      for (let i = 0; i <= n; i++) {
        const a = -len / 2 + 1.5 + i * step;
        const x = nx * (half - 1.4) + tx * a, z = nz * (half - 1.4) + tz * a;
        this.box(x, z, 0, 1.8, 1.8, arcadeH, pier, 2);
        this.collide(x, z, 1.8, 1.8, 0, arcadeH);
      }
      // soffit light strip under the overhang edge
      const sx = nx * (half - inset * 0.55), sz = nz * (half - inset * 0.55);
      this.box(sx, sz, arcadeH - 0.7, f % 2 === 0 ? len - inset * 2 : 0.8, f % 2 === 0 ? 0.8 : len - inset * 2, 0.5, soffit, 2);
    }

    // entrance portal on the front face: glowing lobby, deep canopy, two pylons
    const portalW = clamp(pd.w * 0.28, 22, 60);
    const lobby = this.face(Style.Glow, 0.55, 1.15);
    const front = pd.d / 2;
    this.box(0, front - inset - 0.4, 0, portalW, 1.2, arcadeH * 1.65, lobby, 1);
    this.box(0, front + 6, arcadeH * 1.65, portalW + 12, 14 + inset, 1.6, this.face(Style.Solid, 0, this.tint * 0.8), 1);
    const pylon = this.face(Style.Slit, 0.35, this.tint);
    for (const s of [-1, 1]) {
      const x = s * (portalW / 2 + 4);
      this.box(x, front + 2, 0, 6, 6, pd.h * 0.92, pylon, 1);
      this.collide(x, front + 2, 6, 6, 0, pd.h * 0.92);
    }
    this.parts.signs.push({ lx: 0, lz: front + 2.2, y: arcadeH * 1.65 + 4.2, face: 0, w: portalW * 0.7, h: 3.2, color: r.pick([6, 1, 2]), kind: 0 });
    // shop blades along the arcade on all faces
    for (let f = 0 as Face; f < 4; f = (f + 1) as Face) {
      const len = f % 2 === 0 ? pd.w : pd.d;
      const half = f % 2 === 0 ? pd.d / 2 : pd.w / 2;
      const [nx, nz] = FN[f];
      const tx = f % 2 === 0 ? 1 : 0, tz = 1 - tx;
      const count = Math.floor(len / 34);
      for (let i = 0; i < count; i++) {
        const a = -len / 2 + (i + 0.5) * (len / count) + r.range(-4, 4);
        if (f === 0 && Math.abs(a) < portalW / 2 + 8) continue;
        const blade = r.chance(0.55);
        this.parts.signs.push({
          lx: nx * (half + 0.4) + tx * a, lz: nz * (half + 0.4) + tz * a,
          y: blade ? arcadeH + r.range(4, 9) : arcadeH * r.range(0.55, 0.8), face: f,
          w: blade ? r.range(1.4, 2.2) : r.range(5, 11), h: blade ? r.range(6, 13) : r.range(1.2, 2.4),
          color: r.pick(NEON), kind: blade ? 1 : 0,
        });
      }
    }

    // podium roof plant: cooling towers, louvre boxes, skylight glow
    if (this.p.compact) return;
    const plant = this.face(Style.Industrial, 0.05, 0.85);
    const n = Math.floor((pd.w * pd.d) / 2600);
    for (let i = 0; i < n; i++) {
      const x = r.range(-pd.w * 0.45, pd.w * 0.45), z = r.range(-pd.d * 0.45, pd.d * 0.45);
      if (Math.abs(x) < this.p.w * 0.55 && Math.abs(z) < this.p.d * 0.55) continue;
      const big = r.chance(0.3);
      this.box(x, z, pd.h, big ? r.range(9, 16) : r.range(3, 7), big ? r.range(9, 16) : r.range(3, 7), big ? r.range(6, 11) : r.range(2, 4), plant, 3);
    }
  }

  // ------------------------------------------------------------------ segments
  emitSeg(s: Seg): void {
    const taper = s.w1 !== s.w || s.d1 !== s.d;
    const style = this.face(s.style, s.lit);
    const mechEvery = this.p.mechEvery ?? (this.p.compact ? 1e9 : this.r.range(120, 170));
    const mechH = 9;
    // mechanical floors on a global schedule so bands line up between segments
    const bands: number[] = [];
    if (!this.simple) {
      for (let y = mechEvery; y < s.y1 - 18; y += mechEvery) if (y > s.y0 + 18) bands.push(y);
    }
    const dimAt = (y: number): [number, number] => {
      const t = (y - s.y0) / Math.max(1, s.y1 - s.y0);
      return [s.w + (s.w1 - s.w) * t, s.d + (s.d1 - s.d) * t];
    };
    let y = s.y0;
    const mech = this.face(Style.Industrial, 0.06, this.tint * 0.8);
    for (const b of bands) {
      const [wa, da] = dimAt(y), [wb, db] = dimAt(b);
      this.sink.frustum(s.lx, s.lz, y, wa, da, wb, db, b - y, style, 0, false);
      const [wc, dc] = dimAt(b + mechH);
      this.sink.frustum(s.lx, s.lz, b, wb - 4.4, db - 4.4, wc - 4.4, dc - 4.4, mechH, mech, 0, false);
      // louvres across the recess
      if (this.lod0 && !taper) this.louvres(s.lx, s.lz, b, wb - 4.4, db - 4.4, mechH);
      y = b + mechH;
    }
    const [wa, da] = dimAt(y);
    this.sink.frustum(s.lx, s.lz, y, wa, da, s.w1, s.d1, s.y1 - y, style, 0, true);

    // spandrel ledges: thin slabs proud of the face every few floors, the horizontal banding of the film's slabs.
    // Every third one survives into LOD1 so the banding does not pop at the switch.
    if (!this.simple && !this.p.compact && this.ledgeEvery > 0) {
      const ledge = this.face(Style.Solid, 0, this.tint * 0.78);
      let n = 0;
      for (let ly = Math.ceil((s.y0 + 10) / this.ledgeEvery) * this.ledgeEvery; ly < s.y1 - 8; ly += this.ledgeEvery, n++) {
        if (bands.some((b) => ly > b - 3 && ly < b + mechH + 3)) continue;
        const [lw, ld] = dimAt(ly);
        this.box(s.lx, s.lz, ly, lw + 1.6, ld + 1.6, 1.1, ledge, n % 3 === 0 ? 1 : 2);
      }
    }

    if (!taper && s.pilasters && !this.simple) {
      const pw = clamp(Math.min(s.w, s.d) * 0.06, 2.5, 7);
      const pil = this.face(Style.Slit, this.lit * 0.6, this.tint * 1.1);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        this.box(s.lx + sx * (s.w / 2 - pw / 2 + 0.9), s.lz + sz * (s.d / 2 - pw / 2 + 0.9), s.y0, pw, pw, s.y1 - s.y0 + 1.2, pil, 1);
      }
    }
    if (!taper && s.fins > 0 && !this.simple) this.fins(s);
    // cornice where the segment is a terrace
    if (!this.simple) this.box(s.lx, s.lz, s.y1 - 2.2, s.w1 + 1.6, s.d1 + 1.6, 2.2, this.face(Style.Solid, 0, this.tint * 0.85), 1);
    this.collide(s.lx, s.lz, Math.max(s.w, s.w1), Math.max(s.d, s.d1), s.y0, s.y1);
    this.parts.halfW = Math.max(this.parts.halfW, Math.abs(s.lx) + Math.max(s.w, s.w1) / 2);
    this.parts.halfD = Math.max(this.parts.halfD, Math.abs(s.lz) + Math.max(s.d, s.d1) / 2);
  }

  louvres(lx: number, lz: number, y: number, w: number, d: number, h: number): void {
    const lv = this.face(Style.Solid, 0, this.tint * 0.7);
    const n = Math.floor(w / 3.2), m = Math.floor(d / 3.2);
    for (let i = 0; i < n; i += 1) {
      const x = lx - w / 2 + (i + 0.5) * (w / n);
      this.box(x, lz + d / 2 + 0.6, y + 0.6, 0.35, 1.2, h - 1.2, lv, 3, false);
      this.box(x, lz - d / 2 - 0.6, y + 0.6, 0.35, 1.2, h - 1.2, lv, 3, false);
    }
    for (let i = 0; i < m; i += 1) {
      const z = lz - d / 2 + (i + 0.5) * (d / m);
      this.box(lx + w / 2 + 0.6, z, y + 0.6, 1.2, 0.35, h - 1.2, lv, 3, false);
      this.box(lx - w / 2 - 0.6, z, y + 0.6, 1.2, 0.35, h - 1.2, lv, 3, false);
    }
  }

  fins(s: Seg): void {
    const fin = this.face(Style.Slit, this.lit * 0.5, this.tint * 1.05);
    const depth = clamp(s.fins * 0.2, 1.4, 4.2);
    const thick = clamp(s.fins * 0.1, 0.9, 1.8);
    for (let f = 0 as Face; f < 4; f = (f + 1) as Face) {
      if (!(s.finFaces & (1 << f))) continue;
      const len = f % 2 === 0 ? s.w : s.d;
      const half = f % 2 === 0 ? s.d / 2 : s.w / 2;
      const [nx, nz] = FN[f];
      const n = Math.floor((len - 10) / s.fins);
      if (n < 1) continue;
      const step = (len - 10) / n;
      for (let i = 0; i <= n; i++) {
        const a = -len / 2 + 5 + i * step;
        const x = s.lx + nx * (half + depth / 2) + (f % 2 === 0 ? a : 0);
        const z = s.lz + nz * (half + depth / 2) + (f % 2 === 0 ? 0 : a);
        this.box(x, z, s.y0, f % 2 === 0 ? thick : depth, f % 2 === 0 ? depth : thick, s.y1 - s.y0 - 2.2, fin, i % 2 === 0 ? 1 : 2, false);
      }
    }
  }

  /** Raking buttress centred on a face plane: half buried, the outer half slopes from `proj` to ~2 m. */
  buttress(lx: number, lz: number, f: Face, width: number, proj: number, h: number, detail: KitDetail): void {
    const bs = this.face(Style.Slit, this.lit * 0.35, this.tint * 1.12);
    const w0 = f % 2 === 0 ? width : proj * 2, d0 = f % 2 === 0 ? proj * 2 : width;
    const w1 = f % 2 === 0 ? width * 0.7 : 3, d1 = f % 2 === 0 ? 3 : width * 0.7;
    this.sink.frustum(lx, lz, 0, w0, d0, w1, d1, h, bs, detail);
    const [nx, nz] = FN[f];
    // lower third as collider (walkers / spinners bounce off the toe)
    this.collide(lx + nx * proj * 0.4, lz + nz * proj * 0.4, f % 2 === 0 ? width : proj * 0.8, f % 2 === 0 ? proj * 0.8 : width, 0, h * 0.35);
    this.parts.halfW = Math.max(this.parts.halfW, Math.abs(lx) + w0 / 2);
    this.parts.halfD = Math.max(this.parts.halfD, Math.abs(lz) + d0 / 2);
  }

  cornerLights(lx: number, lz: number, w: number, d: number, y: number, kind: LightKind): void {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) this.light(lx + sx * (w / 2 + 0.5), y + 0.8, lz + sz * (d / 2 + 0.5), kind);
  }

  /** Obstruction lights up the corners of a mass every ~110 m, the way tall structures are marked. */
  ladderLights(s: Seg): void {
    const span = s.y1 - s.y0;
    const n = Math.floor(span / 110);
    for (let i = 1; i <= n; i++) {
      const y = s.y0 + (span * i) / (n + 1);
      const t = (y - s.y0) / span;
      this.cornerLights(s.lx, s.lz, s.w + (s.w1 - s.w) * t, s.d + (s.d1 - s.d) * t, y, 'steady');
    }
    this.cornerLights(s.lx, s.lz, s.w1, s.d1, s.y1, 'red');
  }

  pad(lx: number, lz: number, y: number, size: number): void {
    this.box(lx, lz, y, size, size, 1.2, this.face(Style.Industrial, 0, 0.7), 1);
    this.collide(lx, lz, size, size, y, y + 1.2);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) this.light(lx + (sx * size) / 2, y + 1.4, lz + (sz * size) / 2, 'pad');
  }

  holo(h: KitHolo): void {
    if (this.parts.holos.length >= (this.p.holo ?? 0)) return;
    this.parts.holos.push(h);
    // projector rig: a dark frame so the slot reads as hardware when the tier culls the figure
    if (this.simple) return;
    const rig = this.face(Style.Industrial, 0.15, 0.6);
    const [nx, nz] = FN[h.face];
    const tx = h.face % 2 === 0 ? 1 : 0, tz = 1 - tx;
    const ox = h.lx - nx * 0.6, oz = h.lz - nz * 0.6;
    const along = (a: number, wa: number, wn: number): [number, number, number, number] =>
      [ox + tx * a, oz + tz * a, h.face % 2 === 0 ? wa : wn, h.face % 2 === 0 ? wn : wa];
    const [x1, z1, w1, d1] = along(0, h.w + 3, 1.6);
    this.box(x1, z1, h.y - h.h / 2 - 1.8, w1, d1, 1.8, rig, 2);
    this.box(x1, z1, h.y + h.h / 2, w1, d1, 1.8, rig, 2);
    for (const s of [-1, 1]) {
      const [x2, z2, w2, d2] = along((s * (h.w + 1.5)) / 2, 1.5, 1.6);
      this.box(x2, z2, h.y - h.h / 2, w2, d2, h.h, rig, 2);
    }
  }

  // ------------------------------------------------------------------ crowns
  crown(kind: CrownKind, lx: number, lz: number, cw: number, cd: number, y: number, ch: number, holoFace: Face): void {
    const r = this.r;
    const solid = this.face(Style.Solid, 0, this.tint * 0.85);
    const glowWarm = this.face(Style.Glow, 0.7, 1.0);
    const glowCold = this.face(Style.Glow, 0.55, 1.8);
    const front = (w: number, d: number, f: Face): [number, number, number] => {
      const [nx, nz] = FN[f];
      return [lx + nx * (w / 2 + 1.6), lz + nz * (d / 2 + 1.6), f % 2 === 0 ? w : d];
    };
    let top = y + ch;
    switch (kind) {
      case 'hammer': {
        const hw = cw * 1.14, hd = cd * 1.2;
        this.box(lx, lz, y, cw * 0.94, cd * 0.94, ch * 0.14, this.face(Style.Industrial, 0.05, 0.75), 0);
        this.box(lx, lz, y + ch * 0.14, hw, hd, ch * 0.7, this.face(Style.Megablock, this.lit * 0.7, this.tint), 0);
        this.box(lx, lz, y + ch * 0.14 - 1.1, hw - 3, hd - 3, 1.1, glowCold, 1);
        this.box(lx, lz, y + ch * 0.84, cw * 0.5, cd * 0.46, ch * 0.16, this.face(Style.Industrial, 0.1, 0.8), 1);
        if (this.lod0) this.louvres(lx, lz, y + ch * 0.84, cw * 0.5, cd * 0.46, ch * 0.16);
        this.collide(lx, lz, hw, hd, y, y + ch);
        const [hx, hz, fl] = front(hw, hd, holoFace);
        this.holo({ lx: hx, lz: hz, y: y + ch * 0.49, face: holoFace, w: Math.min(fl * 0.72, 120), h: ch * 0.5, rank: 0, kind: 'crown' });
        this.cornerLights(lx, lz, hw, hd, y + ch * 0.84, 'red');
        if (this.p.pads) this.pad(lx + hw * 0.3, lz - hd * 0.25, y + ch * 0.84, Math.min(26, hd * 0.3));
        break;
      }
      case 'stepped':
      case 'ziggurat': {
        const steps = kind === 'ziggurat' ? 4 : 3;
        const scales = kind === 'ziggurat' ? [0.86, 0.7, 0.54, 0.38] : [0.8, 0.62, 0.44];
        for (let i = 0; i < steps; i++) {
          const s = scales[i];
          const y0 = y + (ch * i) / steps;
          this.box(lx, lz, y0, cw * s, cd * s, ch / steps, this.face(i % 2 ? Style.Ribbon : Style.Office, this.lit * 0.8), 0);
          this.box(lx, lz, y0 + 1.5, cw * s + 0.6, cd * s + 0.6, 1.6, i % 2 ? glowCold : glowWarm, 1);
          this.collide(lx, lz, cw * s, cd * s, y0, y0 + ch / steps);
          this.cornerLights(lx, lz, cw * s, cd * s, y0 + ch / steps, i === steps - 1 ? 'red' : 'steady');
        }
        const [hx, hz, fl] = front(cw * scales[0], cd * scales[0], holoFace);
        this.holo({ lx: hx, lz: hz, y: y + ch * 0.17, face: holoFace, w: Math.min(fl * 0.7, 100), h: ch * 0.3, rank: 0, kind: 'crown' });
        if (kind === 'ziggurat' && this.p.flames) {
          for (const s of [-1, 1]) {
            const fx = lx + s * cw * 0.2;
            this.box(fx, lz, top, 3.5, 3.5, 22, this.face(Style.Industrial, 0, 0.6), 1);
            this.parts.flames.push({ lx: fx, y: top + 26, lz, size: 9 });
          }
        }
        break;
      }
      case 'lantern': {
        this.box(lx, lz, y, cw * 0.84, cd * 0.84, ch * 0.7, glowWarm, 0);
        const mull = this.face(Style.Solid, 0, this.tint * 0.7);
        if (!this.simple) {
          for (let f = 0 as Face; f < 4; f = (f + 1) as Face) {
            const len = f % 2 === 0 ? cw * 0.84 : cd * 0.84;
            const half = f % 2 === 0 ? cd * 0.42 : cw * 0.42;
            const [nx, nz] = FN[f];
            const n = Math.floor(len / 6.5);
            for (let i = 0; i <= n; i++) {
              const a = -len / 2 + (i * len) / n;
              const x = lx + nx * (half + 0.7) + (f % 2 === 0 ? a : 0), z = lz + nz * (half + 0.7) + (f % 2 === 0 ? 0 : a);
              this.box(x, z, y, f % 2 === 0 ? 0.9 : 1.4, f % 2 === 0 ? 1.4 : 0.9, ch * 0.7, mull, i % 3 === 0 ? 1 : 2, false);
            }
          }
        }
        this.box(lx, lz, y + ch * 0.7, cw * 0.98, cd * 0.98, ch * 0.12, solid, 0);
        this.box(lx, lz, y + ch * 0.82, cw * 0.6, cd * 0.6, ch * 0.18, this.face(Style.Industrial, 0.08, 0.8), 0);
        this.collide(lx, lz, cw * 0.98, cd * 0.98, y, y + ch);
        const [hx, hz, fl] = front(cw * 0.98, cd * 0.98, holoFace);
        this.holo({ lx: hx, lz: hz, y: y + ch * 0.38, face: holoFace, w: Math.min(fl * 0.62, 100), h: ch * 0.5, rank: 0, kind: 'crown' });
        this.cornerLights(lx, lz, cw * 0.98, cd * 0.98, y + ch * 0.82, 'red');
        break;
      }
      case 'flare': {
        this.sink.frustum(lx, lz, y, cw * 0.8, cd * 0.8, cw * 1.28, cd * 1.28, ch * 0.45, this.face(Style.Office, this.lit * 0.3), 0, false);
        this.box(lx, lz, y + ch * 0.45, cw * 1.28, cd * 1.28, ch * 0.4, this.face(Style.Ribbon, this.lit * 0.9), 0);
        this.box(lx, lz, y + ch * 0.45, cw * 1.28 + 0.6, cd * 1.28 + 0.6, 1.4, glowCold, 1);
        this.box(lx, lz, y + ch * 0.85, cw * 1.2, cd * 1.2, ch * 0.15, solid, 0);
        this.collide(lx, lz, cw * 1.28, cd * 1.28, y + ch * 0.2, y + ch);
        this.collide(lx, lz, cw * 0.9, cd * 0.9, y, y + ch * 0.2);
        const [hx, hz, fl] = front(cw * 1.28, cd * 1.28, holoFace);
        this.holo({ lx: hx, lz: hz, y: y + ch * 0.65, face: holoFace, w: Math.min(fl * 0.66, 120), h: ch * 0.36, rank: 0, kind: 'crown' });
        this.cornerLights(lx, lz, cw * 1.2, cd * 1.2, top, 'red');
        if (this.p.pads) this.pad(lx, lz, top, Math.min(30, cw * 0.5));
        break;
      }
      case 'blade': {
        this.box(lx, lz, y, cw, cd, ch * 0.12, solid, 0);
        const bt = Math.max(3, cw * 0.07);
        for (const s of [-1, 1]) {
          this.sink.frustum(lx + s * cw * 0.27, lz, y + ch * 0.12, bt, cd, bt, cd * 0.32, ch * 0.88, this.face(Style.Slit, this.lit * 0.4), 0);
          this.collide(lx + s * cw * 0.27, lz, bt, cd * 0.7, y, y + ch * 0.8);
        }
        this.box(lx, lz, y + ch * 0.12, cw * 0.4, cd * 0.42, ch * 0.55, glowCold, 1);
        const [hx, hz, fl] = front(cw * 0.4, cd * 0.42, holoFace);
        this.holo({ lx: hx, lz: hz, y: y + ch * 0.4, face: holoFace, w: Math.min(fl * 0.95, 70), h: ch * 0.5, rank: 0, kind: 'crown' });
        for (const s of [-1, 1]) this.light(lx + s * cw * 0.27, top + 0.8, lz, 'red');
        break;
      }
      case 'cage': {
        this.box(lx, lz, y, cw * 0.62, cd * 0.62, ch * 0.86, glowWarm, 0);
        const col = this.face(Style.Solid, 0, this.tint * 0.75);
        const cs = Math.max(3, Math.min(cw, cd) * 0.07);
        for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          this.box(lx + sx * (cw / 2 - cs / 2), lz + sz * (cd / 2 - cs / 2), y, cs, cs, ch, col, 0);
        }
        for (const t of [0.33, 0.66, 1.0]) {
          const yy = y + ch * t - 3;
          this.box(lx, lz + cd / 2 - cs / 2, yy, cw, cs, 3, col, 1);
          this.box(lx, lz - cd / 2 + cs / 2, yy, cw, cs, 3, col, 1);
          this.box(lx + cw / 2 - cs / 2, lz, yy, cs, cd, 3, col, 1);
          this.box(lx - cw / 2 + cs / 2, lz, yy, cs, cd, 3, col, 1);
        }
        this.collide(lx, lz, cw, cd, y, y + ch);
        const [hx, hz, fl] = front(cw * 0.62, cd * 0.62, holoFace);
        this.holo({ lx: hx, lz: hz, y: y + ch * 0.45, face: holoFace, w: Math.min(fl * 0.85, 90), h: ch * 0.52, rank: 0, kind: 'crown' });
        this.cornerLights(lx, lz, cw, cd, top, 'red');
        break;
      }
    }
    top = y + ch;
    this.parts.roof = Math.max(this.parts.roof, top);
    this.parts.top = Math.max(this.parts.top, top);
    void r;
  }

  mast(lx: number, lz: number, y: number, h: number, base: number): void {
    if (h <= 0) return;
    const steel = this.face(Style.Industrial, 0.02, 0.6);
    const b = clamp(base, 6, 16);
    this.box(lx, lz, y, b, b, h * 0.1, steel, 0);
    const secs = [[0.1, 0.5, 0.42, 0.3], [0.5, 0.82, 0.28, 0.18], [0.82, 1.0, 0.16, 0.08]];
    for (const [a, c, w0, w1] of secs) {
      this.sink.frustum(lx, lz, y + h * a, b * w0, b * w0, b * w1, b * w1, h * (c - a), steel, a < 0.5 ? 0 : 1);
    }
    for (const t of [0.34, 0.62]) {
      const yy = y + h * t;
      this.box(lx, lz, yy, b * 1.4, 0.6, 0.6, steel, 2);
      this.box(lx, lz, yy, 0.6, b * 1.4, 0.6, steel, 2);
      this.light(lx + b * 0.7, yy + 0.6, lz, 'steady');
      this.light(lx - b * 0.7, yy + 0.6, lz, 'steady');
    }
    this.light(lx, y + h + 0.6, lz, 'strobe');
    this.light(lx, y + h * 0.82, lz, 'red');
    this.collide(lx, lz, b * 0.5, b * 0.5, y, y + h);
    this.parts.top = Math.max(this.parts.top, y + h);
  }

  bridge(lx0: number, lx1: number, lz: number, y: number, depth: number, h: number): void {
    const len = Math.abs(lx1 - lx0);
    const cx = (lx0 + lx1) / 2;
    this.box(cx, lz, y, len, depth, h, this.face(Style.Ribbon, Math.min(0.95, this.lit * 1.6), this.tint), 0);
    // truss: chords and diagonals reduced to a strip of ribs underneath
    if (!this.simple) {
      const steel = this.face(Style.Industrial, 0, 0.6);
      this.box(cx, lz + depth / 2 - 0.8, y - 3.5, len, 1.6, 3.5, steel, 1);
      this.box(cx, lz - depth / 2 + 0.8, y - 3.5, len, 1.6, 3.5, steel, 1);
      const n = Math.floor(len / 8);
      for (let i = 1; i < n; i++) this.box(lx0 + Math.sign(lx1 - lx0) * i * (len / n), lz, y - 3.5, 0.8, depth, 3.5, steel, 2);
    }
    this.collide(cx, lz, len, depth, y - 3.5, y + h);
  }
}

// ------------------------------------------------------------------ forms

function mainSegs(b: Builder, crownH: number): { segs: Seg[]; cw: number; cd: number; clx: number; clz: number; cy: number; extra?: () => void } {
  const p = b.p, r = b.r;
  const H = p.height;
  const P = p.podium?.h ?? 0;
  const top = H - crownH;
  const lit = b.lit;
  const fins = p.fins ?? 0;
  const long = p.w >= p.d ? 0b0101 : 0b1010;
  const seg = (lx: number, lz: number, w: number, d: number, y0: number, y1: number, style: number, o: Partial<Seg> = {}): Seg => ({
    lx, lz, w, d, w1: o.w1 ?? w, d1: o.d1 ?? d, y0, y1, style, lit: o.lit ?? lit, fins: o.fins ?? fins, finFaces: o.finFaces ?? long, pilasters: o.pilasters ?? true,
  });
  const out: Seg[] = [];
  switch (p.form) {
    case 'slab': {
      const s1 = P + (top - P) * r.range(0.32, 0.4);
      const s2 = P + (top - P) * r.range(0.66, 0.74);
      out.push(seg(0, 0, p.w, p.d, P, s1, Style.Megablock));
      out.push(seg(0, 0, p.w, p.d, s1, s2, Style.Ribbon));
      out.push(seg(0, 0, p.w * 0.9, p.d * 0.84, s2, top, Style.Office, { fins: fins * 1.5 }));
      return { segs: out, cw: p.w * 0.9, cd: p.d * 0.84, clx: 0, clz: 0, cy: top };
    }
    case 'stepped': {
      const ends = [0.34, 0.56, 0.72, 0.85, 1];
      const scales = [1, 0.84, 0.69, 0.56, 0.44];
      let y = P;
      for (let i = 0; i < ends.length; i++) {
        const y1 = P + (top - P) * ends[i];
        out.push(seg(0, 0, p.w * scales[i], p.d * scales[i], y, y1, i % 2 ? Style.Ribbon : Style.Office, { finFaces: 0b1111, fins: i < 2 ? fins : 0 }));
        y = y1;
      }
      const s = scales[scales.length - 1];
      return { segs: out, cw: p.w * s, cd: p.d * s, clx: 0, clz: 0, cy: top };
    }
    case 'cross': {
      const barX = P + (top - P) * r.range(0.68, 0.76);
      const barZ = P + (top - P) * r.range(0.84, 0.9);
      out.push(seg(0, 0, p.w * 0.52, p.d * 0.52, P, top, Style.Office, { fins: 0 }));
      out.push(seg(0, 0, p.w, p.d * 0.42, P, barX, Style.Ribbon, { finFaces: 0b1010 }));
      out.push(seg(0, 0, p.w * 0.42, p.d, P, barZ, Style.Megablock, { finFaces: 0b0101 }));
      return {
        segs: out, cw: p.w * 0.52, cd: p.d * 0.52, clx: 0, clz: 0, cy: top,
        extra: () => {
          // sculpted re-entrant corners at the base
          if (b.sink.maxDetail < 1) return;
          for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const a = p.w * 0.29;
            b.sink.frustum(sx * (p.w * 0.21 + a / 2), sz * (p.d * 0.21 + a / 2), P, a, a, 2, 2, (top - P) * 0.22, b.face(Style.Slit, lit * 0.4), 1);
          }
        },
      };
    }
    case 'twin': {
      const g = Math.max(26, p.w * 0.17);
      const sw = (p.w - g) / 2;
      const bTop = P + (top - P) * r.range(0.82, 0.88);
      out.push(seg(-(g / 2 + sw / 2), 0, sw, p.d, P, top, Style.Ribbon, { finFaces: 0b1010 }));
      out.push(seg(g / 2 + sw / 2, 0, sw, p.d, P, bTop, Style.Office, { finFaces: 0b1010 }));
      return {
        segs: out, cw: sw, cd: p.d, clx: -(g / 2 + sw / 2), clz: 0, cy: top,
        extra: () => {
          const n = Math.floor((bTop - P) / 140);
          for (let i = 1; i <= n; i++) {
            const y = P + ((bTop - P) * i) / (n + 1);
            b.bridge(-g / 2 - 1, g / 2 + 1, (i % 2 ? 1 : -1) * p.d * 0.18, y, p.d * 0.36, 13);
          }
          // gate lintel joining the shorter shaft's roof to the tall one
          b.bridge(-g / 2 - 1, g / 2 + 1, 0, bTop - 34, p.d * 0.7, 30);
          b.holo({ lx: 0, lz: p.d * 0.5 - 6, y: P + (bTop - P) * 0.42, face: 0, w: g * 0.86, h: Math.min(160, (bTop - P) * 0.2), rank: 1, kind: 'gap' });
          b.cornerLights(g / 2 + sw / 2, 0, sw, p.d, bTop, 'red');
          b.mast(g / 2 + sw / 2, 0, bTop, Math.min(70, H * 0.06), sw * 0.12);
        },
      };
    }
    case 'stack': {
      const lowTop = P + (top - P) * r.range(0.38, 0.45);
      const neckTop = lowTop + (top - P) * 0.12;
      const flareTop = neckTop + (top - P) * 0.05;
      out.push(seg(0, 0, p.w * 0.82, p.d * 0.82, P, lowTop, Style.Megablock, { finFaces: 0b1111 }));
      out.push(seg(0, 0, p.w * 0.62, p.d * 0.62, lowTop, neckTop, Style.Slit, { fins: 0, lit: lit * 0.6 }));
      out.push(seg(0, 0, p.w * 0.62, p.d * 0.62, neckTop, flareTop, Style.Office, { w1: p.w * 1.06, d1: p.d * 1.06, fins: 0, lit: lit * 0.4 }));
      out.push(seg(0, 0, p.w * 1.06, p.d * 1.06, flareTop, top, Style.Ribbon, { finFaces: 0b0101 }));
      return { segs: out, cw: p.w * 1.06, cd: p.d * 1.06, clx: 0, clz: 0, cy: top };
    }
    case 'blade': {
      const a = P + (top - P) * 0.42, c = P + (top - P) * 0.76;
      out.push(seg(0, 0, p.w, p.d, P, a, Style.Office, { w1: p.w * 0.88, d1: p.d * 0.94, fins: 0 }));
      out.push(seg(0, 0, p.w * 0.84, p.d * 0.92, a, c, Style.Ribbon, { w1: p.w * 0.7, d1: p.d * 0.84, fins: 0 }));
      out.push(seg(0, 0, p.w * 0.66, p.d * 0.82, c, top, Style.Office, { w1: p.w * 0.5, d1: p.d * 0.74, fins: 0 }));
      return {
        segs: out, cw: p.w * 0.5, cd: p.d * 0.74, clx: 0, clz: 0, cy: top,
        extra: () => {
          // spines on the narrow ends
          for (const s of [-1, 1]) {
            b.sink.frustum(s * (p.w / 2 + 2), 0, P, 6, 4, 6, 3, (top - P) * 0.9, b.face(Style.Slit, lit * 0.3), 1);
            // a cold light line up each spine, the blade's signature from across the basin
            b.box(s * (p.w / 2 + 5.2), 0, P + 20, 0.8, 1.6, (top - P) * 0.86, b.face(Style.Glow, 0.4, 1.8), 2);
          }
        },
      };
    }
  }
}

/** Builds a megatower into `sink` and returns its colliders, hologram/neon slots, flames and lights. */
export function buildTower(plan: TowerPlan, sink: MassSink): TowerParts {
  const b = new Builder(plan, sink);
  const H = plan.height;
  const crownH = plan.crownH ?? clamp(H * 0.085, 18, 95);
  b.podium();
  const m = mainSegs(b, crownH);
  const holoFace: Face = plan.w >= plan.d ? 0 : 1;
  for (const s of m.segs) {
    b.emitSeg(s);
    b.ladderLights(s);
  }
  m.extra?.();
  // pads on terraces of stepped forms
  if (plan.pads && plan.form === 'stepped' && m.segs.length > 3) {
    const s = m.segs[2]!, n = m.segs[3]!;
    const room = (s.w - n.w) / 2;
    if (room > 18) b.pad(s.lx + s.w / 2 - room / 2, s.lz, s.y1, Math.min(24, room - 2));
  }
  // buttresses: big rakers on the short faces, smaller ones down the long faces
  if (plan.buttress) {
    const short: Face[] = plan.w >= plan.d ? [1, 3] : [0, 2];
    const longF: Face[] = plan.w >= plan.d ? [0, 2] : [1, 3];
    for (const f of short) {
      const [nx, nz] = FN[f];
      const half = f % 2 === 0 ? plan.d / 2 : plan.w / 2;
      const len = f % 2 === 0 ? plan.w : plan.d;
      b.buttress(nx * half, nz * half, f, len * 0.42, H * 0.1, H * 0.3, 0);
    }
    for (const f of longF) {
      const [nx, nz] = FN[f];
      const half = f % 2 === 0 ? plan.d / 2 : plan.w / 2;
      const len = f % 2 === 0 ? plan.w : plan.d;
      for (const t of [-0.36, 0, 0.36]) {
        const a = t * len;
        b.buttress(nx * half + (f % 2 === 0 ? a : 0), nz * half + (f % 2 === 0 ? 0 : a), f, 9, H * 0.045, H * 0.17, 1);
      }
    }
  }
  b.crown(plan.crown, m.clx, m.clz, m.cw, m.cd, m.cy, crownH, holoFace);
  b.mast(m.clx, m.clz, H, plan.mast ?? 0, Math.min(m.cw, m.cd) * 0.16);
  // shaft and podium hologram slots
  const tall = m.segs.reduce((a, s) => (s.y1 - s.y0 > a.y1 - a.y0 ? s : a), m.segs[0]!);
  const sideFace: Face = holoFace === 0 ? 1 : 0;
  const sideLen = sideFace % 2 === 0 ? tall.w : tall.d;
  const sideHalf = sideFace % 2 === 0 ? tall.d / 2 : tall.w / 2;
  const [snx, snz] = FN[sideFace];
  const hh = clamp((tall.y1 - tall.y0) * 0.32, 50, 150);
  b.holo({ lx: tall.lx + snx * (sideHalf + 4.5), lz: tall.lz + snz * (sideHalf + 4.5), y: tall.y0 + (tall.y1 - tall.y0) * 0.5, face: sideFace, w: Math.min(sideLen * 0.72, 110), h: hh, rank: 1, kind: 'shaft' });
  if (plan.podium) {
    const pd = plan.podium;
    const f: Face = sideFace === 1 ? 3 : 2;
    const [nx, nz] = FN[f];
    const half = f % 2 === 0 ? pd.d / 2 : pd.w / 2;
    const len = f % 2 === 0 ? pd.w : pd.d;
    b.holo({ lx: nx * (half + 2), lz: nz * (half + 2), y: pd.h * 0.62, face: f, w: Math.min(len * 0.4, 48), h: pd.h * 0.5, rank: 2, kind: 'podium' });
  }
  return b.parts;
}

export interface BridgePlan {
  seed: number;
  /** Span between the two anchor points (m); the frame's local X runs along it, origin at mid-span. */
  length: number;
  /** Deck underside height (m). */
  y: number;
  /** Deck width and enclosed height (m). */
  width: number;
  height: number;
  /** Hologram panels on the sides (0..2). */
  holo?: number;
  lit?: number;
}

/**
 * Enclosed skybridge: a lit ribbon-glazed tube on a deep truss, a maintenance pod at mid-span,
 * transfer collars at both ends, side hologram panels and obstruction lights.
 */
export function buildSkybridge(plan: BridgePlan, sink: MassSink): TowerParts {
  const b = new Builder({ seed: plan.seed, height: plan.y + plan.height, w: plan.length, d: plan.width, form: 'slab', crown: 'hammer', holo: plan.holo ?? 2, lit: plan.lit ?? 0.7 }, sink);
  const L = plan.length, y = plan.y, W = plan.width, H = plan.height;
  b.bridge(-L / 2, L / 2, 0, y, W, H);
  const roof = b.face(Style.Solid, 0, 0.75);
  b.box(0, 0, y + H, L, W + 2, 1.6, roof, 0);
  // light strip along both deck edges
  const strip = b.face(Style.Glow, 0.45, 1.8);
  for (const s of [-1, 1]) b.box(0, s * (W / 2 + 0.5), y + 0.4, L - 8, 0.6, 0.5, strip, 1);
  // transfer collars where the bridge enters a tower
  const collar = b.face(Style.Megablock, 0.5, 0.9);
  for (const s of [-1, 1]) b.box(s * (L / 2 - 9), 0, y - 6, 18, W + 8, H + 9, collar, 0);
  // mid-span maintenance pod hanging below the truss, and a rooftop service walkway rail
  const pod = b.face(Style.Industrial, 0.25, 0.7);
  b.box(0, 0, y - 15, W * 0.9, W * 0.8, 10, pod, 1);
  b.box(0, 0, y - 18, 4, 4, 3, pod, 2);
  for (let x = -L / 2 + 30; x < L / 2 - 20; x += 60) b.box(x, 0, y + H + 1.6, 0.8, W * 0.7, 1.2, roof, 3);
  // side hologram panels, one per face
  const ph = Math.min(H * 2.6, 44), pw = Math.min(L * 0.32, 90);
  b.holo({ lx: L * 0.12, lz: W / 2 + 3, y: y + H / 2, face: 0, w: pw, h: ph, rank: 1, kind: 'bridge' });
  b.holo({ lx: -L * 0.12, lz: -W / 2 - 3, y: y + H / 2, face: 2, w: pw, h: ph, rank: 2, kind: 'bridge' });
  for (const s of [-1, 0, 1]) {
    b.light(s * (L / 2 - 20), y + H + 2.2, W / 2, 'red');
    b.light(s * (L / 2 - 20), y + H + 2.2, -W / 2, 'red');
  }
  b.light(0, y - 18.5, 0, 'warm');
  return b.parts;
}

/** Outward unit normal of a face in the tower frame. */
export function faceNormal(f: Face): readonly [number, number] {
  return FN[f];
}
