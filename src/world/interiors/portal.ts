// One opaque card per opening. A live view of the street would be a second full-city render,
// and the HUD would still report only the last pass, so the phone budget would be a lie.
// The card is a rainy neon canyon, not a film still. It draws only while the city is hidden.
import { BufferGeometry, DoubleSide, Float32BufferAttribute, MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';
import { resources } from '../../core/memory/resources';
import type { InteriorPortal } from './types';

const T = TSL as any;

export function portalMaterial(): MeshBasicNodeMaterial {
  return resources.material('interior-portal', () => {
  const m = new MeshBasicNodeMaterial();
  m.fog = false;
  m.side = DoubleSide;
  m.colorNode = T.Fn(() => {
    const uv = T.uv();
    const u = uv.x;
    const v = uv.y;
    const sky = T.vec3(0.012, 0.011, 0.018);
    const street = T.vec3(0.005, 0.004, 0.005);
    let col = T.mix(street, sky, T.smoothstep(0.18, 0.88, v));
    const bar = T.smoothstep(0.03, 0.0, T.abs(T.fract(u.mul(11.0)).sub(0.5)).sub(0.08));
    const band = T.smoothstep(0.04, 0.0, T.abs(T.fract(v.mul(14.0).add(u.mul(0.22))).sub(0.38)));
    const neon = T.mix(T.vec3(0.55, 0.08, 0.18), T.vec3(0.45, 0.22, 0.06), T.step(0.5, T.fract(u.mul(3.1))));
    const cool = T.vec3(0.08, 0.16, 0.32).mul(T.step(0.78, T.fract(u.mul(5.0).add(v))));
    col = col.add(neon.add(cool).mul(bar).mul(band).mul(0.14));
    col = T.mix(col, T.vec3(0.015, 0.013, 0.016), T.smoothstep(0.15, 1.0, v).mul(0.82));
    const streakU = T.fract(u.mul(52.0).add(v.mul(0.12)));
    const streak = T.smoothstep(0.008, 0.0, T.abs(streakU.sub(0.5)));
    const fall = T.fract(v.sub(U.time.mul(0.65)));
    const drop = T.smoothstep(0.0, 0.16, fall).mul(T.smoothstep(0.48, 0.2, fall));
    col = col.add(T.vec3(0.22, 0.24, 0.28).mul(streak).mul(drop).mul(0.1));
    const vignette = T.smoothstep(0.0, 0.16, u).mul(T.smoothstep(1.0, 0.84, u));
    return col.mul(vignette.mul(0.78).add(0.1));
  })();
  return m;
  });
}

function assemblePortalGeometry(portals: InteriorPortal[]): BufferGeometry {
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

export function buildPortalGeometry(portals: InteriorPortal[]): BufferGeometry {
  return resources.geometry(
    () => assemblePortalGeometry(portals),
    { label: 'interior-portal', owner: 'interiors', evictable: true },
  );
}
