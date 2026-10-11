// Nearest Veil House dancer, as a mesh, inside about 24 m on medium and above.
// The instanced hologram quad keeps getHoloMaterial. This is the one extra draw.
// Far and low stay on that quad, masked by the low-mesh silhouette.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, DataTexture, DoubleSide, LinearFilter, Mesh, MeshBasicNodeMaterial,
  NearestFilter, NoColorSpace, RGBAFormat, TextureLoader, UnsignedByteType, Vector3,
  type Texture, type WebGPURenderer,
} from 'three/webgpu';
import * as TSL from 'three/tsl';
import type { Tier } from '../../core/quality';
import { U } from '../../atmosphere/uniforms';
import { allHolograms } from '../holograms/registry';
import { installDancerMask, releaseDancerMask } from '../holograms/material';
import type { HologramSpec } from '../holograms/types';
import { loadHumanGeometry, retainedGeometryBytes } from './gltfGeom';
import { disposeHumanKtx, preferHumanKtx2, textureGpuBytes, transcodeKtx2 } from './ktx';
import { paletteSkin } from './paletteSkin';

const T = TSL as any;

const FRAMES = 32;
const PAL_W = 11 * 6;
const PAL_H = FRAMES;
const PAL_LO = -4;
const PAL_HI = 4;
const PERIOD = 6.28318530718 / 1.2;
const HEM = 0.02;

type DancerLod = 'medium' | 'high';

function url(file: string): string {
  return `${import.meta.env.BASE_URL}models/humans/${file}`;
}

function loadPalette(): Promise<Texture> {
  return fetch(url('dancer-palette.bin')).then((res) => {
    if (!res.ok) throw new Error(`dancer palette ${res.status}`);
    return res.arrayBuffer();
  }).then((buf) => {
    const data = new Uint8Array(buf);
    const tex = new DataTexture(data, PAL_W, PAL_H, RGBAFormat, UnsignedByteType);
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

const MASK_W = 256;
const MASK_H = 512;

function loadMaskPng(): Promise<Texture> {
  return new Promise((resolve, reject) => {
    new TextureLoader().load(url('dancer-mask.png'), (tex) => {
      tex.magFilter = LinearFilter;
      tex.minFilter = LinearFilter;
      tex.generateMipmaps = false;
      resolve(tex);
    }, undefined, reject);
  });
}

async function loadMaskTexture(renderer?: WebGPURenderer | null): Promise<{ texture: Texture; gpuBytes: number; kind: 'ktx2' | 'png' }> {
  if (preferHumanKtx2(renderer)) {
    try {
      const res = await fetch(url('dancer-mask.ktx2'));
      if (!res.ok) throw new Error(`dancer mask ktx2 ${res.status}`);
      const tex = await transcodeKtx2(renderer as WebGPURenderer, await res.arrayBuffer());
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      return { texture: tex, gpuBytes: textureGpuBytes(tex, MASK_W, MASK_H), kind: 'ktx2' };
    } catch (err) {
      console.warn('dancer mask ktx2', err);
    }
  }
  const texture = await loadMaskPng();
  return { texture, gpuBytes: MASK_W * MASK_H * 4, kind: 'png' };
}

function heroMaterial(palette: Texture): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial();
  m.name = 'DancerHero';
  m.transparent = true;
  m.depthWrite = false;
  m.depthTest = true;
  m.blending = AdditiveBlending;
  m.side = DoubleSide;
  m.fog = false;
  m.toneMapped = true;
  const bone = T.int(T.round(T.uv(1).y));
  const phase = T.fract(U.time.div(PERIOD));
  const skin = paletteSkin(
    palette, PAL_LO, PAL_HI, FRAMES, bone, T.float(0), phase,
    T.positionGeometry, T.normalGeometry,
  );
  const setup = m.setupPosition.bind(m);
  m.setupPosition = (builder) => {
    T.positionLocal.assign(skin.position);
    return setup(builder);
  };
  m.colorNode = T.Fn(() => {
    const dist = T.length(T.positionWorld.sub(T.cameraPosition));
    const close = T.smoothstep(T.float(80), T.float(24), dist);
    const tint = T.vec3(1, 0.18, 0.55);
    const sweep = T.fract(T.uv().y.mul(28).sub(U.time.mul(1.15)));
    const line = T.smoothstep(0.06, 0.32, sweep).mul(T.smoothstep(0.58, 0.94, sweep).oneMinus());
    const scan = T.mix(T.float(0.58), T.float(1), line);
    const bucket = T.floor(U.time.mul(6));
    const fh = T.hash(bucket);
    const flick = T.mix(T.float(1), T.float(0.72), T.step(fh, 0.14)).add(T.step(0.975, fh).mul(0.35));
    const haze = T.clamp(T.exp(dist.mul(U.fogDensity).mul(-0.22)), 0.35, 1);
    const night = U.night.mul(0.75).add(0.28);
    return T.vec4(tint.mul(scan).mul(flick).mul(haze).mul(night).mul(U.signPower).mul(2.5).mul(close), 1);
  })();
  return m;
}

let epoch = 0;
let materialPromise: Promise<MeshBasicNodeMaterial | null> | null = null;
let heroMat: MeshBasicNodeMaterial | null = null;
let paletteTex: Texture | null = null;
let maskPromise: Promise<void> | null = null;
let maskBytes = 0;
let maskKind: 'ktx2' | 'png' | 'none' = 'none';

function sharedMaterial(): Promise<MeshBasicNodeMaterial | null> {
  if (heroMat) return Promise.resolve(heroMat);
  if (!materialPromise) {
    const e = epoch;
    materialPromise = loadPalette().then((palette) => {
      if (e !== epoch) {
        palette.dispose();
        return null;
      }
      paletteTex = palette;
      heroMat = heroMaterial(palette);
      return heroMat;
    }).catch((err) => {
      materialPromise = null;
      throw err;
    });
  }
  return materialPromise;
}

function sharedMask(renderer?: WebGPURenderer | null): Promise<void> {
  if (maskKind !== 'none') return Promise.resolve();
  if (!maskPromise) {
    const e = epoch;
    maskPromise = loadMaskTexture(renderer).then((loaded) => {
      if (e !== epoch) {
        loaded.texture.dispose();
        return;
      }
      installDancerMask(loaded.texture);
      maskBytes = loaded.gpuBytes;
      maskKind = loaded.kind;
    }).catch((err) => {
      maskPromise = null;
      console.warn('dancer mask', err);
    });
  }
  return maskPromise;
}

export interface DancerTextureMemory {
  paletteBytes: number;
  maskBytes: number;
  maskKind: 'ktx2' | 'png' | 'none';
}

export function dancerTextureMemory(): DancerTextureMemory {
  const image = paletteTex?.image as { data?: ArrayBufferView } | undefined;
  return {
    paletteBytes: image?.data?.byteLength ?? 0,
    maskBytes,
    maskKind,
  };
}

/** Drop the hero material, palette, and mask. The hologram quad keeps its own material. */
export function disposeDancerResources(): void {
  epoch++;
  materialPromise = null;
  maskPromise = null;
  const mat = heroMat;
  const pal = paletteTex;
  heroMat = null;
  paletteTex = null;
  maskBytes = 0;
  maskKind = 'none';
  mat?.dispose();
  pal?.dispose();
  releaseDancerMask();
  disposeHumanKtx();
}

function hemOf(spec: HologramSpec): number {
  return spec.w > 20 ? spec.y - spec.h / 2 : spec.y - spec.h * (0.5 - HEM);
}

const _up = new Vector3(0, 1, 0);

export class DancerHero {
  readonly mesh: Mesh;
  tris = 0;
  shown = 0;
  private ready = false;
  private allow = false;
  private loaded: DancerLod | null = null;
  private gen = 0;
  private trisPer = 0;
  private owned: BufferGeometry | null = null;
  private disposed = false;
  private pending: DancerLod | null = null;
  private readonly blank = new BufferGeometry();
  private dummyMat: MeshBasicNodeMaterial | null;

  constructor() {
    this.blank.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
    this.dummyMat = new MeshBasicNodeMaterial();
    this.mesh = new Mesh(this.blank, this.dummyMat);
    this.mesh.name = 'dancer-hero';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.scale.setScalar(0);
  }

  /** Triangles of the hero mesh kept in memory. Zero on low, and while it is still loading. */
  residentTriangles(): number {
    return this.owned ? this.trisPer : 0;
  }

  geometryResident(): number {
    return retainedGeometryBytes(this.owned);
  }

  setLod(tier: Tier, renderer?: WebGPURenderer | null): void {
    if (this.disposed) return;
    void sharedMask(renderer);
    this.allow = tier !== 'low';
    if (!this.allow) {
      this.gen++;
      this.pending = null;
      this.releaseGeometry();
      this.mesh.scale.setScalar(0);
      this.shown = 0;
      this.tris = 0;
      this.ready = false;
      this.loaded = null;
      return;
    }
    const lod: DancerLod = tier === 'medium' ? 'medium' : 'high';
    if ((this.loaded === lod && this.ready) || this.pending === lod) return;
    this.pending = lod;
    const gen = ++this.gen;
    const geometryPromise = loadHumanGeometry(url(`dancer-${lod}.glb`));
    void Promise.all([
      sharedMaterial(),
      geometryPromise,
    ]).then(([material, geometry]) => {
      if (gen === this.gen) this.pending = null;
      if (gen !== this.gen || this.disposed || !material) {
        geometry.dispose();
        return;
      }
      this.adopt(geometry);
      if (this.dummyMat) {
        this.dummyMat.dispose();
        this.dummyMat = null;
      }
      this.mesh.material = material;
      this.trisPer = (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
      this.loaded = lod;
      this.ready = true;
    }).catch(async (err) => {
      if (gen === this.gen) this.pending = null;
      const geometry = await geometryPromise.catch(() => null);
      if (geometry && geometry !== this.owned && geometry !== this.mesh.geometry) geometry.dispose();
      console.warn('dancer hero', err);
    });
  }

  /** Free the hero mesh, its palette, and the mask. The hologram panels stay. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.gen++;
    this.allow = false;
    this.ready = false;
    this.releaseGeometry();
    this.dummyMat?.dispose();
    this.dummyMat = null;
    disposeDancerResources();
    this.mesh.geometry = new BufferGeometry();
    this.mesh.dispose();
    this.shown = 0;
    this.tris = 0;
  }

  private releaseGeometry(): void {
    const old = this.owned;
    this.owned = null;
    this.mesh.geometry = this.blank;
    old?.dispose();
  }

  private adopt(geometry: BufferGeometry): void {
    const old = this.owned;
    this.owned = geometry;
    this.mesh.geometry = geometry;
    if (old && old !== geometry) old.dispose();
  }

  update(cam: Vector3): void {
    if (this.disposed || !this.allow || !this.ready) {
      this.mesh.scale.setScalar(0);
      this.shown = 0;
      this.tris = 0;
      return;
    }
    let best: HologramSpec | null = null;
    let bestD = 1e9;
    for (const spec of allHolograms()) {
      if (spec.design !== 'veil-dancer') continue;
      const hem = hemOf(spec);
      const y = Math.min(Math.max(cam.y, hem), hem + 64.4);
      const d = Math.hypot(spec.x - cam.x, y - cam.y, spec.z - cam.z);
      if (d < bestD) {
        bestD = d;
        best = spec;
      }
    }
    if (!best || bestD > 82) {
      this.mesh.scale.setScalar(0);
      this.shown = 0;
      this.tris = 0;
      return;
    }
    const hem = hemOf(best);
    this.mesh.position.set(best.x, hem, best.z);
    this.mesh.quaternion.setFromAxisAngle(_up, best.yaw);
    this.mesh.scale.setScalar(1);
    this.shown = 1;
    this.tris = this.trisPer;
  }
}
