// One steam material and one spark material for the district. Shared across chunks.
// iPart.x is the seed. iPart.y is 2 for a static plume (low tier) and 4 for the pour flare.
import { AdditiveBlending, DoubleSide, MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';

const T = TSL as any;
const { attribute, float, mix, sin, fract, positionLocal, positionWorld, cameraPosition, length, vec3, vec4, smoothstep } = T;

let steam: MeshBasicNodeMaterial | null = null;
let spark: MeshBasicNodeMaterial | null = null;

/** Soft cards. Plumes (kind 2) stay put. Vents and grates rise and drift. */
export function getArtsSteamMaterial(): MeshBasicNodeMaterial {
  if (steam) return steam;
  steam = new MeshBasicNodeMaterial();
  steam.transparent = true;
  steam.depthWrite = false;
  steam.blending = AdditiveBlending;
  steam.side = DoubleSide;
  steam.fog = false;
  steam.name = 'arts-steam';
  const part = attribute('iPart', 'vec4');
  const seed = part.x;
  const kind = part.y;
  // Kind 2 is a stack plume and stays put. Vents and grates rise.
  const still = smoothstep(1.25, 1.75, kind);
  const life = fract(U.time.mul(0.16).add(seed));
  const drift = sin(U.time.mul(0.65).add(seed.mul(6.0))).mul(0.16);
  const rise = life.mul(1.8);
  steam.positionNode = positionLocal.add(vec3(
    drift.mul(float(1).sub(still)),
    rise.mul(float(1).sub(still)),
    drift.mul(0.55).mul(float(1).sub(still)),
  ));
  const fade = mix(sin(life.mul(Math.PI)), float(0.92), still);
  const dist = length(positionWorld.sub(cameraPosition));
  const sodium = vec3(1.0, 0.58, 0.24);
  const driftBody = mix(vec3(0.78, 0.8, 0.82), sodium, U.night.mul(0.42));
  const body = mix(driftBody, vec3(0.95, 0.9, 0.78), still);
  const distFade = float(1).sub(smoothstep(36.0, 520.0, dist));
  steam.colorNode = vec4(body, fade.mul(mix(float(0.5), float(0.92), still)).mul(distFade));
  return steam;
}

/** Additive sparks. Kind 4 is the pour flare: slower, wider, still a loop. */
export function getArtsSparkMaterial(): MeshBasicNodeMaterial {
  if (spark) return spark;
  spark = new MeshBasicNodeMaterial();
  spark.transparent = true;
  spark.depthWrite = false;
  spark.blending = AdditiveBlending;
  spark.side = DoubleSide;
  spark.fog = true;
  spark.name = 'arts-spark';
  const part = attribute('iPart', 'vec4');
  const seed = part.x;
  const flare = smoothstep(3.5, 4.5, part.y);
  const rate = mix(float(0.9), float(0.28), flare);
  const life = fract(U.time.mul(rate).add(seed));
  const drift = sin(U.time.mul(1.6).add(seed.mul(9.0))).mul(0.28);
  const rise = life.mul(mix(float(2.6), float(1.4), flare));
  spark.positionNode = positionLocal.add(vec3(drift, rise, drift.mul(0.45)));
  const fade = sin(life.mul(Math.PI));
  const dist = length(positionWorld.sub(cameraPosition));
  const col = mix(vec3(1.0, 0.46, 0.1), vec3(1.0, 0.7, 0.26), flare);
  const distFade = float(1).sub(smoothstep(6.0, 48.0, dist));
  spark.colorNode = vec4(col.mul(mix(float(0.9), float(1.15), flare)), fade.mul(0.62).mul(distFade));
  return spark;
}
