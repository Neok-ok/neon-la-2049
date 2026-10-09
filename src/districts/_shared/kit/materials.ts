// Shared node materials for the street kit. One material per pass, reused by every chunk.
import { AdditiveBlending, DoubleSide, MeshBasicNodeMaterial, MeshStandardNodeMaterial, NormalBlending } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from '../../../atmosphere/uniforms';
import { hologramSpill } from '../../../world/holograms/spill';

const T = TSL as any;
const { attribute, float, mix, smoothstep, abs, uv, vec3, vec4, positionLocal, sin, fract, cameraPosition, positionWorld, length } = T;

export type KitPass = 'opaque' | 'fade' | 'add';

let opaque: MeshStandardNodeMaterial | null = null;
let fade: MeshStandardNodeMaterial | null = null;
let add: MeshBasicNodeMaterial | null = null;
let steam: MeshBasicNodeMaterial | null = null;

function kitSurface(m: MeshStandardNodeMaterial, transparent: boolean): void {
  const col = attribute('color', 'vec3');
  const emi = attribute('emissive', 'vec3');
  const metal = attribute('metal', 'float');
  const alpha = attribute('alpha', 'float');
  // wet cloth/metal darkens like the city fabric
  const dark = mix(float(1), float(0.62), U.wetness.mul(float(transparent ? 0.3 : 0.85)));
  m.colorNode = col.mul(dark);
  m.emissiveNode = emi.mul(U.signPower).mul(U.night.mul(0.65).add(0.35)).add(hologramSpill());
  m.roughnessNode = mix(float(0.78), float(0.35), metal).mul(mix(float(1), float(0.55), U.wetness));
  m.metalnessNode = metal.mul(0.85);
  m.side = DoubleSide;
  if (transparent) {
    m.transparent = true;
    m.depthWrite = false;
    m.opacityNode = alpha;
  }
}

export function getKitMaterial(pass: KitPass): MeshStandardNodeMaterial | MeshBasicNodeMaterial {
  if (pass === 'add') {
    if (!add) {
      add = new MeshBasicNodeMaterial();
      add.transparent = true;
      add.depthWrite = false;
      add.blending = AdditiveBlending;
      add.side = DoubleSide;
      add.fog = true;
      const emi = attribute('emissive', 'vec3');
      const a = attribute('alpha', 'float');
      add.colorNode = vec4(emi.mul(U.signPower).mul(U.wetness.mul(0.65).add(0.35)).mul(U.night.mul(0.75).add(0.25)), a);
    }
    return add;
  }
  if (pass === 'fade') {
    if (!fade) {
      fade = new MeshStandardNodeMaterial();
      fade.blending = NormalBlending;
      kitSurface(fade, true);
    }
    return fade;
  }
  if (!opaque) {
    opaque = new MeshStandardNodeMaterial();
    kitSurface(opaque, false);
  }
  return opaque;
}

/**
 * Soft steam cards. `iSteam.x` is a per-instance seed.
 * positionLocal already includes the instance transform, so the puff only rises and drifts.
 */
export function getSteamMaterial(): MeshBasicNodeMaterial {
  if (steam) return steam;
  steam = new MeshBasicNodeMaterial();
  steam.transparent = true;
  steam.depthWrite = false;
  steam.blending = NormalBlending;
  steam.side = DoubleSide;
  steam.fog = true;
  const seed = attribute('iSteam', 'vec4').x;
  const life = fract(U.time.mul(0.18).add(seed));
  const drift = sin(U.time.mul(0.7).add(seed.mul(6.0))).mul(0.12);
  steam.positionNode = positionLocal.add(vec3(drift, life.mul(1.7), drift.mul(0.6)));
  const fade = sin(life.mul(Math.PI));
  const dist = length(positionWorld.sub(cameraPosition));
  const col = mix(vec3(0.78, 0.8, 0.82), U.fogColor.mul(2.4), float(0.4));
  steam.colorNode = vec4(col, fade.mul(0.32).mul(smoothstep(36.0, 5.0, dist)));
  return steam;
}

/** Ground light streak. Instance attribute iLight = rgb + intensity in w. UV fade. */
let pool: MeshBasicNodeMaterial | null = null;
export function getPoolMaterial(): MeshBasicNodeMaterial {
  if (pool) return pool;
  pool = new MeshBasicNodeMaterial();
  pool.transparent = true;
  pool.depthWrite = false;
  pool.blending = AdditiveBlending;
  pool.fog = true;
  pool.polygonOffset = true;
  pool.polygonOffsetFactor = -1;
  pool.polygonOffsetUnits = -1;
  const light = attribute('iLight', 'vec4');
  const u = uv();
  const across = smoothstep(float(0.5), float(0.05), abs(u.x.sub(0.5)));
  const along = smoothstep(float(0.5), float(0.02), abs(u.y.sub(0.5)));
  const fade = across.mul(along);
  // when the planar reflector is on, keep the pools as a coloured boost rather than a second mirror
  const strength = mix(float(1), float(0.45), U.reflMix);
  pool.colorNode = vec4(
    light.xyz.mul(light.w).mul(fade).mul(U.wetness).mul(U.night.mul(0.85).add(0.15)).mul(U.signPower).mul(strength),
    fade.mul(U.wetness).mul(0.85),
  );
  return pool;
}
