// Runtime sign atlas. Procedural canvas by default; a KTX2 upload can replace it
// before the first material is built (see compressedAtlases.ts).
import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, SRGBColorSpace, type Texture } from 'three/webgpu';
import { resources } from '../../core/memory/resources';
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

/** Install a prebuilt atlas. No-op once a texture is already in use, so the canvas is not kept beside KTX2. */
export function installSignAtlas(t: Texture): void {
  if (texture) return;
  dress(t);
  texture = t;
  resources.tag(t, { label: 'sign-atlas', owner: 'signs' });
  resources.markStreamed(t);
}

export function getSignAtlas(): Texture {
  if (texture) return texture;
  const canvasTex = resources.texture(() => {
    const canvas = document.createElement('canvas');
    paintSignAtlas(canvas);
    return new CanvasTexture(canvas);
  }, { label: 'sign-atlas', owner: 'signs' });
  dress(canvasTex);
  texture = canvasTex;
  resources.markStreamed(canvasTex);
  return texture;
}
