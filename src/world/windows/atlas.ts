// Runtime room atlas. Facades have no other textures, so this does not compete with the sign atlas.
// 7 × 4 × 32 RGBA, no mips: 114,688 bytes. Linear, clamp, no color space (the bytes are reflectance).
import { ClampToEdgeWrapping, DataTexture, LinearFilter, NoColorSpace, RGBAFormat, UnsignedByteType } from 'three/webgpu';
import { ATLAS_H, ATLAS_W, windowAtlasBytes } from './atlasImage';

let tex: DataTexture | null = null;

export function windowAtlasTexture(): DataTexture {
  if (tex) return tex;
  const data = windowAtlasBytes();
  const t = new DataTexture(data, ATLAS_W, ATLAS_H, RGBAFormat, UnsignedByteType);
  t.name = 'window-rooms';
  t.colorSpace = NoColorSpace;
  t.flipY = false;
  t.wrapS = ClampToEdgeWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  tex = t;
  return t;
}

export function windowAtlasBytesLength(): number {
  return ATLAS_W * ATLAS_H * 4;
}
