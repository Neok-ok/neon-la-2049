// Lit billboards. The card faces the camera. A flipbook breaks the disc up,
// a depth fade (NVIDIA SDK 10 soft particles) kills the hard cut against a wall,
// and the lighting registry tints the puff. Output is premultiplied.
//
// Each card is a spherical billboard (Umenhoffer, ShaderX): the quad corner is a
// disc, the normal faces the camera at the crown and turns away at the rim.
// The stamp's valleys multiply that light, so a column has a dark interior.
// The launch adds 1800 K on the underside, from the engine, not a flat wash.
import {
  CustomBlending, DoubleSide, MeshBasicNodeMaterial, OneFactor, OneMinusSrcAlphaFactor,
} from 'three/webgpu';
import { uniform } from 'three/tsl';
import * as TSL from 'three/tsl';
import { fogDepth } from '../../atmosphere/SkyFog';
import { U } from '../../atmosphere/uniforms';
import { resources } from '../../core/memory';
import { PRESETS } from '../../lighting/presets.ts';
import { practicalInscatter, practicalLit } from '../../lighting/shade.ts';
import { smokeAtlas } from './atlas';

const T = TSL as any;
const {
  Fn, abs, attribute, cameraPosition, cameraNear, cameraFar, clamp, cos, cross, exp, float, length, max, mix,
  mx_noise_float, normalize, perspectiveDepthToViewZ, positionView, screenUV, select, sin, smoothstep,
  texture, vec2, vec3, vec4, viewportDepthTexture,
} = T;

/** 1 fades against the scene depth. 0 keeps a soft disc if the depth copy is empty. */
export const smokeSoft = uniform(1);
export const smokeRain = uniform(0);

const FLAME = PRESETS.flare.rgb;

function shade(lit: boolean): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial();
  m.transparent = true;
  m.depthWrite = false;
  m.depthTest = true;
  m.side = DoubleSide;
  m.fog = false;
  m.blending = CustomBlending;
  m.blendSrc = OneFactor;
  m.blendDst = OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = OneFactor;
  m.blendDstAlpha = OneMinusSrcAlphaFactor;
  m.premultipliedAlpha = true;
  m.forceSinglePass = true;

  const ctr = attribute('sctr', 'vec4');
  const meta = attribute('smeta', 'vec4');
  const extra = attribute('sxtra', 'vec4');
  const corner = attribute('scorner', 'vec2');
  const atlas = smokeAtlas();

  m.positionNode = Fn(() => {
    const center = ctr.xyz;
    const toCam = normalize(cameraPosition.sub(center));
    const ref = select(abs(toCam.y).greaterThan(0.92), vec3(1, 0, 0), vec3(0, 1, 0));
    const side = normalize(cross(ref, toCam));
    const up = normalize(cross(toCam, side));
    const size = max(ctr.w, 0.05);
    // A small spin so stacked quads do not share an edge. Aspect stays the long axis.
    const ang = meta.z.sub(0.5).mul(0.28);
    const cs = cos(ang);
    const sn = sin(ang);
    const sx = corner.x;
    const sy = corner.y.mul(extra.y);
    const px = sx.mul(cs).sub(sy.mul(sn));
    const py = sx.mul(sn).add(sy.mul(cs));
    return center.add(side.mul(px.mul(size))).add(up.mul(py.mul(size)));
  })();

  m.colorNode = Fn(() => {
    const life = meta.x;
    const kind = meta.y;
    const seed = meta.z;
    const alphaIn = meta.w;
    const frame = T.floor(T.fract(life.mul(0.92).add(seed.mul(2.7))).mul(8.0));
    const col = T.mod(frame, 4.0);
    const row = T.floor(frame.div(4.0));
    const ang = seed.sub(0.5).mul(0.28);
    const cs = cos(ang);
    const sn = sin(ang);
    const u = corner.x.mul(cs).sub(corner.y.mul(sn));
    const v = corner.x.mul(sn).add(corner.y.mul(cs));
    const cu = clamp(u.mul(0.5).add(0.5), 0.04, 0.96);
    const cv = clamp(v.mul(0.5).add(0.5), 0.04, 0.96);
    const uv = vec2(col.add(cu).div(4.0), row.add(cv).div(2.0));
    const stamp = texture(atlas, uv);
    const n = mx_noise_float(vec3(
      ctr.x.mul(0.55).add(corner.x.mul(2.8)).add(seed.mul(4.1)),
      ctr.y.mul(0.62).add(corner.y.mul(3.4)).add(life.mul(0.4)),
      ctr.z.mul(0.55).add(seed.mul(2.2)),
    ));
    const lumps = smoothstep(float(-0.15), float(0.75), n);

    const column = smoothstep(6.15, 6.85, kind).mul(float(1).sub(smoothstep(7.55, 8.15, kind)));
    const groundK = smoothstep(7.55, 8.15, kind);
    const launchBody = column.add(groundK);
    const r = length(corner);
    // Wide rim falloff. A short smoothstep left the quad edge as a staircase.
    const erode = mix(float(0.62), float(1), smoothstep(float(-0.45), float(0.55), n));
    const shape = smoothstep(float(0.02), float(0.22), stamp.a).mul(smoothstep(float(1.35), float(0.42), r)).mul(erode);

    const toCam = normalize(cameraPosition.sub(ctr.xyz));
    const ref = select(abs(toCam.y).greaterThan(0.92), vec3(1, 0, 0), vec3(0, 1, 0));
    const side = normalize(cross(ref, toCam));
    const up = normalize(cross(toCam, side));
    const nxy = stamp.rg.mul(2.0).sub(1.0);
    // Camera-facing, with an upward bias so a sodium head lights the puff.
    // A spherical normal turned every card into a ball.
    const localN = normalize(vec3(nxy.x.mul(0.65), nxy.y.mul(0.4).add(0.62), float(0.9)));
    const N = normalize(side.mul(localN.x).add(up.mul(localN.y)).add(toCam.mul(localN.z)));
    const V = toCam;
    const cavity = mix(float(0.1), float(1), smoothstep(float(0.12), float(0.7), stamp.a)).mul(mix(float(0.35), float(1), lumps));

    // 0–3 steam, 4–6 soot (barrel, stack, exhaust), 7 column, 8 ground.
    const steam = float(1).sub(smoothstep(3.15, 3.85, kind));
    const barrel = smoothstep(3.55, 4.05, kind).mul(float(1).sub(smoothstep(4.45, 4.95, kind)));
    const stack = smoothstep(4.55, 5.05, kind).mul(float(1).sub(smoothstep(5.45, 5.95, kind)));
    const exhaustK = smoothstep(5.55, 6.05, kind).mul(float(1).sub(launchBody));
    const albedo = vec3(0.92, 0.93, 0.95).mul(steam)
      .add(vec3(0.28, 0.27, 0.26).mul(barrel))
      .add(vec3(0.48, 0.47, 0.45).mul(stack))
      .add(vec3(0.62, 0.63, 0.65).mul(exhaustK))
      .add(vec3(0.7, 0.7, 0.72).mul(launchBody));
    // Unlit colour stays on the fog. authoredLift painted this at window brightness.
    const body = U.fogColor.mul(albedo).mul(0.35);
    // A few nits, under an 18-nit window. The crease is what keeps a card from glowing flat.
    // Stack ash sits under an 18-nit window and above the night sky, so the column reads.
    const ash = vec3(0.92, 0.93, 0.95).mul(steam).mul(7.0)
      .add(vec3(0.32, 0.3, 0.28).mul(barrel).mul(6.5))
      .add(vec3(0.55, 0.54, 0.52).mul(stack).mul(12.0))
      .add(vec3(0.82, 0.84, 0.86).mul(exhaustK).mul(14.0))
      .add(vec3(0.66, 0.67, 0.7).mul(launchBody).mul(8.0));

    const world = ctr.xyz;
    const litScale = float(lit ? 1.85 : 1.15);
    const scatterK = lit ? 1.15 : 0.35;
    const lamps = practicalLit(world, N, V, albedo).mul(litScale).add(practicalInscatter(world).mul(scatterK));
    // Flame sits on the mouth of a barrel or stack, and on the launch core.
    const heatGain = column.mul(0.22).add(barrel.mul(0.28)).add(stack.mul(0.3)).add(exhaustK.mul(0.1)).add(steam.mul(0.04));
    const coreDisc = smoothstep(float(0.42), float(0.02), r);
    const py = corner.x.mul(sn).add(corner.y.mul(extra.y).mul(cs));
    const down = py.div(max(extra.y, float(0.25)));
    const mouth = smoothstep(float(0.15), float(-0.85), down);
    const heatMask = mix(mouth, coreDisc, column);
    const heat = vec3(FLAME[0], FLAME[1], FLAME[2])
      .mul(extra.x)
      .mul(heatGain)
      .mul(heatMask)
      .mul(cavity)
      .mul(smoothstep(0.92, 0.08, life))
      .mul(7.0);
    // Inner sheath cards carry more heat. Their underside takes the engine colour.
    const inner = smoothstep(float(0.05), float(0.62), extra.x);
    // The bottom of the card faces the engine. The crown of the billow stays grey.
    const under = smoothstep(float(0.2), float(-0.75), down);
    const warm = vec3(FLAME[0], FLAME[1], FLAME[2])
      .mul(launchBody)
      .mul(inner)
      .mul(under)
      .mul(cavity)
      .mul(16.0);
    const hot = smoothstep(float(0.82), float(1.15), extra.x).mul(column);
    const core = vec3(1.35, 0.72, 0.28).mul(hot).mul(coreDisc).mul(cavity).mul(3.0);
    // A barrel flare should light the mouth, not turn the soot into a lantern.
    const lampBody = mix(float(1), float(0.32), barrel).mul(mix(float(1), float(0.28), stack));
    const steamLamp = mix(float(1), float(1.45), steam);
    const rgb = body.mul(cavity).add(ash.mul(cavity)).add(lamps.mul(mix(float(0.45), float(1.15), cavity)).mul(lampBody).mul(steamLamp)).add(heat).add(warm).add(core);

    const dist = length(ctr.xyz.sub(cameraPosition));
    const thin = smoothstep(extra.w, extra.w.mul(0.22), dist);
    const sceneZ = perspectiveDepthToViewZ(viewportDepthTexture(screenUV), cameraNear, cameraFar);
    const gap = positionView.z.sub(sceneZ);
    const soft = smoothstep(0.0, max(extra.z, 0.25), gap);
    const depthAlive = float(1).sub(smoothstep(float(-3.0), float(-0.35), sceneZ));
    const softFade = mix(float(1), soft, smokeSoft.mul(depthAlive));
    const rainDim = mix(float(1), float(0.82), smokeRain);
    // Street cards thin with the same fog as the flame. The launch keeps its own fade.
    const streetish = float(1).sub(launchBody);
    const closeKind = float(1).sub(smoothstep(float(4.4), float(5.1), kind));
    const fogA = exp(fogDepth(cameraPosition, ctr.xyz).mul(-1.6));
    const avenue = smoothstep(float(40), float(14), dist);
    const farCut = mix(float(1), avenue, closeKind);
    const a = shape.mul(alphaIn).mul(thin).mul(softFade).mul(rainDim).mul(mix(float(1), fogA.mul(farCut), streetish));
    return vec4(rgb.mul(a), a);
  })();
  return m;
}

let litMat: MeshBasicNodeMaterial | null = null;
let flatMat: MeshBasicNodeMaterial | null = null;

export function smokeMaterial(lit: boolean): MeshBasicNodeMaterial {
  if (lit) {
    if (!litMat) litMat = resources.material('smoke-billboard', () => shade(true));
    return litMat;
  }
  if (!flatMat) flatMat = resources.material('smoke-billboard-low', () => shade(false));
  return flatMat;
}
