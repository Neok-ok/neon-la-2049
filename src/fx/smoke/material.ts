// Instanced camera-facing quads. The fragment is a noise mask, a depth fade
// against the opaque buffer, and the city's practicals. Not a curtain and not a march.
import { DoubleSide, MeshBasicNodeMaterial, NormalBlending } from 'three/webgpu';
import { uniform } from 'three/tsl';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';
import { resources } from '../../core/memory';
import { authoredLiftU, lanternPool, practicalInscatter, practicalLit } from '../../lighting/shade.ts';
import { smokeMask } from './noise';

const T = TSL as any;
const {
  Fn, attribute, vec2, vec3, vec4, normalize, cross, cameraPosition, positionWorld,
  sin, cos, smoothstep, length, float, max, min, abs, floor, mod, uv, mix, exp, pow, texture,
  positionLocal, positionView, dot, step, clamp, viewportDepthTexture,
  perspectiveDepthToViewZ, cameraNear, cameraFar,
} = T;

/** Display-space body. 1 would paint the albedo at full exposure; soot sits under that. */
export const smokeBody = uniform(0.66);
/** Practicals tint the puff. Steam takes more of this than the plume. */
export const smokeLamp = uniform(0.85);
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
      // tint.w is 0 on the plume and 1 on steam. Steam fades early so the quad
      // corner never reads as a hard disc.
      const softBody = tint.w;
      const edgeIn = mix(float(0.14), float(0.0), softBody);
      const edgeOut = mix(float(0.8), float(0.58), softBody);
      // A reversed smoothstep is undefined on SwiftShader and cuts a quad into a triangle.
      const edgeDisc = float(1).sub(smoothstep(edgeIn, edgeOut, rad));
      // Plume only (tint.w is 0). A gaussian dies before the quad corner.
      const plumeK = float(1).sub(smoothstep(float(0.0), float(0.22), softBody));
      // Stall keeps the tight disc (lamp weight near 1). Grate and exhaust soften so
      // overlapping puffs read as one mass. The stack (tint.w 0.72) stays as it was.
      // smoothstep edges stay in ascending order.
      const blendSoft = float(1).sub(smoothstep(float(0.55), float(0.9), lampK));
      const notStack = smoothstep(float(0.74), float(0.82), softBody);
      const columnSoft = notStack.mul(blendSoft);
      const ragged = max(rad.add(n.r.sub(0.5).mul(0.1)), float(0));
      const edgePlume = exp(ragged.mul(ragged).mul(float(-6.4)));
      const edgeWide = float(1).sub(smoothstep(float(0.02), float(0.7), rad));
      const edgeSteam = mix(edgeDisc, edgeWide, columnSoft);
      const edge = mix(edgeSteam, edgePlume, plumeK);
      const torn = mix(n.r, n.r.mul(float(0.55).add(n.g.mul(0.7))), smokeDetail);
      const fray = mix(float(1), float(0.5).add(n.g.mul(0.7)), softBody);
      const grain = float(0.42).add(n.g.mul(0.78));
      const shapePow = mix(mix(float(0.8), float(1.15), columnSoft), float(1.35), plumeK);
      const shape = pow(max(torn.mul(edge).mul(grain).mul(fray), float(0)), shapePow);
      const size = max(puff.w, float(0.4));
      // Soft particles, NVIDIA / Lorach, the same curve as three's softParticles().
      // Inlined: that helper names a GLSL argument `input`, which WebGL rejects.
      const band = min(max(size.mul(0.16), float(0.18)), float(1.6));
      const sceneZ = perspectiveDepthToViewZ(viewportDepthTexture(), cameraNear, cameraFar);
      const delta = clamp(positionView.z.sub(sceneZ).div(band), 0, 1);
      const above = step(float(0.5), delta);
      const folded = mix(delta, float(1).sub(delta), above);
      const half = pow(clamp(folded.mul(2), 0, 1), float(1.35)).mul(0.5);
      const depthFade = mix(half, float(1).sub(half), above);
      const dist = length(cameraPosition.sub(puff.xyz));
      const nearF = smoothstep(max(float(0.45), size.mul(0.15)), max(float(1.6), size.mul(0.55)), dist);
      const fogF = exp(dist.mul(U.fogDensity).mul(-3.2));
      const lifeA = shade.w;
      const alpha = shape.mul(lifeA).mul(depthFade).mul(nearF).mul(fogF);
      const heat = shade.z;
      // Engine light is white-hot in the core and amber at the edge. Steam keeps heat at 0,
      // so this mix never paints a flame into a grate or a pot.
      const warm = mix(vec3(1.0, 0.55, 0.22), vec3(1.05, 0.96, 0.82), smoothstep(float(0.35), float(0.95), heat));
      const world = positionWorld;
      const V = normalize(cameraPosition.sub(world));
      // A downward bias lets a sign under the puff light the belly.
      const N = normalize(V.add(vec3(0, 0.35, 0)));
      // 0 is a backlit plume (dark core, bright rim). Steam and the stack stay filled.
      const rimHard = smoothstep(float(0.05), float(0.42), rad);
      const rimSoft = smoothstep(float(0.2), float(0.78), rad);
      const rim = mix(rimHard, rimSoft, plumeK);
      // Noise breaks the bright rim so a lone puff is not a hard ring.
      const rimNoise = float(0.35).add(n.r.mul(0.9));
      const back = mix(float(0.1), float(1.45).mul(rimNoise), rim);
      const front = mix(float(1.08), float(0.4), rim);
      const phase = mix(back, front, softBody);
      const under = smoothstep(float(0.1), float(0.88), float(1).sub(suv.y));
      const plume = float(1).sub(smoothstep(float(0.0), float(0.2), softBody));
      const belly = max(under, plume.mul(float(0.42)));
      const albedo = mix(tint.xyz, warm, heat.mul(belly).mul(mix(float(0.28), float(0.62), plume)));
      const lit = practicalLit(world, N, V, albedo);
      const scatter = practicalInscatter(world);
      const underK = mix(float(1), float(0.55).add(under.mul(0.85)), lampK);
      // Noise across the puff, so one side of a billboard is not the same brightness.
      const mottled = float(0.48).add(n.r.mul(0.4)).add(n.g.mul(0.46));
      const lampShade = float(0.55).add(n.r.mul(0.7));
      // Grate and stall are tint.w = 1. The street pool lights the belly; it does not recolor the vapor.
      const steam = smoothstep(float(0.9), float(0.99), softBody);
      const rgb = albedo.mul(authoredLiftU).mul(smokeBody).mul(phase).mul(underK)
        .add(lit.mul(smokeLamp).mul(lampK).mul(float(0.45).add(under)).mul(lampShade))
        .add(scatter.mul(lampK).mul(float(0.35)).mul(lampShade))
        .add(lanternPool(world).mul(under).mul(steam).mul(float(0.65)))
        .add(warm.mul(heat).mul(belly).mul(float(1).sub(rim.mul(0.4))).mul(authoredLiftU).mul(float(0.22)).mul(mix(float(1), float(0.35), lampK)));
      return vec4(rgb.mul(mottled), alpha);
    })();
    return m;
  });
}
