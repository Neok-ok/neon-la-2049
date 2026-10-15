// Instanced camera-facing quads. The fragment is a noise mask, a depth fade
// against the opaque buffer, and the city's practicals. Not a curtain and not a march.
import { DoubleSide, MeshBasicNodeMaterial, NormalBlending } from 'three/webgpu';
import { uniform } from 'three/tsl';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';
import { resources } from '../../core/memory';
import { authoredLiftU, practicalInscatter, practicalLit } from '../../lighting/shade.ts';
import { smokeMask } from './noise';

const T = TSL as any;
const {
  Fn, attribute, vec2, vec3, vec4, normalize, cross, cameraPosition, positionWorld,
  sin, cos, smoothstep, length, float, max, abs, floor, mod, uv, mix, exp, texture,
  linearDepth, viewportDepthTexture, cameraFar, positionLocal,
} = T;

/** Display-space body. 1 would paint the albedo at full exposure; steam sits under that. */
export const smokeBody = uniform(0.58);
/** How hard a practical tints the puff, in nits mixed onto the lifted body. */
export const smokeLamp = uniform(0.42);
/** 0 low, 1 high/ultra. Mixes the second mask. */
export const smokeDetail = uniform(1);

export function smokeMaterial(): MeshBasicNodeMaterial {
  return resources.material('smoke-puff', () => {
    const m = new MeshBasicNodeMaterial();
    m.transparent = true;
    m.depthWrite = false;
    m.depthTest = true;
    m.blending = NormalBlending;
    m.side = DoubleSide;
    m.fog = false;
    const puff = attribute('iPuff', 'vec4');
    const shade = attribute('iShade', 'vec4');
    const tint = attribute('iTint', 'vec4');
    const mask = texture(smokeMask());
    m.positionNode = Fn(() => {
      const center = puff.xyz;
      const size = max(puff.w, float(0.05));
      const spin = shade.x;
      const aspect = max(tint.w, float(0.35));
      const corner = positionLocal;
      const c = cos(spin);
      const s = sin(spin);
      const ox = corner.x.mul(c).sub(corner.y.mul(s));
      const oy = corner.x.mul(s).add(corner.y.mul(c));
      const toCam = normalize(cameraPosition.sub(center));
      const upRef = normalize(mix(vec3(0, 1, 0), vec3(0, 0, 1), smoothstep(float(0.25), float(0.92), abs(toCam.y))));
      const right = normalize(cross(upRef, toCam));
      const up = cross(toCam, right);
      return center.add(right.mul(ox.mul(size))).add(up.mul(oy.mul(size).mul(aspect)));
    })();
    m.colorNode = Fn(() => {
      const suv = uv();
      const cell = floor(shade.y.mul(7.999));
      const col = mod(cell, float(4));
      const row = floor(cell.div(float(4)));
      const auv = vec2(col.div(4.0), row.div(2.0)).add(suv.mul(vec2(0.25, 0.5)));
      const n = mask.sample(auv);
      const p = suv.sub(0.5);
      const disc = smoothstep(float(0.52), float(0.08), length(p));
      const detail = mix(float(1), n.g, smokeDetail);
      const shape = n.r.mul(detail).mul(disc);
      const size = max(puff.w, float(0.4));
      const sceneD = linearDepth(viewportDepthTexture());
      const selfD = linearDepth();
      const diff = sceneD.sub(selfD);
      const soft = max(size.mul(0.65), float(1.2)).div(cameraFar);
      const depthFade = mix(float(1), smoothstep(float(0), soft, diff), smoothstep(float(0), float(0.002), sceneD));
      const dist = length(cameraPosition.sub(puff.xyz));
      const nearF = smoothstep(float(0.55), float(2.2), dist);
      const fogF = exp(dist.mul(U.fogDensity).mul(-3.2));
      const lifeA = shade.w;
      const alpha = shape.mul(lifeA).mul(depthFade).mul(nearF).mul(fogF);
      const heat = shade.z;
      const warm = vec3(1.0, 0.48, 0.16);
      const albedo = mix(tint.xyz, warm, heat.mul(0.72));
      const world = positionWorld;
      const V = normalize(cameraPosition.sub(world));
      const N = normalize(V.add(vec3(0, 0.55, 0)));
      const lit = practicalLit(world, N, V, albedo);
      const scatter = practicalInscatter(world);
      const rgb = albedo.mul(authoredLiftU).mul(smokeBody)
        .add(lit.mul(smokeLamp))
        .add(scatter.mul(float(3.5)));
      return vec4(rgb, alpha);
    })();
    return m;
  });
}
