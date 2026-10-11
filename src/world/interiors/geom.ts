// One batched mesh per interior. Lights are baked into the vertex colour so they never become
// scene lights (those would recompile the city material). Emissive stays a separate attribute
// and flickers in the shader from the clock, not from the weather.
import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu';
import { resources } from '../../core/memory/resources';
import { bakeInteriorVertex } from '../../lighting/interiorBake.ts';
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
  return bakeInteriorVertex(nx, ny, nz, wx, wy, wz, lights, ambient);
}

/** Large faces are one quad. A lamp in the middle of a wall never reached a vertex, so the room stayed flat. */
function splits(span: number): number {
  if (span <= 1.1) return 1;
  return Math.min(6, Math.ceil(span / 1.35));
}

function faceSpans(n: readonly [number, number, number], w: number, h: number, d: number): [number, number] {
  if (n[0] !== 0) return [d, h];
  if (n[1] !== 0) return [w, d];
  return [w, h];
}

function mix3(a: readonly [number, number, number], b: readonly [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function trisOf(g: BufferGeometry): number {
  if (g.drawRange.count === 0) return 0;
  return (g.index?.count ?? 0) / 3;
}

function assembleInteriorGeometry(
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
      const [spanU, spanV] = faceSpans(f.n, b.w, b.h, b.d);
      const nu = splits(spanU);
      const nv = splits(spanV);
      const at = (u: number, vParam: number): [number, number, number] => {
        const ab = mix3(f.c[0], f.c[1], u);
        const dc = mix3(f.c[3], f.c[2], u);
        return mix3(ab, dc, vParam);
      };
      for (let iv = 0; iv < nv; iv++) {
        for (let iu = 0; iu < nu; iu++) {
          const base = v;
          const corners: Array<[number, number]> = [
            [iu / nu, iv / nv],
            [(iu + 1) / nu, iv / nv],
            [(iu + 1) / nu, (iv + 1) / nv],
            [iu / nu, (iv + 1) / nv],
          ];
          for (const [u, vParam] of corners) {
            const corn = at(u, vParam);
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

export function buildInteriorGeometry(
  boxes: InteriorBox[], lights: InteriorLight[], ambient: RGB, detail: InteriorDetail,
): BufferGeometry {
  return resources.geometry(
    () => assembleInteriorGeometry(boxes, lights, ambient, detail),
    { label: 'interior', owner: 'interiors', evictable: true },
  );
}
