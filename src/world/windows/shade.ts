// Living-window shader. One analytic tangent frame (no stored tangents): for a vertical wall,
// T = cross(up, N) matches the mesher's facade +X, and B = cross(N, T) points up the wall.
// Faces with |N.y| >= 0.35 stay flat. The texture sample sits in a real If and uses an explicit
// LOD so a fragment that fails the distance / footprint / grazing test does not fetch the atlas.
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';
import { ATLAS_COLS, ATLAS_GAIN, ATLAS_ROWS, ROOM_HERO } from './atlasImage';
import { windowAtlasTexture } from './atlas';
import { SCHED_BAND } from './facade';
import { W } from './state';

const T = TSL as any;
const {
  Fn, If, float, vec2, vec3, vec4, floor, step, smoothstep, mix, hash, select,
  min, max, abs, clamp, sin, dot, cross, normalize, length, textureLevel,
} = T;

export function scheduledLitNode(h1: any, litFrac: any, cell: any, seedQ: any): any {
  const base = step(h1, litFrac);
  const band = float(SCHED_BAND);
  const inBand = step(band, litFrac).mul(step(litFrac, float(1).sub(band)));
  const edge = step(abs(h1.sub(litFrac)), band).mul(inBand);
  const phaseU = hash(cell.x.mul(3).add(cell.y.mul(5)).add(seedQ));
  const period = floor(phaseU.mul(5)).add(3);
  const phase = hash(cell.y.mul(9).add(seedQ.mul(2))).mul(period);
  const bucket = floor(U.time.div(60).add(phase).div(period));
  const flip = step(hash(bucket.add(cell.x.mul(13)).add(cell.y).add(seedQ)), float(0.5));
  return mix(base, float(1).sub(base), edge.mul(flip));
}

function pickRoom(h: any, cuts: number[], ids: number[]): any {
  let room = float(ids[ids.length - 1]);
  for (let i = cuts.length - 1; i >= 0; i--) room = select(h.lessThan(cuts[i]), float(ids[i]), room);
  return room;
}

/** 1 when the fragment is inside a hero radius. */
export function heroMask(wpos: any): any {
  const d0 = length(wpos.sub(W.hero0));
  const d1 = length(wpos.sub(W.hero1));
  const d2 = length(wpos.sub(W.hero2));
  return step(min(d0, min(d1, d2)), W.radius);
}

export interface LivingArgs {
  winColor: any;
  litMask: any;
  winMask: any;
  flatInterior: any;
  flick: any;
  blend: any;
  lx: any;
  ly: any;
  lxW: any;
  h1: any;
  h2: any;
  h3: any;
  cell: any;
  seedQ: any;
  styleF: any;
  hero: any;
  blinds: any;
  mullion: any;
  distCam: any;
  viewToCam: any;
  normal: any;
}

/**
 * Near-window emissive (rgb) plus a 0..1 wet-glass factor (a).
 * The flat interior is the value when the branch is skipped.
 */
export function livingNear(p: LivingArgs): { rgb: any; wet: any } {
  const packed = Fn(() => {
    const base = p.winColor.mul(p.litMask).mul(p.winMask).mul(p.flatInterior).mul(p.flick);
    const out = vec3(base).toVar();
    const wet = float(0).toVar();
    If(p.blend.greaterThan(0.02), () => {
      const roomH = hash(p.h1.mul(2903).add(p.cell.x).add(p.seedQ.mul(3)));
      const residential = pickRoom(roomH, [0.46, 0.64, 0.7, 0.78, 0.88], [0, 1, 2, 3, 4, 5]);
      const office = pickRoom(roomH, [0.62, 0.78, 0.88, 0.96], [2, 5, 4, 3, 0]);
      const civic = pickRoom(roomH, [0.4, 0.62, 0.8, 0.92], [2, 3, 5, 4, 0]);
      const officeLike = step(1.5, p.styleF).mul(step(p.styleF, 2.5)).add(step(10.5, p.styleF).mul(step(p.styleF, 11.5)));
      const civicLike = step(6.5, p.styleF).mul(step(p.styleF, 7.5));
      const room = select(
        p.hero.greaterThan(0.5),
        float(ROOM_HERO),
        select(civicLike.greaterThan(0.5), civic, select(officeLike.greaterThan(0.5), office, residential)),
      );

      const N = p.normal;
      const Tng = normalize(cross(vec3(0, 1, 0), N));
      const B = normalize(cross(N, Tng));
      const ray = p.viewToCam.negate();
      const rdx = dot(ray, Tng);
      const rdy = dot(ray, B);
      const rdz = dot(ray, N.negate());

      const isOffice = step(1.5, room).mul(step(room, 2.5));
      const depth = hash(p.h2.mul(7001).add(p.cell.y).add(p.seedQ)).mul(0.75).add(0.85).add(isOffice.mul(0.45));
      const rox = clamp(p.lx, 0.02, 0.98);
      const roy = clamp(p.ly, 0.02, 0.98);
      const tx0 = select(rdx.lessThan(float(-0.02)), rox.negate().div(rdx), float(80));
      const tx1 = select(rdx.greaterThan(float(0.02)), float(1).sub(rox).div(rdx), float(80));
      const ty0 = select(rdy.lessThan(float(-0.02)), roy.negate().div(rdy), float(80));
      const ty1 = select(rdy.greaterThan(float(0.02)), float(1).sub(roy).div(rdy), float(80));
      const tz = select(rdz.greaterThan(float(0.02)), depth.div(max(rdz, 0.02)), float(80));
      const tX = min(tx0, tx1);
      const tY = min(ty0, ty1);
      const side = step(tX, tY).mul(step(tX, tz));
      const vert = step(tY, tX).mul(step(tY, tz)).mul(float(1).sub(side));
      const back = float(1).sub(max(side, vert));
      const tHit = min(tX, min(tY, tz));
      const hx = clamp(rox.add(rdx.mul(tHit)), 0, 1);
      const hy = clamp(roy.add(rdy.mul(tHit)), 0, 1);
      const hz = clamp(rdz.mul(tHit).div(max(depth, 0.2)), 0, 1);
      const uvx = side.mul(hz).add(vert.mul(hx)).add(back.mul(hx));
      const uvy = side.mul(hy).add(vert.mul(hz)).add(back.mul(hy));
      const faceY = vert.mul(mix(float(2), float(3), step(float(0), rdy))).add(side);
      const atlasUv = vec2(
        room.add(uvx.mul(0.92).add(0.04)).div(float(ATLAS_COLS)),
        faceY.add(uvy.mul(0.92).add(0.04)).div(float(ATLAS_ROWS)),
      );
      const rgb = textureLevel(windowAtlasTexture(), atlasUv, float(0)).rgb;
      const luma = dot(rgb, vec3(0.333333, 0.333333, 0.333334));
      let shaped = mix(vec3(luma), rgb, float(0.28)).mul(float(ATLAS_GAIN));

      const fold = sin(p.lx.mul(28)).mul(0.5).add(0.5);
      const foldGain = mix(float(0.89), float(1.11), fold);
      const curtain = mix(float(1), foldGain, step(float(0.84), p.h3).mul(step(p.blinds, float(0.45))));
      const mullionTerm = p.mullion.mul(0.85).add(0.15);
      shaped = shaped.mul(p.blinds).mul(mullionTerm).mul(curtain);

      const silRoll = hash(p.h2.mul(19).add(p.cell.x).add(p.seedQ));
      const apt = step(room, float(0.5));
      const silOn = step(float(1.5), W.mode).mul(step(p.distCam, max(W.silRange, float(0.001)))).mul(step(float(1), W.silRange))
        .mul(step(silRoll, float(0.035))).mul(apt).mul(back);
      const head = float(1).sub(smoothstep(float(0.07), float(0.12), length(vec2(uvx.sub(0.52), uvy.sub(0.62)))));
      const shoulders = float(1).sub(smoothstep(float(0.16), float(0.28), abs(uvx.sub(0.52))))
        .mul(float(1).sub(smoothstep(float(0.0), float(0.08), abs(uvy.sub(0.4)))))
        .mul(step(uvy, float(0.55)));
      const figure = max(head, shoulders);
      shaped = shaped.mul(mix(float(1), float(0.82), silOn.mul(figure)));

      // Three vertical bands and a coarse bead grid. A 9-band field with a fine droplet
      // hash read as static on a dark pane; these stay a few thin streaks and beads.
      const rainDist = float(1).sub(smoothstep(W.rainRange.mul(0.7), max(W.rainRange, float(1)), p.distCam)).mul(step(float(1), W.rainRange));
      const rainNear = smoothstep(float(0.08), float(0.2), U.rain).mul(rainDist);
      const col = fractSafe(p.lx.mul(3).add(p.h2.mul(4)));
      const aa = max(p.lxW.mul(3), float(0.003));
      const line = smoothstep(aa.add(0.045), aa.mul(0.25), abs(col.sub(0.22)));
      const dash = smoothstep(float(0.14), float(0.03), abs(fractSafe(p.ly.mul(1.6).sub(U.time.mul(0.16)).add(p.h3)).sub(0.38)));
      const dx = floor(p.lx.mul(7).add(p.h2.mul(13)));
      const dy = floor(p.ly.mul(11).sub(U.time.mul(0.2)).add(p.h1.mul(5)));
      const dh = hash(dx.mul(13).add(dy.mul(7)).add(p.cell.x));
      const dropUv = vec2(fractSafe(p.lx.mul(7)).sub(0.5), fractSafe(p.ly.mul(11)).sub(0.5));
      const drop = step(float(0.93), dh).mul(smoothstep(float(0.22), float(0.06), length(dropUv)));
      const glint = mix(vec3(0.55, 0.6, 0.66), p.winColor, float(0.22)).mul(line.mul(dash).mul(0.2).add(drop.mul(0.09))).mul(rainNear);

      const roomLit = p.winColor.mul(shaped).mul(p.litMask).mul(p.winMask).mul(p.flick);
      out.assign(mix(base, roomLit, p.blend).add(glint.mul(p.blend)));
      wet.assign(rainNear.mul(p.blend));
    });
    return vec4(out.x, out.y, out.z, wet);
  })();
  return { rgb: packed.xyz, wet: packed.w };
}

function fractSafe(n: any): any {
  return n.sub(floor(n));
}
