// Runtime room atlas. Facades have no other textures, so this does not compete with the sign atlas.
// 7 × 4 × 32 RGBA, no mips: 114,688 bytes. Linear, clamp, no color space (the bytes are reflectance).
import { ClampToEdgeWrapping, DataTexture, LinearFilter, NoColorSpace, RGBAFormat, UnsignedByteType, type Texture } from 'three/webgpu';
import { resources } from '../../core/memory/resources';
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

/** Install a prebuilt atlas. No-op once a texture is already in use, so the procedural copy is not kept beside KTX2. */
export function installWindowAtlas(t: Texture): void {
  if (tex) return;
  dress(t);
  tex = t;
  resources.tag(t, { label: 'window-rooms', owner: 'windows' });
  resources.markStreamed(t);
}

export function windowAtlasTexture(): Texture {
  if (tex) return tex;
  const data = windowAtlasBytes();
  const t = resources.texture(
    () => new DataTexture(data, ATLAS_W, ATLAS_H, RGBAFormat, UnsignedByteType),
    { label: 'window-rooms', owner: 'windows' },
  );
  dress(t);
  tex = t;
  resources.markStreamed(t);
  return t;
}

export function windowAtlasBytesLength(): number {
  return ATLAS_W * ATLAS_H * 4;
}
