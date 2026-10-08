// Dark, heavy, wind-chopped Pacific (procedural normal perturbation, no textures).
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';

const T = TSL as any;
const { Fn, vec3, positionWorld, mx_noise_float, normalize, float, mix } = T;

let shared: MeshStandardNodeMaterial | null = null;

export function getOceanMaterial(): MeshStandardNodeMaterial {
  if (shared) return shared;
  const m = new MeshStandardNodeMaterial();
  m.name = 'Ocean';
  const p = positionWorld;
  const t = U.time;
  const h = (sx: number, sz: number, sp: number, a: number) => mx_noise_float(vec3(p.x.mul(sx).add(t.mul(sp)), p.z.mul(sz), t.mul(sp * 0.5))).mul(a);
  m.normalNode = Fn(() => {
    const e = 0.5;
    const n0 = h(0.02, 0.025, 0.3, 1.0).add(h(0.11, 0.09, 0.9, 0.35));
    const nx = mx_noise_float(vec3(p.x.add(e).mul(0.02).add(t.mul(0.3)), p.z.mul(0.025), t.mul(0.15))).sub(n0).mul(6.0);
    const nz = mx_noise_float(vec3(p.x.mul(0.02).add(t.mul(0.3)), p.z.add(e).mul(0.025), t.mul(0.15))).sub(n0).mul(6.0);
    // normalNode is expected in view space; a gentle world-space tilt reads fine for a far, dark sea
    return normalize(T.transformNormalToView(vec3(nx.negate(), float(1.0), nz.negate())));
  })();
  m.colorNode = mix(vec3(0.012, 0.018, 0.022), vec3(0.03, 0.035, 0.035), h(0.004, 0.004, 0.05, 0.5).add(0.5));
  m.roughnessNode = mix(float(0.12), float(0.3), U.snow);
  m.metalnessNode = float(0.0);
  shared = m;
  return m;
}
