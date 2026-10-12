// Eight-frame flipbook, baked once. Density in A, tangent-space normal in RG.
// Frames tear apart as the index rises so a puff does not slide through one stamp.
// No downloaded art. The noise is the same value noise as the curl field.
import { ClampToEdgeWrapping, DataTexture, LinearFilter, NoColorSpace, RGBAFormat, UnsignedByteType } from 'three/webgpu';
import { resources } from '../../core/memory';
import { fbm } from './curl';

const FRAMES = 8;
const CELL = 96;
const COLS = 4;
const ROWS = 2;

/**
 * A filled wisp with a torn rim. Round lobes were reading as a rope of spheres.
 * The core stays dense so a street card still shows; only the rim is eaten.
 */
function density(u: number, v: number, frame: number): number {
  const tear = frame / (FRAMES - 1);
  const warp = fbm(u * 1.6 + frame * 0.27, v * 1.9, frame * 0.13);
  const uu = u + warp * 0.22;
  const vv = v * (0.86 + tear * 0.2) + warp * 0.14;
  const n = fbm(uu * 2.6 + frame * 0.2, vv * 3.1, 0.6);
  const n2 = fbm(uu * 5.2 + 4, vv * 6, 1.4);
  const r2 = uu * uu * 0.9 + vv * vv * 0.72;
  const body = Math.max(0, 1 - r2);
  const rim = Math.min(1, r2 * 1.35);
  const eat = Math.max(0, -n) * rim * 1.2;
  const grain = 0.78 + 0.22 * n2;
  const d = Math.max(0, body - eat) * Math.max(0.45, grain);
  return Math.min(1, d) * (1 - tear * 0.1);
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
