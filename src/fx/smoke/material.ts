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
  sin, cos, smoothstep, length, float, max, abs, floor, mod, uv, mix, exp, pow, texture,
  linearDepth, viewportDepthTexture, cameraFar, positionLocal, dot, step,
} = T;

/** Display-space body. 1 would paint the albedo at full exposure; soot sits under that. */
export const smokeBody = uniform(0.66);
/** Practicals tint the puff. Kept small so a sign does not blow the body to white. */
export const smokeLamp = uniform(0.07);
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
      const move = attribute('iMove', 'vec4');
      const mask = texture(smokeMask());
      m.positionNode = Fn(() => {
        const center = puff.xyz;
        const size = max(puff.w, float(0.05));
        const spin = shade.x;
        const stretch = max(move.w, float(0.75));
        const corner = positionLocal;
        const c = cos(spin);
        const s = sin(spin);
        const ox = corner.x.mul(c).sub(corner.y.mul(s));
        const oy = corner.x.mul(s).add(corner.y.mul(c));
        const toCam = normalize(cameraPosition.sub(center));
        // Long axis follows the plume, the trail, or world up. A view-aligned fallback
        // keeps the quad a billboard when that axis points at the camera.
        const raw = move.xyz;
        const axis = normalize(mix(raw, vec3(0, 1, 0), step(length(raw), float(0.2))));
        const aligned = abs(dot(axis, toCam));
        const fallback = normalize(mix(vec3(0, 0, 1), vec3(1, 0, 0), step(float(0.85), abs(axis.z))));
        const ref = normalize(mix(axis, fallback, smoothstep(float(0.82), float(0.98), aligned)));
        const side = normalize(cross(ref, toCam));
        const up = cross(toCam, side);
        return center.add(side.mul(ox.mul(size))).add(up.mul(oy.mul(size).mul(stretch)));
      })();
    m.colorNode = Fn(() => {
      const suv = uv();
      // shade.y packs the atlas cell in the integer part and a lamp weight in the fraction.
      const scaled = shade.y.mul(8.0);
      const cell = floor(scaled);
      const lampK = scaled.sub(cell);
      const col = mod(cell, float(4));
      const row = floor(cell.div(float(4)));
      const auv = vec2(col.div(4.0), row.div(2.0)).add(suv.mul(vec2(0.25, 0.5)));
      const n = mask.sample(auv);
      const rad = length(suv.sub(0.5));
      // The atlas is the puff. The radial term only kills the quad corners.
      const edge = smoothstep(float(0.9), float(0.52), rad);
      const torn = mix(n.r, n.r.mul(float(0.75).add(n.g.mul(0.4))), smokeDetail);
      const shape = pow(max(torn.mul(edge), float(0)), float(0.82));
      const size = max(puff.w, float(0.4));
      const sceneD = linearDepth(viewportDepthTexture());
      const selfD = linearDepth();
      const diff = sceneD.sub(selfD);
      const soft = max(size.mul(0.65), float(1.2)).div(cameraFar);
      const depthFade = mix(float(1), smoothstep(float(0), soft, diff), smoothstep(float(0), float(0.002), sceneD));
      const dist = length(cameraPosition.sub(puff.xyz));
      const nearF = smoothstep(max(float(0.45), size.mul(0.15)), max(float(1.6), size.mul(0.55)), dist);
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
        .add(lit.mul(smokeLamp).mul(lampK))
        .add(scatter.mul(lampK).mul(float(0.12)));
      return vec4(rgb, alpha);
    })();
    return m;
  });
}
