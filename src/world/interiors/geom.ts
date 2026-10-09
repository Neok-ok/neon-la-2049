// One batched mesh per interior. Lights are baked into the vertex colour so they never become
// scene lights (those would recompile the city material). Emissive stays a separate attribute
// and flickers in the shader from the clock, not from the weather.
import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu';
import type { InteriorBox, InteriorDetail, InteriorLight, RGB } from './types';

const FACES: Array<{ n: [number, number, number]; c: Array<[number, number, number]> }> = [
  { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [1, 0, 0], c: [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]] },
  { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
  { n: [-1, 0, 0], c: [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1]] },
  { n: [0, 1, 0], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
];

function shade(nx: number, ny: number, nz: number, wx: number, wy: number, wz: number, lights: InteriorLight[], ambient: RGB): RGB {
  let r = ambient[0], g = ambient[1], b = ambient[2];
  for (const L of lights) {
    const dx = L.x - wx, dy = L.y - wy, dz = L.z - wz;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1e-3 || dist >= L.range) continue;
    const att = 1 - dist / L.range;
    const ndl = Math.max(0, (nx * dx + ny * dy + nz * dz) / dist);
    const k = (ndl * 0.72 + 0.28) * att * att * L.intensity;
    r += L.color[0] * k;
    g += L.color[1] * k;
    b += L.color[2] * k;
  }
  const m = Math.max(r, g, b);
  if (m > 1.7) {
    const s = 1.7 / m;
    r *= s; g *= s; b *= s;
  }
  return [r, g, b];
}

export function trisOf(g: BufferGeometry): number {
  if (g.drawRange.count === 0) return 0;
  return (g.index?.count ?? 0) / 3;
}

export function buildInteriorGeometry(
  boxes: InteriorBox[], lights: InteriorLight[], ambient: RGB, detail: InteriorDetail,
): BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const emi: number[] = [];
  const flick: number[] = [];
  const idx: number[] = [];
  let v = 0;

  for (const b of boxes) {
    if ((b.detail ?? 0) > detail) continue;
    if (b.w < 0.02 || b.h < 0.02 || b.d < 0.02) continue;
    const yaw = b.yaw ?? 0;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const hx = b.w / 2, hy = b.h / 2, hz = b.d / 2;
    const cx = b.x, cy = b.y + hy, cz = b.z;
    const em = b.emissive ?? [0, 0, 0];
    const fl = b.flick ?? -1;
    for (const f of FACES) {
      const nx = f.n[0], ny = f.n[1], nz = f.n[2];
      const wnx = nx * c + nz * s;
      const wnz = -nx * s + nz * c;
      const base = v;
      for (const corn of f.c) {
        const lx = corn[0] * hx, ly = corn[1] * hy, lz = corn[2] * hz;
        const wx = cx + lx * c + lz * s;
        const wy = cy + ly;
        const wz = cz - lx * s + lz * c;
        const lit = shade(wnx, ny, wnz, wx, wy, wz, lights, ambient);
        pos.push(wx, wy, wz);
        nrm.push(wnx, ny, wnz);
        col.push(b.color[0] * lit[0], b.color[1] * lit[1], b.color[2] * lit[2]);
        emi.push(em[0], em[1], em[2]);
        flick.push(fl);
        v++;
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  const g = new BufferGeometry();
  if (pos.length === 0) {
    g.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3));
    g.setAttribute('normal', new Float32BufferAttribute([0, 1, 0], 3));
    g.setAttribute('color', new Float32BufferAttribute([0, 0, 0], 3));
    g.setAttribute('emissive', new Float32BufferAttribute([0, 0, 0], 3));
    g.setAttribute('flick', new Float32BufferAttribute([-1], 1));
    g.setIndex([0, 0, 0]);
    g.setDrawRange(0, 0);
    return g;
  }
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setAttribute('emissive', new Float32BufferAttribute(emi, 3));
  g.setAttribute('flick', new Float32BufferAttribute(flick, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
