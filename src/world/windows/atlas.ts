// Runtime room atlas. Facades have no other textures, so this does not compete with the sign atlas.
// 7 × 4 × 32 RGBA, no mips: 114,688 bytes. Linear, clamp, no color space (the bytes are reflectance).
import { ClampToEdgeWrapping, DataTexture, LinearFilter, NoColorSpace, RGBAFormat, UnsignedByteType, type Texture } from 'three/webgpu';
import { ATLAS_H, ATLAS_W, windowAtlasBytes } from './atlasImage';

let tex: Texture | null = null;

function dress(t: Texture): void {
  t.name = 'window-rooms';
  t.colorSpace = NoColorSpace;
  t.flipY = false;
  t.wrapS = ClampToEdgeWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
}

/** Install a prebuilt atlas. No-op once a texture is already in use. */
export function installWindowAtlas(t: Texture): void {
  if (tex) return;
  dress(t);
  tex = t;
}

export function windowAtlasTexture(): Texture {
  if (tex) return tex;
  const data = windowAtlasBytes();
  const t = new DataTexture(data, ATLAS_W, ATLAS_H, RGBAFormat, UnsignedByteType);
  dress(t);
  tex = t;
  return t;
}

export function windowAtlasBytesLength(): number {
  return ATLAS_W * ATLAS_H * 4;
}
