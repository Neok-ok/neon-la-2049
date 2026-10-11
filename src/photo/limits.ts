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

/** maxEdge is the long side. maxPixels caps area. tile is the largest GPU buffer one capture tile may use. */
export const CAPTURE_CAPS: Record<Tier, {
  maxEdge: number; maxPixels: number; tile: number;
  dofTaps: number; dofPx: number; heavyBloom: boolean;
  /** Motion smear and anamorphic streak. Low keeps the gather small and skips both. */
  motion: boolean; motionPx: number; flareTaps: number; caPx: number;
}> = {
  low: { maxEdge: 1280, maxPixels: 1280 * 720, tile: 480, dofTaps: 5, dofPx: 6, heavyBloom: false, motion: false, motionPx: 0, flareTaps: 0, caPx: 0 },
  medium: { maxEdge: 1920, maxPixels: 1920 * 1080, tile: 640, dofTaps: 9, dofPx: 10, heavyBloom: false, motion: true, motionPx: 8, flareTaps: 4, caPx: 0.65 },
  high: { maxEdge: 2560, maxPixels: 2560 * 1440, tile: 768, dofTaps: 13, dofPx: 16, heavyBloom: true, motion: true, motionPx: 14, flareTaps: 8, caPx: 1.05 },
  ultra: { maxEdge: 2560, maxPixels: 2560 * 1440, tile: 1024, dofTaps: 33, dofPx: 28, heavyBloom: true, motion: true, motionPx: 22, flareTaps: 16, caPx: 1.6 },
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

/** Disc offsets. Index 0 is the center. Low uses five taps; ultra uses seventeen. */
export function dofOffsets(taps: number): Array<[number, number]> {
  const all: Array<[number, number]> = [
    [0, 0],
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [0.72, 0.72], [-0.72, 0.72], [0.72, -0.72], [-0.72, -0.72],
    [1.55, 0.35], [-1.55, 0.35], [0.35, 1.55], [-0.35, -1.55],
    [1.35, -1.15], [-1.35, 1.15], [1.7, 1.15], [-1.7, -0.85],
    [2.15, 0.25], [-2.15, 0.25], [0.25, 2.15], [-0.25, -2.15],
    [1.65, 1.65], [-1.65, 1.65], [1.65, -1.65], [-1.65, -1.65],
    [2.45, 0.95], [-2.45, 0.95], [0.95, 2.45], [-0.95, -2.45],
    [2.2, -1.45], [-2.2, 1.45], [1.15, -2.35], [-1.15, 2.35],
  ];
  return all.slice(0, Math.max(1, Math.min(all.length, taps)));
}
