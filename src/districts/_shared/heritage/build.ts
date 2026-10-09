// Pure module (worker-safe). Street-wall heritage façades for any district that still has
// a pre-collapse front under newer cladding. One plan, one face. The caller maps the façade
// frame onto a street: +x along the street, +y up, +z toward the street. The wall plane is z = 0.
// Mass sits in negative z. Nothing here imports three.js.
import { Style, SignColor } from '../../../world/fabric/types';
import type { FaceDir } from '../../../world/fabric/types';

export type HeritageFamily = 'beaux' | 'deco' | 'baroque' | 'gothic' | 'roman' | 'marquee';
export type HeritageCrown = 'none' | 'pediment' | 'steps' | 'clock' | 'spire';

export interface HeritagePlan {
  seed: number;
  /** Width along the street, metres. */
  width: number;
  /** Depth into the lot. The front face is z = 0. */
  depth: number;
  /** Top of the historic front, metres. */
  frontH: number;
  /** Top of the cladding, metres. Crowns stay inside this. */
  height: number;
  family: HeritageFamily;
  /** 0 = the old front still owns the skyline. 1 = side jackets and a set-back cap. */
  wrap: number;
  marquee: boolean;
  /** Ground-floor opening width. 0 = a solid front. */
  door: number;
  crown: HeritageCrown;
  /** Vertical blade signs in each stack. */
  blades: number;
  /** When true, one kind-2 panel large enough for the hologram field to promote. */
  billboard: boolean;
  lit: number;
  tint: number;
  /** Fewer pilasters. Fabric districts should pass true. */
  compact: boolean;
  /** Ornament only. The caller owns the volume, so mass, cap, jackets and tanks are skipped. */
  skin?: boolean;
}

export interface HeritagePiece {
  /** Centre in the façade frame. */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  style: number;
  lit: number;
  tint: number;
  seed: number;
  detail: 0 | 1 | 2;
}

export interface HeritageSign {
  /** Along-street offset and centre height. The anchor sits on the wall plane. */
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  kind: 0 | 1 | 2;
  /** Atlas cell index. */
  phrase: number;
}

export interface HeritageBuild {
  pieces: HeritagePiece[];
  signs: HeritageSign[];
}

const PHRASES = [2, 4, 3, 20, 23, 39, 48, 58, 59, 62, 1, 5, 49, 16, 19, 47];
const COLORS = [SignColor.Pink, SignColor.Violet, SignColor.Amber, SignColor.Cyan, SignColor.Red, SignColor.Yellow];

function hash(seed: number, i: number): number {
  const x = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function piece(
  out: HeritagePiece[],
  x: number, y: number, z: number, w: number, h: number, d: number,
  style: number, lit: number, tint: number, seed: number, detail: 0 | 1 | 2,
): void {
  if (w < 0.25 || h < 0.12 || d < 0.12) return;
  out.push({ x, y, z, w, h, d, style, lit, tint, seed, detail });
}

/** Block-local centre of a façade-frame point. `plane` is the wall's s (a-faces) or t (b-faces). */
export function projectFace(
  face: FaceDir,
  centerS: number,
  centerT: number,
  plane: number,
  x: number,
  z: number,
): { s: number; t: number; lb: number; la: number } {
  // lb is size along B, la along A. The caller still has to pass the piece's w/d.
  if (face === 'b-') return { s: centerS + x, t: plane - z, lb: 0, la: 0 };
  if (face === 'b+') return { s: centerS + x, t: plane + z, lb: 0, la: 0 };
  if (face === 'a+') return { s: plane + z, t: centerT + x, lb: 0, la: 0 };
  return { s: plane - z, t: centerT + x, lb: 0, la: 0 };
}

/** Sizes swapped so `w` runs along the street and `d` runs through the wall. */
export function faceSize(face: FaceDir, w: number, d: number): { lb: number; la: number } {
  if (face === 'a+' || face === 'a-') return { lb: w, la: d };
  return { lb: d, la: w };
}

export function buildHeritage(plan: HeritagePlan): HeritageBuild {
  const pieces: HeritagePiece[] = [];
  const signs: HeritageSign[] = [];
  const width = Math.max(6, plan.width);
  const depth = Math.max(4, plan.depth);
  const frontH = Math.max(8, Math.min(plan.frontH, plan.height - 2));
  const height = Math.max(frontH + 2, plan.height);
  const wrap = Math.max(0, Math.min(1, plan.wrap));
  const stone = plan.family === 'deco' || plan.family === 'marquee' ? Style.Deco : Style.Masonry;
  const stoneTint = plan.tint * (plan.family === 'gothic' ? 0.62 : plan.family === 'deco' ? 1.05 : 1);
  const lit = plan.lit;
  const seed = plan.seed;
  const door = Math.max(0, Math.min(width * 0.46, plan.door));
  const doorHead = door > 0 ? (plan.marquee ? 3.5 : 6.4) : 0;

  // Historic front. A door splits the base so the sidewalk can step under the marquee.
  // Skin mode leaves the volume to the caller (a landmark atrium, a reused wall).
  if (!plan.skin) {
    if (door > 1.6 && doorHead < frontH - 1) {
      const sideW = (width - door) / 2;
      const sideX = door / 2 + sideW / 2;
      const zc = -depth / 2;
      piece(pieces, -sideX, doorHead / 2, zc, sideW, doorHead, depth, stone, lit * 0.45, stoneTint * 0.92, seed, 0);
      piece(pieces, sideX, doorHead / 2, zc, sideW, doorHead, depth, stone, lit * 0.45, stoneTint * 0.92, seed, 0);
      piece(pieces, 0, (doorHead + frontH) / 2, zc + 0.05, width * 0.98, frontH - doorHead, depth * 0.96, stone, lit * 0.4, stoneTint, seed + 0.01, 0);
    } else {
      piece(pieces, 0, frontH / 2, -depth / 2, width, frontH, depth, stone, lit * 0.4, stoneTint, seed, 0);
    }

    // Newer cladding: a set-back cap, plus side jackets when wrap is high, so the old bay still shows.
    const capW = width * (0.98 - wrap * 0.22);
    const capD = depth * (0.86 - wrap * 0.12);
    const capH = height - frontH;
    piece(pieces, 0, frontH + capH / 2, -depth * 0.5 - depth * 0.06 * wrap, capW, capH, capD, Style.Panel, lit * 0.55, plan.tint * 0.78, seed + 0.02, 0);
    if (wrap > 0.35) {
      const cheek = Math.max(1.4, width * 0.18 * wrap);
      const cheekH = height - frontH * 0.55;
      const cheekY = frontH * 0.55 + cheekH / 2;
      const cheekZ = -depth * 0.28;
      piece(pieces, -width / 2 + cheek / 2, cheekY, cheekZ, cheek, cheekH, depth * 0.72, Style.Panel, lit * 0.35, plan.tint * 0.7, seed + 0.03, 1);
      piece(pieces, width / 2 - cheek / 2, cheekY, cheekZ, cheek, cheekH, depth * 0.72, Style.Panel, lit * 0.35, plan.tint * 0.7, seed + 0.04, 1);
      const spineH = Math.min(capH, 6 + (1 - wrap) * 14);
      if (spineH > 2) {
        piece(pieces, 0, frontH + spineH / 2, -0.35, width * (0.42 - wrap * 0.12), spineH, 0.7, stone, lit * 0.3, stoneTint, seed + 0.05, 1);
      }
    }
  }

  // Cornice proud of the wall, at the historic line.
  const corniceH = plan.family === 'baroque' ? 1.35 : plan.family === 'marquee' ? 0.55 : 0.85;
  piece(pieces, 0, frontH - corniceH / 2, 0.42, width * 1.03, corniceH, 0.85, stone, 0.08, stoneTint * 1.05, seed + 0.06, 1);

  const pilasters = plan.compact ? 3 : plan.family === 'deco' ? 5 : 4;
  const pilH = Math.max(3, frontH - (door > 0 ? doorHead : 3.2) - corniceH);
  const pilY = (door > 0 ? doorHead : 2.4) + pilH / 2;
  const inset = width * 0.08;
  for (let i = 0; i < pilasters; i++) {
    const u = i / (pilasters - 1);
    const x = -width / 2 + inset + u * (width - inset * 2);
    if (door > 0 && Math.abs(x) < door * 0.42) continue;
    const pw = plan.family === 'deco' ? 0.38 : 0.72;
    const pd = plan.family === 'deco' ? 0.55 : 0.48;
    piece(pieces, x, pilY, pd / 2, pw, pilH, pd, stone, 0.05, stoneTint * 0.9, seed + 0.1 + i * 0.01, 1);
  }

  if (plan.marquee) {
    const mw = width * (plan.family === 'marquee' ? 0.86 : 0.7);
    const md = plan.family === 'marquee' ? 3.4 : 2.5;
    piece(pieces, 0, 3.35, md / 2 + 0.15, mw, 0.28, md, Style.Solid, 0.02, 0.35, seed + 0.2, 1);
    piece(pieces, 0, 3.62, md - 0.12, mw * 0.96, 0.32, 0.28, Style.Glow, 0.9, plan.family === 'marquee' ? 1.15 : 1.55, seed + 0.21, 1);
    signs.push({
      x: 0, y: 4.55, w: Math.min(8.5, mw * 0.72), h: 1.15,
      color: COLORS[Math.floor(hash(seed, 2) * COLORS.length)]!, kind: 0,
      phrase: PHRASES[Math.floor(hash(seed, 3) * PHRASES.length)]!,
    });
  }

  crown(pieces, plan, width, frontH, height, stone, stoneTint, seed);

  // One tank on the cap. Detail 2, so far LODs drop it.
  if (!plan.skin && height > 28) {
    piece(pieces, width * 0.22, height + 1.1, -depth * 0.2, 2.4, 2.2, 1.6, Style.Industrial, 0.02, 0.55, seed + 0.4, 2);
    if (!plan.compact && height > 50) {
      piece(pieces, -width * 0.18, height + 2.6, -depth * 0.15, 0.35, 5.2, 0.35, Style.Industrial, 0.1, 0.6, seed + 0.41, 2);
    }
  }

  blades(signs, plan, width, frontH, height, seed);
  return { pieces, signs };
}

function crown(
  pieces: HeritagePiece[], plan: HeritagePlan, width: number, frontH: number, height: number,
  stone: number, tint: number, seed: number,
): void {
  const top = height;
  if (plan.crown === 'pediment') {
    piece(pieces, 0, frontH + 1.1, 0.35, width * 0.46, 2.2, 0.7, stone, 0.06, tint, seed + 0.3, 1);
    if (plan.family === 'baroque') {
      piece(pieces, -width * 0.16, frontH + 0.7, 0.4, width * 0.12, 1.5, 0.6, stone, 0.05, tint, seed + 0.31, 1);
      piece(pieces, width * 0.16, frontH + 0.7, 0.4, width * 0.12, 1.5, 0.6, stone, 0.05, tint, seed + 0.32, 1);
    }
  } else if (plan.crown === 'steps') {
    piece(pieces, 0, top - 3.2, -0.2, width * 0.55, 2.4, Math.max(2, plan.depth * 0.4), stone, plan.lit * 0.3, tint, seed + 0.33, 1);
    piece(pieces, 0, top - 1.1, -0.1, width * 0.32, 2.0, Math.max(1.6, plan.depth * 0.28), stone, plan.lit * 0.25, tint * 1.05, seed + 0.34, 1);
  } else if (plan.crown === 'clock') {
    piece(pieces, 0, top - 6.5, 0.15, 5.2, 8.4, 3.2, stone, 0.15, tint * 1.1, seed + 0.35, 0);
    piece(pieces, 0, top - 6.2, 1.7, 3.4, 3.4, 0.25, Style.Glow, 0.85, 1.35, seed + 0.36, 1);
    piece(pieces, 0, top - 1.6, 0.2, 6.4, 1.1, 4.2, stone, 0.05, tint, seed + 0.37, 1);
  } else if (plan.crown === 'spire') {
    piece(pieces, 0, top - 9, -0.1, width * 0.28, 6, Math.max(2.4, plan.depth * 0.35), stone, 0.12, tint * 0.85, seed + 0.38, 1);
    piece(pieces, 0, top - 4, 0, width * 0.14, 5, 1.6, stone, 0.08, tint * 0.8, seed + 0.39, 1);
    piece(pieces, 0, top - 1.2, 0, 0.7, 2.4, 0.7, Style.Glow, 0.4, 1.1, seed + 0.395, 2);
  }
}

function blades(signs: HeritageSign[], plan: HeritagePlan, width: number, frontH: number, height: number, seed: number): void {
  const stacks = width > 22 ? 2 : 1;
  const n = Math.max(0, Math.min(6, plan.blades));
  for (let s = 0; s < stacks; s++) {
    const x = stacks === 1 ? width * 0.28 : (s === 0 ? -1 : 1) * width * 0.32;
    let y = plan.marquee ? 6.4 : 5.2;
    for (let i = 0; i < n; i++) {
      const h = 7.5 + (i % 3) * 2.4 + (s === 1 ? 1.2 : 0);
      if (y + h > height - 3) break;
      const w = 1.45 + hash(seed, 10 + s * 4 + i) * 0.55;
      signs.push({
        x, y: y + h / 2, w, h,
        color: COLORS[Math.floor(hash(seed, 20 + s * 5 + i) * COLORS.length)]!,
        kind: 1,
        phrase: PHRASES[Math.floor(hash(seed, 30 + i + s) * PHRASES.length)]!,
      });
      y += h + 0.55;
    }
  }
  // A second, shorter stack on a tall front so the canyon reads as signs over signs.
  if (n >= 3 && height > frontH + 18 && width > 16) {
    const x = -width * 0.05;
    let y = frontH + 2;
    for (let i = 0; i < 2; i++) {
      const h = 9 + i * 3;
      if (y + h > height - 4) break;
      signs.push({
        x, y: y + h / 2, w: 1.7, h,
        color: COLORS[Math.floor(hash(seed, 40 + i) * COLORS.length)]!,
        kind: 1,
        phrase: PHRASES[Math.floor(hash(seed, 41 + i) * PHRASES.length)]!,
      });
      y += h + 0.7;
    }
  }
  if (plan.billboard && height > 50 && width > 18) {
    signs.push({
      x: 0, y: frontH + (height - frontH) * 0.55, w: 16, h: 10,
      color: COLORS[Math.floor(hash(seed, 50) * COLORS.length)]!,
      kind: 2,
      phrase: PHRASES[4]!,
    });
  }
}
