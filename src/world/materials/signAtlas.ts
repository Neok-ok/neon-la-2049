// Runtime sign atlas. Procedural canvas by default; a KTX2 upload can replace it
// before the first material is built (see compressedAtlases.ts).
import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, SRGBColorSpace, type Texture } from 'three/webgpu';
import { paintSignAtlas } from './signPaint';

let texture: Texture | null = null;

function dress(t: Texture): void {
  t.name = 'sign-atlas';
  t.colorSpace = SRGBColorSpace;
  t.wrapS = ClampToEdgeWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
}

/** Install a prebuilt atlas. No-op once a texture is already in use. */
export function installSignAtlas(t: Texture): void {
  if (texture) return;
  dress(t);
  texture = t;
}

export function getSignAtlas(): Texture {
  if (texture) return texture;
  const canvas = document.createElement('canvas');
  paintSignAtlas(canvas);
  const canvasTex = new CanvasTexture(canvas);
  dress(canvasTex);
  texture = canvasTex;
  return texture;
}
