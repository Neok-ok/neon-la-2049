// Canvas atlas of invented multilingual neon signs. Latin is real text; the other scripts are
// original stroke glyphs (no system CJK/Devanagari font required, no film logos).
import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, SRGBColorSpace } from 'three/webgpu';
import { Rng, hashString } from '../../core/rng';
import { SIGN_ATLAS_COLS, SIGN_ATLAS_ROWS, SIGN_PHRASES, type SignScript } from './signPhrases';

const CELL_W = 256;
const CELL_H = 64;

type Seg = [number, number, number, number];

const KANA: Seg[][] = [
  [[0.12, 0.22, 0.88, 0.22], [0.28, 0.22, 0.22, 0.84], [0.22, 0.58, 0.78, 0.84]],
  [[0.18, 0.2, 0.82, 0.78], [0.78, 0.2, 0.2, 0.8], [0.18, 0.48, 0.7, 0.48]],
  [[0.15, 0.3, 0.55, 0.18], [0.55, 0.18, 0.88, 0.42], [0.3, 0.48, 0.85, 0.48], [0.22, 0.48, 0.4, 0.86]],
  [[0.2, 0.2, 0.2, 0.82], [0.2, 0.2, 0.78, 0.2], [0.2, 0.5, 0.72, 0.5], [0.2, 0.82, 0.78, 0.82]],
  [[0.22, 0.18, 0.8, 0.18], [0.35, 0.18, 0.28, 0.84], [0.28, 0.55, 0.78, 0.72]],
  [[0.3, 0.16, 0.3, 0.84], [0.55, 0.28, 0.55, 0.84]],
  [[0.18, 0.28, 0.82, 0.28], [0.18, 0.52, 0.82, 0.52], [0.18, 0.76, 0.82, 0.76], [0.22, 0.28, 0.22, 0.76]],
  [[0.22, 0.22, 0.78, 0.22], [0.22, 0.22, 0.22, 0.78], [0.22, 0.78, 0.78, 0.78], [0.78, 0.22, 0.78, 0.78]],
];

const HANGUL: Seg[][] = [
  [[0.28, 0.22, 0.28, 0.78], [0.28, 0.48, 0.62, 0.48], [0.62, 0.3, 0.62, 0.7], [0.5, 0.32, 0.78, 0.5], [0.5, 0.68, 0.78, 0.5]],
  [[0.22, 0.2, 0.22, 0.8], [0.22, 0.2, 0.55, 0.2], [0.22, 0.5, 0.5, 0.5], [0.22, 0.8, 0.55, 0.8], [0.62, 0.35, 0.84, 0.35], [0.62, 0.35, 0.62, 0.72], [0.62, 0.72, 0.84, 0.72]],
  [[0.35, 0.18, 0.35, 0.82], [0.18, 0.38, 0.52, 0.38], [0.6, 0.28, 0.82, 0.28], [0.6, 0.28, 0.6, 0.78], [0.6, 0.52, 0.84, 0.52]],
  [[0.2, 0.22, 0.48, 0.22], [0.2, 0.22, 0.2, 0.78], [0.2, 0.5, 0.46, 0.5], [0.58, 0.32, 0.8, 0.32], [0.58, 0.32, 0.58, 0.72], [0.58, 0.72, 0.82, 0.78]],
];

const HANZI: Seg[][] = [
  [[0.18, 0.18, 0.82, 0.18], [0.18, 0.18, 0.18, 0.82], [0.18, 0.82, 0.82, 0.82], [0.82, 0.18, 0.82, 0.82], [0.18, 0.5, 0.82, 0.5], [0.5, 0.18, 0.5, 0.82]],
  [[0.5, 0.12, 0.5, 0.88], [0.18, 0.32, 0.82, 0.32], [0.22, 0.32, 0.18, 0.78], [0.78, 0.32, 0.84, 0.78], [0.28, 0.55, 0.72, 0.55], [0.32, 0.55, 0.4, 0.84], [0.68, 0.55, 0.6, 0.84]],
  [[0.15, 0.22, 0.85, 0.22], [0.15, 0.42, 0.85, 0.42], [0.15, 0.62, 0.85, 0.62], [0.15, 0.82, 0.85, 0.82], [0.32, 0.22, 0.32, 0.82], [0.68, 0.22, 0.68, 0.82]],
  [[0.2, 0.2, 0.8, 0.2], [0.2, 0.2, 0.2, 0.8], [0.8, 0.2, 0.8, 0.8], [0.2, 0.8, 0.8, 0.8], [0.2, 0.5, 0.8, 0.5], [0.5, 0.2, 0.5, 0.8], [0.35, 0.35, 0.65, 0.65], [0.65, 0.35, 0.35, 0.65]],
  [[0.5, 0.1, 0.5, 0.9], [0.15, 0.38, 0.85, 0.38], [0.22, 0.38, 0.12, 0.82], [0.78, 0.38, 0.88, 0.82], [0.32, 0.58, 0.68, 0.58], [0.38, 0.58, 0.32, 0.88], [0.62, 0.58, 0.7, 0.88]],
];

const DEVA: Seg[][] = [
  [[0.12, 0.28, 0.88, 0.28], [0.3, 0.28, 0.22, 0.82], [0.55, 0.28, 0.7, 0.78], [0.42, 0.55, 0.78, 0.55]],
  [[0.1, 0.26, 0.9, 0.26], [0.25, 0.26, 0.25, 0.7], [0.25, 0.7, 0.55, 0.55], [0.55, 0.55, 0.48, 0.84], [0.62, 0.26, 0.78, 0.72]],
  [[0.12, 0.3, 0.88, 0.3], [0.22, 0.3, 0.35, 0.78], [0.48, 0.3, 0.42, 0.8], [0.68, 0.3, 0.8, 0.62], [0.8, 0.62, 0.62, 0.78]],
];

function glyphsFor(script: SignScript): Seg[][] {
  if (script === 'kana') return KANA;
  if (script === 'hangul') return HANGUL;
  if (script === 'hanzi') return HANZI;
  return DEVA;
}

function drawSegs(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, segs: Seg[]): void {
  ctx.beginPath();
  for (const s of segs) {
    ctx.moveTo(x + s[0] * w, y + s[1] * h);
    ctx.lineTo(x + s[2] * w, y + s[3] * h);
  }
  ctx.stroke();
}

let texture: CanvasTexture | null = null;

export function getSignAtlas(): CanvasTexture {
  if (texture) return texture;
  const canvas = document.createElement('canvas');
  canvas.width = SIGN_ATLAS_COLS * CELL_W;
  canvas.height = SIGN_ATLAS_ROWS * CELL_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('sign atlas: no 2d context');
  ctx.fillStyle = '#05040a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ffffff';

  SIGN_PHRASES.forEach((phrase, i) => {
    const col = i % SIGN_ATLAS_COLS;
    const row = Math.floor(i / SIGN_ATLAS_COLS);
    const x = col * CELL_W;
    const y = row * CELL_H;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, CELL_W, CELL_H);
    ctx.clip();
    ctx.fillStyle = '#09070f';
    ctx.fillRect(x, y, CELL_W, CELL_H);
    ctx.shadowBlur = 7;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x + 3.5, y + 3.5, CELL_W - 7, CELL_H - 7);
    ctx.fillStyle = '#ffffff';
    if (phrase.script === 'latin') {
      ctx.font = '700 28px sans-serif';
      ctx.shadowBlur = 10;
      ctx.fillText(phrase.latin, x + 14, y + CELL_H / 2 + 1);
    } else {
      const rng = new Rng(hashString(phrase.latin) ^ (i + 1) * 1315423911);
      const set = glyphsFor(phrase.script);
      const n = phrase.script === 'hanzi' || phrase.script === 'devanagari' ? 2 : 3;
      const gw = 42;
      for (let g = 0; g < n; g++) {
        ctx.lineWidth = 2.4;
        ctx.shadowBlur = 6;
        drawSegs(ctx, x + 10 + g * (gw + 6), y + 10, gw, 44, rng.pick(set));
      }
      ctx.font = '700 15px sans-serif';
      ctx.shadowBlur = 6;
      ctx.fillText(phrase.latin, x + 14 + n * (gw + 6), y + 34);
    }
    ctx.restore();
  });

  texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
