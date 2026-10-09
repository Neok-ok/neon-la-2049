// Streaks for an open roof while the city's rain mesh is hidden. Low tier builds none.
import { BufferGeometry, DoubleSide, Float32BufferAttribute, MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';
import type { OpenSky } from './types';

const T = TSL as any;

let mat: MeshBasicNodeMaterial | null = null;

export function rainMaterial(): MeshBasicNodeMaterial {
  if (mat) return mat;
  const m = new MeshBasicNodeMaterial();
  m.transparent = true;
  m.depthWrite = false;
  m.depthTest = true;
  m.fog = false;
  m.side = DoubleSide;
  m.colorNode = T.Fn(() => {
    const uv = T.uv();
    const scroll = T.fract(uv.y.sub(U.time.mul(1.15)));
    const streak = T.smoothstep(0.22, 0.0, T.abs(scroll.sub(0.12)));
    const edge = T.smoothstep(0.0, 0.2, uv.x).mul(T.smoothstep(1.0, 0.8, uv.x));
    return T.vec4(T.vec3(0.72, 0.76, 0.82), streak.mul(edge).mul(0.42));
  })();
  mat = m;
  return m;
}

function hash(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function buildRainGeometry(sky: OpenSky, count: number): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const c = Math.cos(sky.yaw), s = Math.sin(sky.yaw);
  const span = Math.max(0.5, sky.y1 - sky.y0);
  for (let i = 0; i < count; i++) {
    const lx = (hash(i * 3 + 1) * 2 - 1) * sky.hw * 0.9;
    const lz = (hash(i * 3 + 2) * 2 - 1) * sky.hd * 0.9;
    const y = sky.y0 + hash(i * 3 + 3) * span;
    const h = 1.8 + hash(i * 3 + 4) * 1.4;
    const w = 0.05 + hash(i * 3 + 5) * 0.04;
    const corners: Array<[number, number, number]> = [
      [lx - w, y, lz],
      [lx + w, y, lz],
      [lx + w, y + h, lz],
      [lx - w, y + h, lz],
    ];
    for (const [px, py, pz] of corners) pos.push(sky.x + px * c + pz * s, py, sky.z - px * s + pz * c);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    const b = i * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
