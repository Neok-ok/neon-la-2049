// Pure block plan for the Wallace precinct. The archetype emits the boxes; the detail
// pass calls the same function with a no-op emitter so steam sits on the same stacks.
import { Rng } from '../../core/rng';
import { Style, type StyleId } from '../../world/fabric/types';

export interface WallaceBlock {
  cx: number;
  cz: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  la: number;
  lb: number;
  seed: number;
  ground: number;
}

export interface SteamPoint {
  x: number;
  y: number;
  z: number;
  seed: number;
  rank: number;
}

export type EmitBox = (
  s: number, t: number, lb: number, la: number, h: number,
  base: number, style: StyleId, lit: number, tint: number, detail: 0 | 1 | 2,
) => void;

const SEGMENTS: readonly number[][] = [
  [0, 1, 2, 3, 4, 5],
  [1, 2],
  [0, 1, 3, 4, 6],
  [0, 1, 2, 3, 6],
  [1, 2, 5, 6],
  [0, 2, 3, 5, 6],
  [0, 2, 3, 4, 5, 6],
  [0, 1, 2],
  [0, 1, 2, 3, 4, 5, 6],
  [0, 1, 2, 3, 5, 6],
];

function worldAt(b: WallaceBlock, s: number, t: number, y: number): [number, number, number] {
  return [
    b.cx + b.ax * s + b.bx * t,
    b.ground + y,
    b.cz + b.az * s + b.bz * t,
  ];
}

/** Two bay digits, seven-segment, on a face. No words. */
function digits(emit: EmitBox, s: number, t: number, y: number, n: number, alongT: boolean): void {
  const code = Math.abs(n) % 100;
  const nums = [Math.floor(code / 10), code % 10];
  for (let d = 0; d < 2; d++) {
    const segs = SEGMENTS[nums[d]!]!;
    const o = (d - 0.5) * 0.95;
    const put = (ds: number, dt: number, lb: number, la: number, h: number, dy: number) => {
      if (alongT) emit(s + ds, t + o + dt, lb, la, h, y + dy, Style.Glow, 0.8, 1.12, 2);
      else emit(s + o + ds, t + dt, la, lb, h, y + dy, Style.Glow, 0.8, 1.12, 2);
    };
    for (const g of segs) {
      if (g === 0) put(0, 0, 0.62, 0.08, 0.1, 1.05);
      else if (g === 6) put(0, 0, 0.62, 0.08, 0.1, 0.55);
      else if (g === 3) put(0, 0, 0.62, 0.08, 0.1, 0.05);
      else if (g === 1) put(0, 0.28, 0.1, 0.08, 0.48, 0.78);
      else if (g === 2) put(0, 0.28, 0.1, 0.08, 0.48, 0.28);
      else if (g === 5) put(0, -0.28, 0.1, 0.08, 0.48, 0.78);
      else put(0, -0.28, 0.1, 0.08, 0.48, 0.28);
    }
  }
}

function stripes(emit: EmitBox, s: number, t: number, y: number, alongT: boolean, n: number): void {
  for (let i = 0; i < n; i++) {
    const amber = i % 2 === 0;
    const o = (i - (n - 1) / 2) * 0.42;
    if (alongT) emit(s, t + o, 0.38, 0.22, 0.9, y, amber ? Style.Glow : Style.Monolith, amber ? 0.7 : 0.02, amber ? 1.2 : 0.35, 2);
    else emit(s + o, t, 0.22, 0.38, 0.9, y, amber ? Style.Glow : Style.Monolith, amber ? 0.7 : 0.02, amber ? 1.2 : 0.35, 2);
  }
}

function wallRun(emit: EmitBox, s: number, t: number, alongB: number, alongA: number, gap: number, horizontal: boolean): void {
  const span = horizontal ? alongB : alongA;
  const thin = 0.85;
  const h = 5.4;
  const side = (span - gap) / 2;
  if (side < 4) return;
  if (horizontal) {
    emit(s, t - (gap / 2 + side / 2), side, thin, h, 0, Style.Monolith, 0.03, 0.62, 1);
    emit(s, t + (gap / 2 + side / 2), side, thin, h, 0, Style.Monolith, 0.03, 0.62, 1);
    stripes(emit, s, t - gap / 2, 1.2, true, 5);
    stripes(emit, s, t + gap / 2, 1.2, true, 5);
  } else {
    emit(s - (gap / 2 + side / 2), t, thin, side, h, 0, Style.Monolith, 0.03, 0.62, 1);
    emit(s + (gap / 2 + side / 2), t, thin, side, h, 0, Style.Monolith, 0.03, 0.62, 1);
    stripes(emit, s - gap / 2, t, 1.2, false, 5);
    stripes(emit, s + gap / 2, t, 1.2, false, 5);
  }
}

/**
 * One 210 × 130 m block: a hall, a tank farm, a pipe rack, or a stack yard,
 * plus a perimeter wall on the +A and +B edges. Halls and stacks stay in 15–60 m.
 */
export function designBlock(b: WallaceBlock, emit: EmitBox): SteamPoint[] {
  const r = new Rng(b.seed || 1);
  const steam: SteamPoint[] = [];
  const kind = r.next();
  const la = b.la;
  const lb = b.lb;

  if (kind < 0.48) {
    const hallH = r.range(18, 42);
    const hs = -la * 0.12;
    const ht = r.range(-8, 8);
    const hla = Math.min(la * 0.62, r.range(70, 110));
    const hlb = Math.min(lb * 0.72, r.range(48, 78));
    emit(hs, ht, hlb, hla, hallH, 0, Style.Monolith, 0.035, r.range(0.58, 0.74), 0);
    const ridges = r.int(4, 7);
    for (let i = 0; i < ridges; i++) {
      const s = hs - hla / 2 + ((i + 0.5) * hla) / ridges;
      emit(s, ht, hlb * 0.92, 2.6, 4.4, hallH - 0.4, Style.Monolith, 0.02, 0.5, 1);
    }
    // loading bay on the +A side: dock, canopy, bumper stripes
    const dockS = hs + hla / 2 + 6;
    emit(dockS, ht, Math.min(18, hlb * 0.45), 10, 1.05, 0, Style.Solid, 0, 0.4, 1);
    emit(dockS, ht, Math.min(20, hlb * 0.5), 8, 0.35, 4.6, Style.Monolith, 0.04, 0.55, 1);
    stripes(emit, dockS - 4.6, ht, 0.4, true, 6);
    digits(emit, hs + hla / 2 + 0.2, ht, hallH * 0.42, b.seed % 97, true);
    // conveyor from the hall to a pad
    const padS = hs - hla / 2 - 16;
    emit(padS, ht + hlb * 0.2, 14, 14, r.range(8, 16), 0, Style.Solid, 0.02, 0.46, 1);
    emit((hs + padS) / 2, ht, 3.2, Math.abs(hs - padS) - 8, 1.4, 11, Style.Monolith, 0.05, 0.5, 1);
    emit(padS, ht + hlb * 0.2, 1.1, 1.1, 11, 0, Style.Solid, 0, 0.4, 2);
    emit(hs - hla * 0.2, ht, 1.1, 1.1, 11, 0, Style.Solid, 0, 0.4, 2);
    if (r.chance(0.7)) {
      const stH = r.range(32, 56);
      const ss = Math.min(la * 0.38, hs + hla / 2 + 14);
      const st = ht - hlb * 0.28;
      emit(ss, st, 4.2, 4.2, stH, 0, Style.Solid, 0.02, 0.42, 0);
      const [x, y, z] = worldAt(b, ss, st, stH);
      steam.push({ x, y, z, seed: r.next(), rank: 0 });
    }
  } else if (kind < 0.76) {
    const n = r.int(4, 7);
    const cols = Math.min(n, 3);
    for (let k = 0; k < n; k++) {
      const col = k % cols;
      const row = Math.floor(k / cols);
      const dia = r.range(12, 22);
      const h = r.range(8, 24);
      const s = -la * 0.22 + row * 28;
      const t = -lb * 0.22 + col * 26;
      emit(s, t, dia, dia, h, 0, Style.Solid, 0.02, r.range(0.4, 0.58), 0);
      emit(s, t, dia + 1.2, dia + 1.2, 0.6, h, Style.Monolith, 0.04, 0.48, 1);
      if (k > 0) {
        const ps = -la * 0.22 + Math.floor((k - 1) / cols) * 28;
        const pt = -lb * 0.22 + ((k - 1) % cols) * 26;
        emit((s + ps) / 2, (t + pt) / 2, 1.4, Math.max(6, Math.hypot(s - ps, t - pt)), 1.1, 6.5, Style.Solid, 0, 0.38, 1);
      }
    }
    digits(emit, la * 0.28, 0, 4.2, (b.seed >> 3) % 90, false);
    if (r.chance(0.55)) {
      const stH = r.range(28, 48);
      emit(la * 0.3, lb * 0.2, 3.4, 3.4, stH, 0, Style.Solid, 0.02, 0.4, 1);
      const [x, y, z] = worldAt(b, la * 0.3, lb * 0.2, stH);
      steam.push({ x, y, z, seed: r.next(), rank: 1 });
    }
  } else if (kind < 0.9) {
    const bents = r.int(4, 6);
    const span = Math.min(la * 0.7, 16 * bents);
    for (let i = 0; i < bents; i++) {
      const s = -span / 2 + (i * span) / Math.max(1, bents - 1);
      const t = r.range(-4, 4);
      const bh = r.range(7, 12);
      emit(s, t - 6, 0.7, 0.7, bh, 0, Style.Solid, 0, 0.4, 1);
      emit(s, t + 6, 0.7, 0.7, bh, 0, Style.Solid, 0, 0.4, 1);
      emit(s, t, 14, 0.8, 0.55, bh, Style.Monolith, 0.04, 0.5, 1);
      emit(s, t, 1.1, span / bents + 1, 0.7, bh + 0.8, Style.Solid, 0, 0.36, 1);
      emit(s, t + 2.2, 0.7, span / bents + 1, 0.55, bh + 1.6, Style.Solid, 0, 0.34, 2);
    }
    emit(0, -lb * 0.28, lb * 0.35, la * 0.55, r.range(15, 28), 0, Style.Monolith, 0.03, 0.6, 0);
    digits(emit, span / 2 + 1, 0, 3.2, (b.seed >> 5) % 80, true);
  } else {
    const hallH = r.range(16, 30);
    emit(-8, 0, lb * 0.55, la * 0.4, hallH, 0, Style.Monolith, 0.04, 0.66, 0);
    const stacks = r.int(2, 3);
    for (let i = 0; i < stacks; i++) {
      const stH = r.range(36, 58);
      const s = la * 0.22;
      const t = (i - (stacks - 1) / 2) * 14;
      emit(s, t, 3.6, 3.6, stH, 0, Style.Solid, 0.02, 0.4, 0);
      const [x, y, z] = worldAt(b, s, t, stH);
      steam.push({ x, y, z, seed: r.next(), rank: i === 0 ? 0 : 1 });
    }
    digits(emit, -8 + la * 0.2, 0, hallH * 0.55, b.seed % 70, true);
  }

  wallRun(emit, la / 2 - 1.2, 0, lb * 0.92, la, 9, true);
  wallRun(emit, 0, lb / 2 - 1.2, lb, la * 0.92, 9, false);
  return steam;
}
