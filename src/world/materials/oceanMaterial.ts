// Dark, heavy, wind-chopped Pacific (procedural normal perturbation, no textures).
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';

const T = TSL as any;
const { Fn, vec3, positionWorld, cameraPosition, mx_noise_float, normalize, float, mix, uniform, pow, max, dot, exp, smoothstep } = T;

let shared: MeshStandardNodeMaterial | null = null;
const uStormSea = uniform(0);

/** 0 leaves the sea as it was. 1 eases the far plane toward the storm swell colour. */
export function setOceanStorm(amount: number): void {
  uStormSea.value = Math.max(0, Math.min(1, amount));
}

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
  const chop = mix(vec3(0.012, 0.018, 0.022), vec3(0.03, 0.035, 0.035), h(0.004, 0.004, 0.05, 0.5).add(0.5));
  // Storm only. uStormSea = 0 leaves `chop` untouched (the mix weight is zero).
  m.colorNode = Fn(() => {
    const deep = vec3(0.004, 0.008, 0.014);
    const shallow = vec3(0.02, 0.04, 0.05);
    const depth = float(6);
    const beer = mix(deep, shallow, exp(depth.mul(-0.18)));
    const n = normalize(vec3(0, 1, 0));
    const v = normalize(cameraPosition.sub(positionWorld));
    const ndv = max(dot(n, v), 0);
    const fres = float(0.02).add(float(0.98).mul(pow(float(1).sub(ndv), float(5))));
    const mirror = mix(U.fogColor, U.skyHorizon, float(0.65));
    const storm = mix(beer, mirror, fres.mul(0.35));
    const whitecap = smoothstep(float(0.62), float(0.9), h(0.008, 0.007, 0.12, 0.5).add(0.5)).mul(uStormSea).mul(0.45);
    return mix(mix(chop, storm, uStormSea), vec3(0.72, 0.76, 0.78), whitecap);
  })();
  // The shared environment is a neon horizon. A shiny sea turns those blotches into
  // colored lanes. Keep the Pacific matte; storm fresnel is in the colour node.
  m.roughness = 0.78;
  m.roughnessNode = mix(float(0.78), float(0.9), U.snow);
  m.metalnessNode = float(0.0);
  m.envMapIntensity = 0;
  shared = m;
  return m;
}
