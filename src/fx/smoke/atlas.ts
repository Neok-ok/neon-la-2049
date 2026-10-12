// Eight-frame flipbook, baked once. Density in A, tangent-space normal in RG.
// Frames tear apart as the index rises so a puff does not slide through one stamp.
// No downloaded art. The noise is the same value noise as the curl field.
import { ClampToEdgeWrapping, DataTexture, LinearFilter, NoColorSpace, RGBAFormat, UnsignedByteType } from 'three/webgpu';
import { resources } from '../../core/memory';
import { fbm } from './curl';

const FRAMES = 8;
const CELL = 64;
const COLS = 4;
const ROWS = 2;

function ball(u: number, v: number, cx: number, cy: number, rx: number, ry: number): number {
  const r = Math.hypot((u - cx) / rx, (v - cy) / ry);
  return Math.pow(Math.max(0, 1 - r), 1.45);
}

/** A few offset lobes, not a disc. The body stays filled so a small street card still reads. */
function density(u: number, v: number, frame: number): number {
  const tear = frame / (FRAMES - 1);
  const spin = tear * 0.85;
  const c = Math.cos(spin);
  const s = Math.sin(spin);
  const ru = u * c - v * s;
  const rv = u * s + v * c;
  const lobes =
    ball(ru, rv, -0.1, 0.04, 0.58, 0.66) * 1.05 +
    ball(ru, rv, 0.3, -0.18, 0.38, 0.42) * 0.82 +
    ball(ru, rv, -0.26, 0.28, 0.34, 0.38) * 0.78 +
    ball(ru, rv, 0.06, -0.36, 0.28, 0.32) * 0.6 +
    ball(ru, rv, 0.2, 0.26, 0.24, 0.26) * 0.5;
  const pits =
    ball(ru, rv, 0.02, 0.06, 0.16, 0.18) * 0.42 +
    ball(ru, rv, -0.18, -0.1, 0.12, 0.14) * 0.32;
  const fine = fbm(u * 2.6 + frame * 0.33, v * 2.8 - frame * 0.17, frame * 0.11);
  const body = Math.max(0, lobes - pits);
  return Math.min(1, body * (0.82 + 0.18 * Math.max(0, fine))) * (1 - tear * 0.1);
}

function bake(): Uint8Array {
  const w = COLS * CELL;
  const h = ROWS * CELL;
  const data = new Uint8Array(w * h * 4);
  for (let f = 0; f < FRAMES; f++) {
    const ox = (f % COLS) * CELL;
    const oy = Math.floor(f / COLS) * CELL;
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const u = ((x + 0.5) / CELL) * 2 - 1;
        const v = ((y + 0.5) / CELL) * 2 - 1;
        const du = 1.5 / CELL;
        const d = density(u, v, f);
        const dx = density(u + du, v, f) - density(u - du, v, f);
        const dy = density(u, v + du, f) - density(u, v - du, f);
        let nx = -dx * 4.5;
        let ny = -dy * 4.5;
        let nz = 0.55 + d * 0.8;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
        const i = ((oy + y) * w + (ox + x)) * 4;
        data[i] = Math.round((nx * 0.5 + 0.5) * 255);
        data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        data[i + 3] = Math.round(Math.min(1, d) * 255);
      }
    }
  }
  return data;
}

let tex: DataTexture | null = null;

export function smokeAtlas(): DataTexture {
  if (tex) return tex;
  const w = COLS * CELL;
  const h = ROWS * CELL;
  tex = resources.texture(() => new DataTexture(bake(), w, h, RGBAFormat, UnsignedByteType), {
    label: 'smoke-flipbook',
    owner: 'smoke',
  });
  tex.colorSpace = NoColorSpace;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.needsUpdate = true;
  tex.name = 'smoke-flipbook';
  return tex;
}
