// One 256×128 mask. Eight ragged puffs, no second uncompressed copy.
import { ClampToEdgeWrapping, CanvasTexture, LinearFilter, NoColorSpace } from 'three/webgpu';
import { resources } from '../../core/memory';

const COLS = 4;
const ROWS = 2;
const CELL = 64;

function hash2(ix: number, iy: number, seed: number): number {
  let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function noise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, seed: number): number {
  let a = 0;
  let w = 0.5;
  let f = 1;
  let s = 0;
  for (let o = 0; o < 5; o++) {
    a += noise(x * f, y * f, seed + o * 17) * w;
    s += w;
    w *= 0.5;
    f *= 2.07;
  }
  return a / s;
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function buildCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const img = ctx.createImageData(canvas.width, canvas.height);
  const data = img.data;
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      const seed = cx + cy * COLS + 1;
      for (let py = 0; py < CELL; py++) {
        for (let px = 0; px < CELL; px++) {
          const u = (px + 0.5) / CELL;
          const v = (py + 0.5) / CELL;
          const n = fbm(u * 3.1 + seed, v * 3.1, seed * 5);
          const n2 = fbm(u * 6.2 + 2, v * 6.2, seed * 9 + 3);
          const r = Math.hypot(u - 0.5, v - 0.5) * 2;
          // Filled body, noisy edge. Thin wisps disappear on a night sky.
          const distorted = r + (n - 0.5) * 0.32 + (n2 - 0.5) * 0.1;
          const body = 1 - smooth(0.5, 1.16, distorted);
          const core = 1 - smooth(0.02, 0.5, r);
          let a = Math.max(body * (0.78 + 0.22 * n2), core * 0.42);
          const g = a * smooth(0.22, 0.75, n2);
          const i = ((cy * CELL + py) * canvas.width + cx * CELL + px) * 4;
          const A = Math.max(0, Math.min(255, Math.round(a * 255)));
          data[i] = A;
          data[i + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
          data[i + 2] = 0;
          data[i + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

let tex: CanvasTexture | null = null;

export function smokeMask(): CanvasTexture {
  if (tex) return tex;
  tex = resources.texture(() => {
    const t = new CanvasTexture(buildCanvas());
    t.colorSpace = NoColorSpace;
    t.wrapS = ClampToEdgeWrapping;
    t.wrapT = ClampToEdgeWrapping;
    t.minFilter = LinearFilter;
    t.magFilter = LinearFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  }, { label: 'smoke-mask', owner: 'smoke' });
  return tex;
}
