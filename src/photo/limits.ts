// Capture size caps. A phone must never allocate a framebuffer bigger than its tier can hold.
import type { Tier } from '../core/quality';
import type { CaptureKind, LetterboxId } from './types';

export const LETTERBOX_RATIO: Record<LetterboxId, number | null> = {
  off: null,
  '16:9': 16 / 9,
  '2.39': 2.39,
  '9:19.5': 9 / 19.5,
  '1:1': 1,
};

/**
 * maxEdge is the long side. maxPixels caps area. tile is the largest GPU buffer one capture tile may use.
 * dofScale is the gather resolution (0.5 = half the drawing buffer). dofRings is the number of
 * rings in the disc. dofPx is the blur clamp in full-resolution pixels. Wide circles gather a
 * quarter-resolution blur so the taps stay overlapped instead of copying the picture. dofTaps counts the
 * disc, including the centre.
 */
export const CAPTURE_CAPS: Record<Tier, {
  maxEdge: number; maxPixels: number; tile: number;
  dofTaps: number; dofRings: number; dofScale: number; dofPx: number; heavyBloom: boolean;
  /** Motion smear and anamorphic streak. Low keeps the gather small and skips both. */
  motion: boolean; motionPx: number; flareTaps: number; caPx: number;
}> = {
  low: { maxEdge: 1280, maxPixels: 1280 * 720, tile: 480, dofTaps: 22, dofRings: 2, dofScale: 0.5, dofPx: 16, heavyBloom: false, motion: false, motionPx: 0, flareTaps: 0, caPx: 0 },
  medium: { maxEdge: 1920, maxPixels: 1920 * 1080, tile: 640, dofTaps: 22, dofRings: 2, dofScale: 0.5, dofPx: 28, heavyBloom: false, motion: true, motionPx: 8, flareTaps: 4, caPx: 0.22 },
  high: { maxEdge: 2560, maxPixels: 2560 * 1440, tile: 768, dofTaps: 22, dofRings: 2, dofScale: 0.5, dofPx: 32, heavyBloom: true, motion: true, motionPx: 14, flareTaps: 8, caPx: 0.35 },
  ultra: { maxEdge: 2560, maxPixels: 2560 * 1440, tile: 1024, dofTaps: 22, dofRings: 2, dofScale: 0.5, dofPx: 32, heavyBloom: true, motion: true, motionPx: 22, flareTaps: 16, caPx: 0.45 },
};

export interface FrameSize {
  w: number;
  h: number;
  capped: boolean;
}

/** Long edge of a size preset before the letterbox aspect and the tier cap. */
function longEdge(kind: CaptureKind, viewLong: number): number {
  if (kind === 'screen') return viewLong;
  if (kind === '1080') return 1920;
  if (kind === '1440') return 2560;
  return 2532;
}

/**
 * Output size of the framed shot (the picture inside the matte).
 * Wallpaper forces 9:19.5. Other sizes follow the letterbox, or the view if the matte is off.
 */
export function frameSize(kind: CaptureKind, letterbox: LetterboxId, tier: Tier, viewW: number, viewH: number): FrameSize {
  const cap = CAPTURE_CAPS[tier];
  const viewAspect = viewW / Math.max(1, viewH);
  const ratio = kind === 'wallpaper' ? 9 / 19.5 : (LETTERBOX_RATIO[letterbox] ?? viewAspect);
  const long = longEdge(kind, Math.max(viewW, viewH));
  let w: number;
  let h: number;
  if (ratio >= 1) {
    w = long;
    h = long / ratio;
  } else {
    h = long;
    w = long * ratio;
  }
  const edge = Math.max(w, h);
  const pixels = w * h;
  let scale = 1;
  if (edge > cap.maxEdge) scale = Math.min(scale, cap.maxEdge / edge);
  if (pixels * scale * scale > cap.maxPixels) scale = Math.min(scale, Math.sqrt(cap.maxPixels / pixels));
  w = Math.max(16, Math.round(w * scale));
  h = Math.max(16, Math.round(h * scale));
  if (w % 2) w -= 1;
  if (h % 2) h -= 1;
  return { w, h, capped: scale < 0.999 };
}

/** Fraction of the viewfinder the letterbox leaves visible. y is from the top, matching setViewOffset. */
export function visibleFraction(viewW: number, viewH: number, letterbox: LetterboxId): { x: number; y: number; w: number; h: number } {
  const ratio = LETTERBOX_RATIO[letterbox];
  if (!ratio) return { x: 0, y: 0, w: 1, h: 1 };
  const view = viewW / Math.max(1, viewH);
  if (view > ratio) {
    const fw = ratio / view;
    return { x: (1 - fw) / 2, y: 0, w: fw, h: 1 };
  }
  const fh = view / ratio;
  return { x: 0, y: (1 - fh) / 2, w: 1, h: fh };
}

/**
 * Unit-spacing disc. Ring r sits on a circle of radius r (gather texels) with about one texel
 * between samples, so a bilinear prefilter fills the disc instead of copying the picture.
 * Index 0 is the centre. Odd rings are rotated half a step so the rings nest.
 */
export function dofDisc(rings: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [[0, 0]];
  const n = Math.max(0, Math.min(8, Math.round(rings)));
  for (let ring = 1; ring <= n; ring++) {
    const count = Math.max(8, Math.round(2 * Math.PI * ring));
    const spin = (ring % 2) * 0.5;
    for (let i = 0; i < count; i++) {
      const a = ((i + spin) / count) * Math.PI * 2;
      pts.push([Math.cos(a) * ring, Math.sin(a) * ring]);
    }
  }
  return pts;
}

const RGBA16F_BYTES = 8;
const DEPTH_BYTES = 4;

export interface LensTarget {
  name: string;
  w: number;
  h: number;
  format: 'RGBA16F' | 'Depth32';
  bytes: number;
}

export interface LensMemory {
  tier: Tier;
  viewW: number;
  viewH: number;
  dofScale: number;
  targets: LensTarget[];
  /** Prefilter + disc gather only. */
  dofBytes: number;
  bytes: number;
}

/**
 * GPU targets the lens rig allocates for a drawing buffer of viewW×viewH.
 * Scene colour and depth stay full resolution. The depth-of-field pair is dofScale
 * (half resolution on every tier, including Medium and Low). Bloom, when the tier
 * has it, is the five-mip dual Kawase chain at half resolution and below.
 * Depth is the pass depth texture (unsigned int, 4 bytes). DoF targets are RGBA16F
 * with no depth buffer.
 */
export function lensTargetMemory(tier: Tier, viewW: number, viewH: number): LensMemory {
  const cap = CAPTURE_CAPS[tier];
  const w = Math.max(1, Math.floor(viewW));
  const h = Math.max(1, Math.floor(viewH));
  const dw = Math.max(1, Math.floor(w * cap.dofScale));
  const dh = Math.max(1, Math.floor(h * cap.dofScale));
  const targets: LensTarget[] = [
    { name: 'scene-color', w, h, format: 'RGBA16F', bytes: w * h * RGBA16F_BYTES },
    { name: 'scene-depth', w, h, format: 'Depth32', bytes: w * h * DEPTH_BYTES },
    { name: 'dof-prefilter', w: dw, h: dh, format: 'RGBA16F', bytes: dw * dh * RGBA16F_BYTES },
    { name: 'dof-gather', w: dw, h: dh, format: 'RGBA16F', bytes: dw * dh * RGBA16F_BYTES },
    // Quarter-resolution plate the wide disc gathers. Half-res targets stay on every tier.
    { name: 'dof-soft', w: Math.max(1, Math.floor(w * 0.25)), h: Math.max(1, Math.floor(h * 0.25)), format: 'RGBA16F', bytes: Math.max(1, Math.floor(w * 0.25)) * Math.max(1, Math.floor(h * 0.25)) * RGBA16F_BYTES },
  ];
  if (cap.heavyBloom) {
    let bw = Math.floor(w * 0.5);
    let bh = Math.floor(h * 0.5);
    const push = (name: string, tw: number, th: number) => {
      const mw = Math.max(1, tw);
      const mh = Math.max(1, th);
      targets.push({ name, w: mw, h: mh, format: 'RGBA16F', bytes: mw * mh * RGBA16F_BYTES });
    };
    push('bloom-bright', bw, bh);
    for (let i = 0; i < 5; i++) {
      push(`bloom-h${i}`, bw, bh);
      push(`bloom-v${i}`, bw, bh);
      bw = Math.floor(bw / 2);
      bh = Math.floor(bh / 2);
    }
  }
  const dofBytes = targets.filter((t) => t.name.startsWith('dof-')).reduce((sum, t) => sum + t.bytes, 0);
  const bytes = targets.reduce((sum, t) => sum + t.bytes, 0);
  return { tier, viewW: w, viewH: h, dofScale: cap.dofScale, targets, dofBytes, bytes };
}
