// Rigged pedestrian. One instanced draw. The mesh is the plate body; the shader
// skins it from the bone palette and then hides the outfit parts the instance
// is not wearing. Scale stays uniform so a 1.55 m person and a 1.91 m person
// keep the same proportions.
import {
  BufferGeometry, DataTexture, LinearFilter, MeshStandardNodeMaterial, NearestFilter,
  NoColorSpace, RGBAFormat, SRGBColorSpace, TextureLoader, UnsignedByteType,
  type Texture, type WebGPURenderer,
} from 'three/webgpu';
import * as TSL from 'three/tsl';
import type { Tier } from '../../core/quality';
import { resources } from '../../core/memory';
import { U } from '../../atmosphere/uniforms';
import { loadHumanGeometry } from './gltfGeom';
import { disposeHumanKtx, preferHumanKtx2, textureGpuBytes, transcodeKtx2 } from './ktx';
import { paletteSkin } from './paletteSkin';

const T = TSL as any;

export type CrowdLod = 'low' | 'medium' | 'high';

const BONES = 20;
const FRAMES = 16;
const PAL_W = BONES * 6;
const PAL_H = 9 * FRAMES;
const PAL_LO = -1.5;
const PAL_HI = 2.5;

export function crowdLodForTier(tier: Tier): CrowdLod {
  if (tier === 'low') return 'low';
  if (tier === 'medium') return 'medium';
  return 'high';
}

function url(file: string): string {
  return `${import.meta.env.BASE_URL}models/humans/${file}`;
}

function loadPalette(): Promise<Texture> {
  return fetch(url('crowd-palette.bin')).then((res) => {
    if (!res.ok) throw new Error(`crowd palette ${res.status}`);
    return res.arrayBuffer();
  }).then((buf) => {
    const data = new Uint8Array(buf);
    if (data.byteLength !== PAL_W * PAL_H * 4) {
      throw new Error(`crowd palette ${data.byteLength} bytes, expected ${PAL_W * PAL_H * 4}`);
    }
    // Nearest uint16 bone pairs. Mip bias would average neighbouring bones, so this stays off the streamed list.
    const tex = resources.texture(
      () => new DataTexture(data, PAL_W, PAL_H, RGBAFormat, UnsignedByteType),
      { label: 'crowd-palette', owner: 'humans' },
    );
    tex.magFilter = NearestFilter;
    tex.minFilter = NearestFilter;
    tex.generateMipmaps = false;
    tex.flipY = false;
    tex.colorSpace = NoColorSpace;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    return tex;
  });
}

const ATLAS_W = 512;
const ATLAS_H = 512;

function loadAtlasPng(): Promise<Texture> {
  return new Promise((resolve, reject) => {
    new TextureLoader().load(url('crowd-atlas.png'), (tex) => {
      tex.colorSpace = SRGBColorSpace;
      tex.flipY = false;
      tex.magFilter = LinearFilter;
      tex.minFilter = LinearFilter;
      tex.generateMipmaps = false;
      resources.tag(tex, { label: 'crowd-atlas', owner: 'humans' });
      resolve(tex);
    }, undefined, reject);
  });
}

async function loadAtlas(renderer?: WebGPURenderer | null): Promise<{ texture: Texture; gpuBytes: number; kind: 'ktx2' | 'png' }> {
  if (preferHumanKtx2(renderer)) {
    try {
      const res = await fetch(url('crowd-atlas.ktx2'));
      if (!res.ok) throw new Error(`crowd atlas ktx2 ${res.status}`);
      const tex = await transcodeKtx2(renderer as WebGPURenderer, await res.arrayBuffer());
      tex.colorSpace = SRGBColorSpace;
      tex.flipY = false;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      resources.tag(tex, { label: 'crowd-atlas', owner: 'humans' });
      return { texture: tex, gpuBytes: textureGpuBytes(tex, ATLAS_W, ATLAS_H), kind: 'ktx2' };
    } catch (err) {
      console.warn('crowd atlas ktx2', err);
    }
  }
  const texture = await loadAtlasPng();
  return { texture, gpuBytes: ATLAS_W * ATLAS_H * 4, kind: 'png' };
}

function band(part: any, a: number, b: number) {
  return T.step(a, part).mul(T.step(part, b));
}

let rigSerial = 0;

function crowdMaterial(palette: Texture, atlas: Texture): MeshStandardNodeMaterial {
  const key = rigSerial === 0 ? 'crowd-rig' : `crowd-rig-${rigSerial}`;
  const m = resources.material(key, () => new MeshStandardNodeMaterial());
  m.name = 'CrowdRig';
  m.fog = true;
  const part = T.uv(1).x;
  const bone = T.int(T.round(T.uv(1).y));
  const motion = T.attribute('iMotion', 'vec4');
  const style = T.attribute('iStyle', 'vec4');
  const extra = T.attribute('iExtra', 'vec4');
  const coat = T.attribute('iCoat', 'vec3');
  const can = T.attribute('iCanopy', 'vec3');
  const vcol = T.attribute('color', 'vec4').xyz;
  const uv0 = T.uv();

  const isTorso = T.step(part, 0.5);
  const isHead = band(part, 0.5, 1.5);
  const isLeg = band(part, 1.5, 3.5);
  const isAL = band(part, 3.5, 4.5);
  const isAR = band(part, 4.5, 5.5);
  const isLong = band(part, 5.5, 6.5);
  const isCan = band(part, 6.5, 7.5);
  const isShaft = band(part, 7.5, 8.5);
  const isHood = band(part, 8.5, 9.5);
  const isHat = band(part, 9.5, 10.5);
  const isBag = band(part, 10.5, 11.5);
  const isShort = band(part, 11.5, 12.5);
  const isRain = band(part, 14.5, 15.5);
  const isMask = band(part, 15.5, 16.5);
  const isSkin = isTorso.add(isHead);
  const umbrella = motion.z;
  const packed = T.round(extra.z);
  const skinId = T.mod(packed, T.float(4));
  const maskOn = T.step(3.5, packed);

  const skin = paletteSkin(
    palette, PAL_LO, PAL_HI, FRAMES, bone, extra.w, motion.x,
    T.positionGeometry, T.normalGeometry,
  );
  const show = (flag: any, mask: any) => T.mix(T.float(1), flag, mask);
  let pos = skin.position;
  pos = T.mix(T.vec3(0, 1.7, 0), pos, show(style.x, isHood));
  pos = T.mix(T.vec3(0, 1.86, 0), pos, show(style.y, isHat));
  pos = T.mix(T.vec3(-0.32, 0.98, 0.06), pos, show(style.z, isBag));
  pos = T.mix(T.vec3(0, 1.0, 0), pos, show(T.float(1).sub(style.w), isLong));
  pos = T.mix(T.vec3(0, 1.14, 0), pos, show(style.w, isShort));
  pos = T.mix(T.vec3(0.34, 1.6, 0.08), pos, show(umbrella, isCan.add(isShaft)));
  pos = T.mix(T.vec3(0.32, 1.2, 0.05), pos, show(T.float(1).sub(umbrella), isAR));
  pos = T.mix(T.vec3(0.28, 1.15, 0.08), pos, show(umbrella, isRain));
  pos = T.mix(T.vec3(0, 1.62, 0.05), pos, show(maskOn.mul(T.float(1).sub(style.x)), isMask));

  const setup = m.setupPosition.bind(m);
  m.setupPosition = (builder) => {
    T.positionLocal.assign(pos);
    T.normalLocal.assign(skin.normal);
    return setup(builder);
  };

  // Sleeves were authored in the skin rect of the atlas. Shift them into wool.
  const isSleeve = isAL.add(isAR);
  const sampleUv = T.vec2(T.mix(uv0.x, uv0.x.add(0.5), isSleeve), uv0.y);
  const atlasRgb = T.texture(atlas, sampleUv).rgb;
  const luma = T.dot(atlasRgb, T.vec3(0.3, 0.59, 0.11));
  const isShoe = isLeg.mul(T.step(uv0.y, 0.5));
  const ref = T.mix(T.float(0.42), T.float(0.45), isSkin);
  const ref2 = T.mix(ref, T.float(0.22), isCan.add(isRain).add(isMask));
  const ref3 = T.mix(ref2, T.float(0.1), isShoe.add(isBag));
  const detail = T.clamp(luma.div(ref3), 0.78, 1.28);

  const baseSkin = T.vec3(0.55, 0.42, 0.34);
  const tone0 = baseSkin.mul(0.78);
  const tone2 = baseSkin.mul(1.12);
  const skinTone = T.mix(tone0, T.mix(baseSkin, tone2, T.step(1.5, skinId)), T.step(0.5, skinId));
  const shaftCol = T.vec3(1.0, 0.74, 0.38);
  let albedo = coat.mul(vcol).mul(detail);
  albedo = T.mix(albedo, skinTone.mul(vcol).mul(detail), isSkin);
  albedo = T.mix(albedo, coat.mul(0.62).mul(vcol).mul(detail), isLeg.mul(T.float(1).sub(isShoe)));
  albedo = T.mix(albedo, vcol.mul(detail), isShoe);
  albedo = T.mix(albedo, coat.mul(0.55).mul(vcol).mul(detail), isBag);
  albedo = T.mix(albedo, can.mul(detail), isCan);
  albedo = T.mix(albedo, shaftCol, isShaft);
  albedo = T.mix(albedo, T.vec3(0.16, 0.18, 0.19).mul(detail), isMask);
  const wetCloth = T.mix(T.float(1), T.float(0.62), U.wetness);
  const wetSkin = T.mix(T.float(1), T.float(0.88), U.wetness);
  const wet = T.mix(wetCloth, wetSkin, isSkin);
  albedo = T.mix(albedo, albedo.mul(wet), T.float(1).sub(isShaft));

  const N = T.normalize(T.normalWorld);
  const V = T.normalize(T.cameraPosition.sub(T.positionWorld));
  const L = T.normalize(T.vec3(0.22, 0.9, 0.28));
  const wrap = T.float(0.62);
  const ndl = T.saturate(T.dot(N, L).add(wrap).div(T.float(1).add(wrap)));
  const trans = T.pow(T.saturate(T.dot(V, L.mul(-1))), T.float(2.6)).mul(0.55);
  const sss = skinTone.mul(T.vec3(1.0, 0.4, 0.3)).mul(ndl.add(trans.mul(0.45))).mul(0.26).mul(isSkin);
  const rim = T.pow(T.saturate(T.float(1).sub(T.abs(T.dot(N, V)))), T.float(2.4)).mul(U.night).mul(0.2);
  const glow = T.float(0.34).add(U.night.mul(0.28));
  let emissive = albedo.mul(glow).add(sss).add(T.vec3(0.95, 0.22, 0.55).mul(rim));
  emissive = T.mix(emissive, shaftCol.mul(T.float(1.4).add(U.night.mul(0.55))), isShaft);
  emissive = emissive.add(can.mul(isCan).mul(0.18));

  m.colorNode = T.vec4(albedo, 1);
  m.emissiveNode = emissive;
  const roughCloth = T.mix(T.float(0.82), T.float(0.28), U.wetness);
  const roughSkin = T.mix(T.float(0.52), T.float(0.3), U.wetness);
  const roughVinyl = T.mix(T.float(0.38), T.float(0.12), U.wetness);
  let rough = T.mix(roughCloth, roughSkin, isSkin);
  rough = T.mix(rough, roughVinyl, isCan.add(isMask).add(isShaft));
  rough = T.mix(rough, T.mix(T.float(0.58), T.float(0.22), U.wetness), isShoe.add(isBag));
  m.roughnessNode = rough;
  m.metalnessNode = T.mix(T.float(0), T.float(0.12), isCan.add(isMask)).add(isShaft.mul(0.35));
  return m;
}

export interface CrowdRigAsset {
  geometry: BufferGeometry;
  material: MeshStandardNodeMaterial;
  triangles: number;
}

let epoch = 0;
let materialPromise: Promise<MeshStandardNodeMaterial | null> | null = null;
let paletteTex: Texture | null = null;
let atlasTex: Texture | null = null;
let atlasBytes = 0;
let atlasKind: 'ktx2' | 'png' | 'none' = 'none';
let crowdMat: MeshStandardNodeMaterial | null = null;

function sharedMaterial(renderer?: WebGPURenderer | null): Promise<MeshStandardNodeMaterial | null> {
  if (crowdMat) return Promise.resolve(crowdMat);
  if (!materialPromise) {
    const e = epoch;
    materialPromise = Promise.all([loadPalette(), loadAtlas(renderer)]).then(([palette, atlas]) => {
      if (e !== epoch) {
        palette.dispose();
        atlas.texture.dispose();
        return null;
      }
      paletteTex = palette;
      atlasTex = atlas.texture;
      atlasBytes = atlas.gpuBytes;
      atlasKind = atlas.kind;
      resources.markStreamed(atlas.texture);
      crowdMat = crowdMaterial(palette, atlas.texture);
      return crowdMat;
    }).catch((err) => {
      materialPromise = null;
      throw err;
    });
  }
  return materialPromise;
}

export interface CrowdTextureMemory {
  paletteBytes: number;
  atlasBytes: number;
  atlasKind: 'ktx2' | 'png' | 'none';
}

/** Palette is raw uint16 pairs. Compressing it would quantize the bones. */
export function crowdTextureMemory(): CrowdTextureMemory {
  const image = paletteTex?.image as { data?: ArrayBufferView } | undefined;
  return {
    paletteBytes: image?.data?.byteLength ?? 0,
    atlasBytes,
    atlasKind,
  };
}

/** Drop the shared material, palette, and atlas. In-flight loads dispose themselves. */
export function disposeCrowdResources(): void {
  epoch++;
  materialPromise = null;
  const mat = crowdMat;
  const pal = paletteTex;
  const atl = atlasTex;
  crowdMat = null;
  paletteTex = null;
  atlasTex = null;
  atlasBytes = 0;
  atlasKind = 'none';
  if (mat) rigSerial += 1;
  mat?.dispose();
  pal?.dispose();
  atl?.dispose();
  disposeHumanKtx();
}

export function loadCrowdRig(lod: CrowdLod, renderer?: WebGPURenderer | null): Promise<CrowdRigAsset | null> {
  const e = epoch;
  const geometryPromise = loadHumanGeometry(url(`crowd-${lod}.glb`));
  return Promise.all([
    sharedMaterial(renderer),
    geometryPromise,
  ]).then(([material, geometry]) => {
    if (e !== epoch || !material) {
      geometry.dispose();
      return null;
    }
    const triangles = (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
    return { geometry, material, triangles };
  }).catch(async (err) => {
    const geometry = await geometryPromise.catch(() => null);
    geometry?.dispose();
    throw err;
  });
}
