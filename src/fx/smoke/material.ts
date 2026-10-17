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
        // Stall and exhaust only. A camera-facing card is one depth, so a card
        // born in the pot or the bumper is clipped into a flat polygon. Shift
        // that card into clear air. Plume, stack, and grate stay put.
        const puffK = smoothstep(float(0.42), float(0.48), tint.w).mul(float(1).sub(smoothstep(float(0.56), float(0.64), tint.w)));
        // 0.50 stall, 0.53 exhaust. Stall steps toward the lens, off the pot.
        // Exhaust steps up along the trail. Toward the lens from a rear camera
        // pushed the plume down onto the roof.
        const exhaustK = smoothstep(float(0.512), float(0.528), tint.w);
        const trailAx = normalize(mix(move.xyz, vec3(0, 1, 0), step(length(move.xyz), float(0.2))));
        const stallClear = toCam.mul(size.mul(0.12).mul(puffK).mul(float(1).sub(exhaustK)));
        const exhaustClear = vec3(trailAx.x.mul(0.35), abs(trailAx.y).add(0.8), trailAx.z.mul(0.35)).mul(size.mul(0.1).mul(exhaustK));
        return center.add(side.mul(ox.mul(size))).add(up.mul(oy.mul(size).mul(stretch))).add(stallClear).add(exhaustClear);
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
      // tint.w: 0 plume, 0.5 soft puff, 0.72 stack, 1 grate and vent.
      const softBody = tint.w;
      const edgeIn = mix(float(0.14), float(0.0), softBody);
      const edgeOut = mix(float(0.8), float(0.58), softBody);
      // A reversed smoothstep is undefined on SwiftShader and cuts a quad into a triangle.
      const edgeDisc = float(1).sub(smoothstep(edgeIn, edgeOut, rad));
      const plumeK = float(1).sub(smoothstep(float(0.0), float(0.22), softBody));
      // Grate softens into one mass. The stack (tint.w 0.72) stays on the tight disc.
      // smoothstep edges stay in ascending order.
      const blendSoft = float(1).sub(smoothstep(float(0.55), float(0.9), lampK));
      const notStack = smoothstep(float(0.74), float(0.82), softBody);
      const columnSoft = notStack.mul(blendSoft);
      // Plume: a noise-warped body, dead before the quad corner. A tight gaussian
      // read as a stack of spheres once the puffs stopped overlapping.
      const warp = vec2(n.r.sub(0.5).mul(0.32), n.g.sub(0.5).mul(0.26));
      const warped = length(suv.sub(0.5).add(warp));
      const lobe = n.r.mul(0.62).add(n.g.mul(0.38));
      const plumeBody = float(1).sub(smoothstep(float(0.04), float(0.56), warped));
      const plumeGrain = float(0.28).add(smoothstep(float(0.16), float(0.72), lobe).mul(0.85));
      const cornerKill = float(1).sub(smoothstep(float(0.44), float(0.68), rad));
      const edgePlume = plumeBody.mul(plumeGrain).mul(cornerKill);
      const edgeWide = float(1).sub(smoothstep(float(0.02), float(0.7), rad));
      const edgeSteam = mix(edgeDisc, edgeWide, columnSoft);
      const edgeRound = mix(edgeSteam, edgePlume, plumeK);
      // Soft puff (stall, exhaust). A gaussian billboard: density is exp(-r^2),
      // warped by the atlas, and still falling at the quad corner. A smoothstep
      // disc plus a noise tear read as a cut-paper hole on the stall's black wall,
      // and as a coin at the tailpipe. The edge does not use smokeDetail, so Low
      // (detail 0) keeps the same falloff as Medium.
      const puffK = smoothstep(float(0.42), float(0.48), softBody).mul(float(1).sub(smoothstep(float(0.56), float(0.64), softBody)));
      const puffWarp = vec2(n.r.sub(0.5).mul(0.42).add(n.g.sub(0.5).mul(0.16)), n.g.sub(0.5).mul(0.38));
      const puffR = length(suv.sub(0.5).add(puffWarp));
      const puffKFall = float(5.4).add(lobe.mul(1.5));
      const puffBody = exp(puffR.mul(puffR).mul(puffKFall).mul(float(-1)));
      const puffMottle = float(0.78).add(lobe.mul(0.28));
      const puffEdge = puffBody.mul(puffMottle);
      const edge = mix(edgeRound, puffEdge, puffK);
      const torn = mix(n.r, n.r.mul(float(0.55).add(n.g.mul(0.7))), smokeDetail);
      const frayRound = mix(float(1), float(0.5).add(n.g.mul(0.7)), softBody);
      const fray = mix(frayRound, float(0.92).add(n.g.mul(0.1)), puffK);
      const grain = float(0.42).add(n.g.mul(0.78));
      const grainUse = mix(grain, float(0.9).add(n.g.mul(0.12)), puffK);
      const tornUse = mix(torn, float(0.94).add(n.r.mul(0.08)), puffK);
      const shapePow = mix(mix(mix(float(0.8), float(1.15), columnSoft), float(1.35), plumeK), float(1.0), puffK);
      const shape = pow(max(tornUse.mul(edge).mul(grainUse).mul(fray), float(0)), shapePow);
      const size = max(puff.w, float(0.4));
      // Soft particles, NVIDIA / Lorach, the same curve as three's softParticles().
      // Inlined: that helper names a GLSL argument `input`, which WebGL rejects.
      // Column and plume keep the 0.18 m floor and contrast 1.35.
      // A stall or exhaust card is smaller than that floor. Contrast 1.35 then
      // collapsed the fade into one pixel against the pot or the bumper, which
      // is the cut-paper edge. Those cards fade linearly across their own size.
      const bandColumn = min(max(size.mul(0.16), min(float(0.18), size.mul(1.2))), float(1.6));
      // Only the last few centimetres. A wider band treated a lit stall wall
      // 20 cm behind the card as an intersection and erased the steam.
      const bandPuff = max(max(puff.w, float(0.05)).mul(0.45), float(0.1));
      const band = mix(bandColumn, bandPuff, puffK);
      const contrast = mix(float(1.35), float(1.0), puffK);
      const sceneZ = perspectiveDepthToViewZ(viewportDepthTexture(), cameraNear, cameraFar);
      const delta = clamp(positionView.z.sub(sceneZ).div(band), 0, 1);
      const above = step(float(0.5), delta);
      const folded = mix(delta, float(1).sub(delta), above);
      const half = pow(clamp(folded.mul(2), 0, 1), contrast).mul(0.5);
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
      // A bright ring on each plume puff is the sphere stack. The crown stays
      // close to one brightness; noise does the breakup.
      const rimNoise = float(0.35).add(n.r.mul(0.9));
      const rimPlume = smoothstep(float(0.3), float(0.72), warped).mul(float(0.3).add(n.r.mul(0.35)));
      const backSoft = mix(float(0.55), float(1.2).mul(rimNoise), rim);
      const backPlume = mix(float(0.84), float(1.02), rimPlume);
      const back = mix(backSoft, backPlume, plumeK);
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
      // Grate is tint.w = 1. Stall wisps sit at 0.93 and still take the pool.
      const steam = max(smoothstep(float(0.9), float(0.99), softBody), puffK);
      const rgb = albedo.mul(authoredLiftU).mul(smokeBody).mul(phase).mul(underK)
        .add(lit.mul(smokeLamp).mul(lampK).mul(float(0.45).add(under)).mul(lampShade))
        .add(scatter.mul(lampK).mul(float(0.35)).mul(lampShade))
        .add(lanternPool(world).mul(under).mul(steam).mul(float(0.65)))
        .add(warm.mul(heat).mul(belly).mul(float(1).sub(rim.mul(0.4))).mul(authoredLiftU).mul(float(0.22)).mul(mix(float(1), float(0.35), lampK)));
      // Puffs have to read on a lit beige wall and on the black Low interior.
      // The shared body is tuned for the plume; this lift is stall and exhaust only.
      const puffBright = mix(float(1.0), float(1.55), puffK);
      return vec4(rgb.mul(mottled).mul(puffBright), alpha);
    })();
    return m;
  });
}
