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
        // 0.50 stall, 0.53 exhaust. Low stall steps toward the lens, off the pot.
        // Medium and above stay where they were when that still passed: the lit
        // wall is just behind the card, and a lens step erased it.
        // Exhaust steps up along the trail. Toward the lens from a rear camera
        // pushed the plume down onto the roof.
        const lowK = float(1).sub(smoothstep(float(0.05), float(0.2), smokeDetail));
        const exhaustK = smoothstep(float(0.512), float(0.528), tint.w);
        const trailAx = normalize(mix(move.xyz, vec3(0, 1, 0), step(length(move.xyz), float(0.2))));
        // Horizontal only. The full camera vector lifted the wisp off the rim
        // and into the black wall.
        const camXZ = vec3(toCam.x, float(0), toCam.z);
        const toCamXZ = camXZ.div(max(length(camXZ), float(0.001)));
        const stallClear = toCamXZ.mul(size.mul(0.08).mul(puffK).mul(float(1).sub(exhaustK)).mul(lowK));
        const exhaustClear = vec3(trailAx.x.mul(0.35), abs(trailAx.y).add(0.8), trailAx.z.mul(0.35)).mul(size.mul(0.1).mul(exhaustK));
        // Low stall cards were centered on the lid, so the pot clipped a hole
        // and the visible mass sat above the rim. Lift the card so its foot is the lid.
        const stallUp = vec3(float(0), size.mul(0.4), float(0)).mul(puffK).mul(float(1).sub(exhaustK)).mul(lowK);
        return center.add(side.mul(ox.mul(size))).add(up.mul(oy.mul(size).mul(stretch))).add(stallClear).add(exhaustClear).add(stallUp);
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
      const stackK = smoothstep(float(0.68), float(0.71), softBody).mul(float(1).sub(smoothstep(float(0.745), float(0.78), softBody)));
      // Plume: a noise-warped body, dead before the quad corner. A tight gaussian
      // read as a stack of spheres once the puffs stopped overlapping.
      const warp = vec2(n.r.sub(0.5).mul(0.32), n.g.sub(0.5).mul(0.26));
      const warped = length(suv.sub(0.5).add(warp));
      const lobe = n.r.mul(0.62).add(n.g.mul(0.38));
      const plumeBody = float(1).sub(smoothstep(float(0.04), float(0.56), warped));
      const plumeGrain = float(0.28).add(smoothstep(float(0.16), float(0.72), lobe).mul(0.85));
      // Low is smokeDetail 0. Medium is 0.45, so this is 0 there and the
      // medium stall mask stays the one that passed.
      const lowK = float(1).sub(smoothstep(float(0.05), float(0.2), smokeDetail));
      const cornerMed = float(1).sub(smoothstep(float(0.44), float(0.68), rad));
      // The flat side of a launch card is r = 0.5. Low cards are the largest,
      // and that side was still bright. The body of the mask is unchanged.
      const cornerLow = cornerMed.mul(float(1).sub(smoothstep(float(0.46), float(0.5), rad)));
      const cornerKill = mix(cornerLow, cornerMed, smoothstep(float(0.05), float(0.2), smokeDetail));
      const edgePlume = plumeBody.mul(plumeGrain).mul(cornerKill);
      const edgeWide = float(1).sub(smoothstep(float(0.02), float(0.7), rad));
      const edgeSteam = mix(edgeDisc, edgeWide, columnSoft);
      // Grate and vent on Low. Detail 0 left alpha on the quad side, so the
      // street column read as cards. The stack (0.72) and Medium stay put.
      const grateK = smoothstep(float(0.9), float(0.98), softBody);
      // Low street was a tight disc, so the column broke into coins. A longer
      // feather still dies before the quad side.
      const grateClip = float(1).sub(smoothstep(float(0.22), float(0.52), rad));
      const stackR = length(suv.sub(0.5).add(vec2(n.r.sub(0.5).mul(0.18), n.g.sub(0.5).mul(0.14))));
      const stackBody = float(1).sub(smoothstep(float(0.0), float(0.58), stackR));
      const stackEdge = float(1).sub(smoothstep(float(0.32), float(0.55), rad));
      const edgeStack = stackBody.mul(stackEdge).mul(float(0.8).add(lobe.mul(0.25)));
      const edgeSteamUse = mix(edgeSteam, edgeSteam.mul(mix(float(1), grateClip, grateK)), lowK);
      const edgeRound = mix(mix(edgeSteamUse, edgeStack, stackK), edgePlume, plumeK);
      // 0.50 stall, 0.53 exhaust. Medium stall is the warped disc from the
      // passing still. Exhaust above Low keeps the gaussian. Low cannot share
      // either: the disc's tear cut a hole on the black wall, and the gaussian
      // was still bright at r = 0.5, which is the straight card edge.
      const puffK = smoothstep(float(0.42), float(0.48), softBody).mul(float(1).sub(smoothstep(float(0.56), float(0.64), softBody)));
      const exhaustK = smoothstep(float(0.512), float(0.528), softBody);
      const puffWarp = vec2(n.r.sub(0.5).mul(0.7).add(n.g.sub(0.5).mul(0.22)), n.g.sub(0.5).mul(0.62));
      const puffR = length(suv.sub(0.5).add(puffWarp));
      const puffBreak = n.r.mul(n.g);
      const puffBody = float(1).sub(smoothstep(float(0.0), float(0.5).add(puffBreak.mul(0.2)), puffR));
      // A deep tear read as holes on the lit wall. A shallow nick keeps the disc from going cut-paper.
      const puffTear = smoothstep(float(0.78), float(0.96), n.g).mul(smoothstep(float(0.4), float(0.7), rad));
      const puffCorner = float(1).sub(smoothstep(float(0.4), float(0.66), rad));
      const puffEdgeDisc = puffBody.mul(float(1).sub(puffTear.mul(0.12))).mul(puffCorner).mul(float(0.86).add(lobe.mul(0.22)));
      const puffWarpG = vec2(n.r.sub(0.5).mul(0.42).add(n.g.sub(0.5).mul(0.16)), n.g.sub(0.5).mul(0.38));
      const puffRG = length(suv.sub(0.5).add(puffWarpG));
      // The gaussian was still bright on the flat side of the quad. That side
      // is the card edge in the exhaust column on every tier above Low.
      // Exhaust on every tier. The core falls off immediately and the rim feathers
      // out before the quad side, so the trail is not a stack of bulbs.
      const feather = float(1).sub(smoothstep(float(0.16), float(0.48), rad));
      const puffGauss = exp(puffRG.mul(puffRG).mul(float(-3.6))).mul(feather).mul(float(0.55).add(lobe.mul(0.28)));
      // Low stall. Filled across the mouth, a short warp so the center does not
      // open a hole, and empty before the quad's flat side.
      const puffWarpL = vec2(n.r.sub(0.5).mul(0.22).add(n.g.sub(0.5).mul(0.1)), n.g.sub(0.5).mul(0.18));
      const puffRL = length(suv.sub(0.5).add(puffWarpL));
      const stallBody = float(1).sub(smoothstep(float(0.0), float(0.52).add(n.r.mul(0.04)), puffRL));
      const stallRim = float(1).sub(smoothstep(float(0.4), float(0.5), rad));
      const puffStall = stallBody.mul(stallRim).mul(float(0.84).add(lobe.mul(0.2)));
      const er = length(suv.sub(0.5).add(vec2(n.r.sub(0.5).mul(0.12), n.g.sub(0.5).mul(0.08))));
      const puffExhaust = exp(er.mul(er).mul(float(-3.6))).mul(feather).mul(float(0.55).add(lobe.mul(0.28)));
      const puffSoft = mix(puffStall, puffExhaust, exhaustK);
      const puffEdgeHi = mix(puffEdgeDisc, puffGauss, exhaustK);
      const puffEdge = mix(puffEdgeHi, puffSoft, lowK);
      const edge = mix(edgeRound, puffEdge, puffK);
      const tornRaw = mix(n.r, n.r.mul(float(0.55).add(n.g.mul(0.7))), smokeDetail);
      const torn = mix(tornRaw, float(0.78).add(n.r.mul(0.22)), grateK.mul(lowK));
      const frayRound = mix(float(1), float(0.5).add(n.g.mul(0.7)), softBody);
      const frayDisc = float(0.88).add(n.g.mul(0.2));
      const frayGauss = float(0.92).add(n.g.mul(0.1));
      const fraySoft = float(0.97).add(n.g.mul(0.04));
      const fray = mix(frayRound, mix(mix(frayDisc, frayGauss, exhaustK), fraySoft, lowK), puffK);
      const grain = float(0.42).add(n.g.mul(0.78));
      const grainDisc = float(0.78).add(n.g.mul(0.3));
      const grainGauss = float(0.9).add(n.g.mul(0.12));
      const grainSoft = float(0.94).add(n.g.mul(0.08));
      const grainUse = mix(grain, mix(mix(grainDisc, grainGauss, exhaustK), grainSoft, lowK), puffK);
      const tornDisc = float(0.88).add(tornRaw.mul(0.18));
      const tornGauss = float(0.94).add(n.r.mul(0.08));
      // Medium and above launch was torn into gaps. Low keeps the mask that cleared.
      const tornPlume = float(0.82).add(n.r.mul(0.16));
      const tornColumn = mix(torn, tornPlume, plumeK.mul(float(1).sub(lowK)));
      const tornUse = mix(tornColumn, mix(mix(tornDisc, tornGauss, exhaustK), float(0.98), lowK), puffK);
      const powHi = mix(float(0.62), float(0.75), exhaustK);
      const powLow = mix(float(0.92), float(0.8), exhaustK);
      const powPuff = mix(powHi, powLow, lowK);
      const shapePow = mix(mix(mix(float(0.8), float(1.15), columnSoft), float(1.35), plumeK), powPuff, puffK);
      const shape = pow(max(tornUse.mul(edge).mul(grainUse).mul(fray), float(0)), shapePow);
      const size = max(puff.w, float(0.4));
      // Soft particles, NVIDIA / Lorach, the same curve as three's softParticles().
      // Inlined: that helper names a GLSL argument `input`, which WebGL rejects.
      // Column, plume, and medium stall keep the 0.18 m floor and contrast 1.35.
      // A wider band treated the lit stall wall, about 20 cm behind the card, as
      // an intersection and erased the steam. Low cards are smaller than that
      // floor, so the same band cut a hole. Low fades across the card itself.
      const bandColumn = min(max(size.mul(0.16), min(float(0.18), size.mul(1.2))), float(1.6));
      const card = max(puff.w, float(0.05));
      const bandExhaust = max(card.mul(0.45), float(0.1));
      // Stall sits about 20 cm in front of the lit wall. A 0.18 m band treated
      // that wall as an intersection and erased the steam. Five centimetres
      // feathers the lid and leaves the wall alone. Exhaust keeps a wider band.
      const bandStall = float(0.05);
      const bandLow = clamp(card.mul(mix(float(0.42), float(0.34), exhaustK)), float(0.042), mix(float(0.06), float(0.14), exhaustK));
      const bandPuff = mix(bandStall, bandExhaust, exhaustK);
      const band = mix(bandColumn, mix(bandPuff, bandLow, lowK), puffK);
      const contrast = mix(float(1.35), mix(mix(float(1.35), float(1.0), exhaustK), float(1.0), lowK), puffK);
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
      // Medium stall was darker than the lit wall, so the vapor disappeared.
      // Low needs a smaller lift on the black interior. Exhaust stays near the
      // body so the trail does not blow out white.
      const stallLift = mix(float(1.5), float(1.28), lowK);
      const puffBright = mix(float(1.0), mix(stallLift, float(1.08), exhaustK), puffK);
      return vec4(rgb.mul(mottled).mul(puffBright), alpha);
    })();
    return m;
  });
}
