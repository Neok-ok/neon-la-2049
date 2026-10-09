// One opaque card per opening. A live view of the street would be a second full-city render,
// and the HUD would still report only the last pass, so the phone budget would be a lie.
// The card is a rainy neon canyon, not a film still. It draws only while the city is hidden.
import { BufferGeometry, DoubleSide, Float32BufferAttribute, MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';
import type { InteriorPortal } from './types';

const T = TSL as any;

let mat: MeshBasicNodeMaterial | null = null;

export function portalMaterial(): MeshBasicNodeMaterial {
  if (mat) return mat;
  const m = new MeshBasicNodeMaterial();
  m.fog = false;
  m.side = DoubleSide;
  m.colorNode = T.Fn(() => {
    const uv = T.uv();
    const u = uv.x;
    const v = uv.y;
    const sky = T.vec3(0.045, 0.04, 0.055);
    const street = T.vec3(0.015, 0.012, 0.012);
    let col = T.mix(street, sky, T.smoothstep(0.12, 0.92, v));
    const bar = T.smoothstep(0.045, 0.0, T.abs(T.fract(u.mul(8.0)).sub(0.5)).sub(0.12));
    const band = T.smoothstep(0.06, 0.0, T.abs(T.fract(v.mul(9.0).add(u.mul(0.35))).sub(0.42)));
    const neon = T.mix(T.vec3(1.0, 0.18, 0.42), T.vec3(1.0, 0.55, 0.16), T.step(0.5, T.fract(u.mul(3.1))));
    const cool = T.vec3(0.25, 0.55, 1.0).mul(T.step(0.72, T.fract(u.mul(5.0).add(v))));
    col = col.add(neon.add(cool).mul(bar).mul(band).mul(0.9));
    col = T.mix(col, T.vec3(0.07, 0.055, 0.06), T.smoothstep(0.25, 1.0, v).mul(0.62));
    const streakU = T.fract(u.mul(46.0).add(v.mul(0.15)));
    const streak = T.smoothstep(0.012, 0.0, T.abs(streakU.sub(0.5)));
    const fall = T.fract(v.sub(U.time.mul(0.65)));
    const drop = T.smoothstep(0.0, 0.18, fall).mul(T.smoothstep(0.55, 0.22, fall));
    col = col.add(T.vec3(0.62, 0.66, 0.72).mul(streak).mul(drop).mul(0.45));
    const vignette = T.smoothstep(0.0, 0.08, u).mul(T.smoothstep(1.0, 0.92, u));
    return col.mul(vignette.mul(0.35).add(0.65));
  })();
  mat = m;
  return m;
}

export function buildPortalGeometry(portals: InteriorPortal[]): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  portals.forEach((p, i) => {
    const yaw = p.yaw ?? 0;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const hw = p.w / 2, hh = p.h / 2;
    const corners: Array<[number, number]> = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    for (const [lx, ly] of corners) pos.push(p.x + lx * c, p.y + ly, p.z - lx * s);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    const b = i * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const g = new BufferGeometry();
  if (pos.length === 0) {
    g.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3));
    g.setAttribute('uv', new Float32BufferAttribute([0, 0], 2));
    g.setIndex([0, 0, 0]);
    g.setDrawRange(0, 0);
    return g;
  }
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
