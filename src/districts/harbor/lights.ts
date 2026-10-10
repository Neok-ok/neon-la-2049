// Sodium work lights. One additive billboard mesh for the whole port, so a mast
// still reads after the block has dropped to far LOD. No scene light.
// The angular floor is the same idea as the refinery flame sprite.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Mesh, MeshBasicNodeMaterial,
  type Object3D,
} from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';
import { fogDepth } from '../../atmosphere/SkyFog';
import type { WorkLight } from './sites';

const T = TSL as any;
const {
  Fn, attribute, vec3, vec4, normalize, cross, cameraPosition, sin, smoothstep, length, float, max, exp, clamp,
} = T;

/** Apparent size floor, as a fraction of distance, so a mast still marks the basin from LAX. */
const MIN_ANGLE = 0.0016;

let material: MeshBasicNodeMaterial | null = null;

function lightMaterial(): MeshBasicNodeMaterial {
  if (material) return material;
  const m = new MeshBasicNodeMaterial();
  m.transparent = true;
  m.depthWrite = false;
  m.blending = AdditiveBlending;
  m.fog = false;
  const c = attribute('lctr', 'vec4');
  const k = attribute('lcrn', 'vec4');
  m.positionNode = Fn(() => {
    const center = c.xyz;
    const toCam = normalize(cameraPosition.sub(center));
    const side = normalize(cross(vec3(0, 1, 0), toCam));
    const up = normalize(cross(toCam, side));
    const seed = k.z;
    const flick = sin(U.time.mul(2.4).add(seed.mul(20.0))).mul(0.06).add(1.0);
    const authored = c.w.mul(flick);
    const dist = length(center.sub(cameraPosition));
    const s = max(authored, dist.mul(MIN_ANGLE));
    return center.add(side.mul(k.x.mul(s))).add(up.mul(k.y.mul(s)));
  })();
  m.colorNode = Fn(() => {
    const r = length(k.xy);
    const core = smoothstep(0.2, 0.9, r).oneMinus();
    const hot = vec3(1.0, 0.96, 0.86);
    const body = vec3(1.0, 0.62, 0.22);
    const col = body.add(hot.mul(core));
    const dist = length(c.xyz.sub(cameraPosition));
    const authored = c.w;
    const world = max(authored, dist.mul(MIN_ANGLE));
    const spread = clamp(authored.div(world), 0.22, 1.0);
    const att = exp(fogDepth(cameraPosition, c.xyz).mul(-0.07));
    const day = U.night.mul(0.72).add(0.28);
    return vec4(col.mul(spread).mul(att).mul(day).mul(1.35), float(1));
  })();
  material = m;
  return m;
}

export function mountHarborLights(parent: Object3D, lights: readonly WorkLight[]): Mesh | null {
  if (!lights.length) return null;
  const n = lights.length;
  const pos = new Float32Array(n * 4 * 3);
  const ctr = new Float32Array(n * 4 * 4);
  const crn = new Float32Array(n * 4 * 4);
  const idx = new Uint32Array(n * 6);
  const cs = [-1, -1, 1, -1, 1, 1, -1, 1];
  for (let i = 0; i < n; i++) {
    const f = lights[i]!;
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
  g.setAttribute('lctr', new BufferAttribute(ctr, 4));
  g.setAttribute('lcrn', new BufferAttribute(crn, 4));
  g.setIndex(new BufferAttribute(idx, 1));
  const mesh = new Mesh(g, lightMaterial());
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.name = 'harbor-lights';
  parent.add(mesh);
  return mesh;
}
