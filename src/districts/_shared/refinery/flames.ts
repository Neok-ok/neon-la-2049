// City-wide flare sprites. One mesh, not a chunk detail, so the field still reads
// from downtown and from a kilometre up after the blocks have dropped to far LOD.
// Flicker, a wind shear, and a tier gain. No scene light: the spill quad is in the plan.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Mesh, MeshBasicNodeMaterial, Vector2,
  type Object3D,
} from 'three/webgpu';
import { uniform } from 'three/tsl';
import * as TSL from 'three/tsl';
import { U } from '../../../atmosphere/uniforms';
import { fogDepth } from '../../../atmosphere/SkyFog';
import type { Tier } from '../../../core/quality';
import type { RefineryFlame } from './plan';

const T = TSL as any;
const {
  Fn, attribute, vec3, vec4, normalize, cross, cameraPosition, sin, smoothstep, length, float, max, clamp, exp,
} = T;

/** World-space metres the flame top shears toward. App writes this from the weather wind. */
export const flareWind = uniform(new Vector2(1.8, 0.4));
/** 1 is the medium flame. High and ultra sit above it. */
export const flareGain = uniform(1);

const GAIN: Record<Tier, number> = { low: 0.62, medium: 0.92, high: 1.28, ultra: 1.6 };

/** Apparent size floor, as a fraction of distance, so a stack still marks the horizon. */
const MIN_ANGLE = 0.0042;

export function setRefineryFlame(tier: Tier, windRad: number, wind: number): void {
  flareGain.value = GAIN[tier];
  const lean = 1.5 + Math.min(12, Math.max(0, wind)) * 0.55;
  flareWind.value.set(Math.cos(windRad) * lean, Math.sin(windRad) * lean);
}

let material: MeshBasicNodeMaterial | null = null;

function flameMaterial(): MeshBasicNodeMaterial {
  if (material) return material;
  const m = new MeshBasicNodeMaterial();
  m.transparent = true;
  m.depthWrite = false;
  m.blending = AdditiveBlending;
  m.fog = false;
  const c = attribute('fctr', 'vec4');
  const k = attribute('fcrn', 'vec4');
  m.positionNode = Fn(() => {
    const center = c.xyz;
    const toCam = normalize(cameraPosition.sub(center));
    const side = normalize(cross(vec3(0, 1, 0), toCam));
    const up = normalize(cross(toCam, side));
    const seed = k.z;
    const flick = sin(U.time.mul(9.2).add(seed.mul(40.0))).mul(0.11)
      .add(sin(U.time.mul(17.4).add(seed.mul(11.0))).mul(0.06))
      .add(1.0);
    const authored = c.w.mul(flick).mul(float(0.82).add(flareGain.mul(0.18)));
    const dist = length(center.sub(cameraPosition));
    const s = max(authored, dist.mul(MIN_ANGLE));
    // 0 at the base corner, 1 at the tip. The wind lives in that shear.
    const lift = k.y.mul(0.5).add(0.5);
    return center
      .add(side.mul(k.x.mul(s)))
      .add(up.mul(k.y.mul(s).mul(1.55)))
      .add(vec3(0, s.mul(0.42), 0))
      .add(vec3(flareWind.x, 0, flareWind.y).mul(lift));
  })();
  m.colorNode = Fn(() => {
    const seed = k.z;
    const r = length(k.xy);
    const n = sin(k.x.mul(3.0).add(k.y.mul(5.0)).sub(U.time.mul(4.0)).add(seed.mul(12.0))).mul(0.5).add(0.5);
    const core = smoothstep(0.15, 0.85, r.add(n.mul(0.28))).oneMinus();
    const hot = vec3(1.0, 0.92, 0.62);
    const body = vec3(1.0, 0.38, 0.06);
    const col = body.mul(core).add(hot.mul(smoothstep(0.0, 0.42, r).oneMinus()));
    const dist = length(c.xyz.sub(cameraPosition));
    const authored = c.w;
    const world = max(authored, dist.mul(MIN_ANGLE));
    const spread = clamp(authored.div(world), 0.38, 1.0);
    const att = exp(fogDepth(cameraPosition, c.xyz).mul(-0.16));
    const day = U.night.mul(0.62).add(0.38);
    const a = col.mul(spread).mul(att).mul(day).mul(flareGain).mul(2.6);
    return vec4(a, float(1));
  })();
  material = m;
  return m;
}

/**
 * Add one flare mesh for `flames`. Empty input adds nothing.
 * A second district can call this with its own list; the material and the wind are shared.
 */
export function mountRefineryFlames(parent: Object3D, flames: readonly RefineryFlame[], name = 'refinery-flares'): Mesh | null {
  if (!flames.length) return null;
  const n = flames.length;
  const pos = new Float32Array(n * 4 * 3);
  const ctr = new Float32Array(n * 4 * 4);
  const crn = new Float32Array(n * 4 * 4);
  const idx = new Uint32Array(n * 6);
  const cs = [-1, -1, 1, -1, 1, 1, -1, 1];
  for (let i = 0; i < n; i++) {
    const f = flames[i]!;
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      ctr.set([f.x, f.y, f.z, f.size], v * 4);
      crn.set([cs[k * 2]!, cs[k * 2 + 1]!, f.seed, 0], v * 4);
      pos.set([f.x, f.y, f.z], v * 3);
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('fctr', new BufferAttribute(ctr, 4));
  g.setAttribute('fcrn', new BufferAttribute(crn, 4));
  g.setIndex(new BufferAttribute(idx, 1));
  const mesh = new Mesh(g, flameMaterial());
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}
