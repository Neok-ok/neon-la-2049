// Bone-palette skinning for instanced crowds.
// Dudash, "Animated Crowd Rendering", GPU Gems 3, ch. 2: one texture holds every
// clip's bone matrices, and each instance picks a clip and a frame. We store the
// 3×4 skin matrix (rotation plus the translated bind) rather than a vertex
// animation texture, because twenty bones are much smaller than every vertex.
//
// Packing is original: each matrix element is a uint16 split across two UNORM
// bytes, two elements per texel. textureLoad is three.js's texel fetch
// (r186 TextureNode.setSampler(false)), so the sample is not filtered.
import type { Texture } from 'three/webgpu';
import * as TSL from 'three/tsl';

const T = TSL as any;

export interface SkinnedPose {
  position: any;
  normal: any;
}

function frameBlend(phase: any, frames: number, clip: any) {
  const f = T.fract(phase).mul(frames);
  const f0 = T.int(f);
  const f1 = T.int(T.mod(T.float(f0).add(1), T.float(frames)));
  const base = T.int(T.round(clip)).mul(T.int(frames));
  return { row0: base.add(f0), row1: base.add(f1), blend: T.fract(f) };
}

/** Twelve skin-matrix elements for one bone, linearly blended across the two nearest frames. */
export function boneElements(
  palette: Texture,
  lo: number,
  hi: number,
  frames: number,
  bone: any,
  clip: any,
  phase: any,
) {
  const unpack = (ch: any) => {
    const q = T.round(ch.x.mul(255)).mul(256).add(T.round(ch.y.mul(255))).div(65535);
    return T.mix(T.float(lo), T.float(hi), q);
  };
  const loadRow = (row: any) => {
    const x0 = bone.mul(T.int(6));
    const elems: any[] = [];
    for (let i = 0; i < 6; i++) {
      const px = T.textureLoad(palette, T.ivec2(x0.add(T.int(i)), row));
      elems.push(unpack(px.xy), unpack(px.zw));
    }
    return elems;
  };
  const { row0, row1, blend } = frameBlend(phase, frames, clip);
  const e0 = loadRow(row0);
  const e1 = loadRow(row1);
  return e0.map((a, i) => T.mix(a, e1[i], blend));
}

function applyElements(e: any[], p: any, translate: boolean) {
  return T.vec3(
    e[0].mul(p.x).add(e[1].mul(p.y)).add(e[2].mul(p.z)).add(translate ? e[3] : 0),
    e[4].mul(p.x).add(e[5].mul(p.y)).add(e[6].mul(p.z)).add(translate ? e[7] : 0),
    e[8].mul(p.x).add(e[9].mul(p.y)).add(e[10].mul(p.z)).add(translate ? e[11] : 0),
  );
}

/**
 * Skin `position` and `normal` with a two-frame blend.
 * `phase` is 0..1 inside the clip. `clip` is the row block (0 for a single loop).
 * The palette width is bones × 6 texels; the bone id is an integer node.
 */
export function paletteSkin(
  palette: Texture,
  lo: number,
  hi: number,
  frames: number,
  bone: any,
  clip: any,
  phase: any,
  position: any,
  normal: any,
): SkinnedPose {
  const e = boneElements(palette, lo, hi, frames, bone, clip, phase);
  return {
    position: applyElements(e, position, true),
    normal: T.normalize(applyElements(e, normal, false)),
  };
}

/**
 * Two-influence linear blend skinning. `weight` is the second bone's share
 * (0 keeps `bone`, 1 is entirely `bone2`). Frame blend stays inside each bone,
 * then the two skinned positions are mixed, so a knee or a coat hem can share
 * both bones instead of tearing when the matrices are interpolated.
 */
export function paletteSkinWeighted(
  palette: Texture,
  lo: number,
  hi: number,
  frames: number,
  bone: any,
  bone2: any,
  weight: any,
  clip: any,
  phase: any,
  position: any,
  normal: any,
): SkinnedPose {
  const a = boneElements(palette, lo, hi, frames, bone, clip, phase);
  const b = boneElements(palette, lo, hi, frames, bone2, clip, phase);
  const pa = applyElements(a, position, true);
  const pb = applyElements(b, position, true);
  const na = applyElements(a, normal, false);
  const nb = applyElements(b, normal, false);
  return {
    position: T.mix(pa, pb, weight),
    normal: T.normalize(T.mix(na, nb, weight)),
  };
}
