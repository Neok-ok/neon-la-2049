// Eight-frame flipbook, baked once. Density in A, tangent-space normal in RG.
// Frames tear apart as the index rises so a puff does not slide through one stamp.
// No downloaded art. The noise is the same value noise as the curl field.
import {
  ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter,
  NoColorSpace, RGBAFormat, UnsignedByteType,
} from 'three/webgpu';
import { resources } from '../../core/memory';
import { fbm } from './curl';

const FRAMES = 8;
const CELL = 128;
const COLS = 4;
const ROWS = 2;

function lobe(u: number, v: number, cx: number, cy: number, rx: number, ry: number): number {
  const dx = (u - cx) / rx;
  const dy = (v - cy) / ry;
  return Math.exp(-(dx * dx + dy * dy) * 1.55);
}

/**
 * A fat body with soft creases. A hard slot lined the cards up into a staircase,
 * and a single lobe was a ball. The rim dies inside the quad so the square never shows.
 */
function density(u: number, v: number, frame: number): number {
  const w1 = fbm(u * 1.3 + frame * 0.17, v * 1.2, 0.2 + frame * 0.05);
  const w2 = fbm(u * 1.1 + 1.7, v * 1.3 + frame * 0.09, 1.4);
  const uu = u + w1 * 0.14;
  const vv = v + w2 * 0.11;
  const s = Math.sin(frame * 0.7);
  let d = lobe(uu, vv, 0.03 * s, 0.02, 0.68, 0.56);
  d += lobe(uu, vv, -0.22, 0.14, 0.36, 0.3) * 0.5;
  d += lobe(uu, vv, 0.2, -0.16, 0.32, 0.26) * 0.42;
  const crease = fbm(uu * 2.2 + 2.0, vv * 2.5 + frame * 0.13, 2.2 + frame * 0.08);
  const crease2 = fbm(uu * 3.2 - vv * 1.1, vv * 2.6, 4.1 + frame * 0.18);
  d *= 0.55 + 0.45 * crease * (0.65 + 0.35 * crease2);
  const rad = Math.hypot(uu * 0.92, vv * 0.95);
  const rim = Math.max(0, 1 - rad * rad);
  d *= rim * rim;
  return Math.max(0, Math.min(1, d));
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
        let nx = -dx * 5.5;
        let ny = -dy * 5.5;
        let nz = 0.42 + d * 0.9;
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
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.flipY = false;
  tex.needsUpdate = true;
  tex.name = 'smoke-flipbook';
  return tex;
}
