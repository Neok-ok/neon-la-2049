// Nearest Veil House dancer, as a mesh, inside about 24 m on medium and above.
// The instanced hologram quad keeps getHoloMaterial. This is the one extra draw.
// Far and low stay on that quad, masked by the low-mesh silhouette.
import {
  AdditiveBlending, BufferGeometry, DataTexture, DoubleSide, Mesh, MeshBasicNodeMaterial,
  NearestFilter, NoColorSpace, RGBAFormat, TextureLoader, UnsignedByteType, Vector3,
  type Texture,
} from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as TSL from 'three/tsl';
import type { Tier } from '../../core/quality';
import { U } from '../../atmosphere/uniforms';
import { allHolograms } from '../holograms/registry';
import { installDancerMask } from '../holograms/material';
import type { HologramSpec } from '../holograms/types';
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

const gltf = new GLTFLoader();
let decoderReady: Promise<void> | null = null;

function ensureDecoder(): Promise<void> {
  if (!decoderReady) {
    gltf.setMeshoptDecoder(MeshoptDecoder);
    decoderReady = MeshoptDecoder.ready;
  }
  return decoderReady;
}

function loadGeometry(lod: DancerLod): Promise<BufferGeometry> {
  return ensureDecoder().then(() => new Promise((resolve, reject) => {
    gltf.load(url(`dancer-${lod}.glb`), (asset) => {
      let best: BufferGeometry | null = null;
      let n = 0;
      asset.scene.traverse((obj) => {
        const mesh = obj as { isMesh?: boolean; geometry?: BufferGeometry };
        if (!mesh.isMesh || !mesh.geometry) return;
        const count = mesh.geometry.getAttribute('position')?.count ?? 0;
        if (count >= n) {
          n = count;
          best = mesh.geometry;
        }
      });
      if (!best) reject(new Error(`dancer ${lod} has no mesh`));
      else resolve(best);
    }, undefined, reject);
  }));
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

function loadMask(): Promise<void> {
  return new Promise((resolve, reject) => {
    new TextureLoader().load(url('dancer-mask.png'), (tex) => {
      installDancerMask(tex);
      resolve();
    }, undefined, reject);
  });
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

const geometries = new Map<DancerLod, Promise<BufferGeometry>>();
let materialPromise: Promise<MeshBasicNodeMaterial> | null = null;
let maskPromise: Promise<void> | null = null;

function sharedMaterial(): Promise<MeshBasicNodeMaterial> {
  if (!materialPromise) materialPromise = loadPalette().then(heroMaterial);
  return materialPromise;
}

function sharedMask(): Promise<void> {
  if (!maskPromise) {
    maskPromise = loadMask().catch((err) => {
      console.warn('dancer mask', err);
    });
  }
  return maskPromise;
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

  constructor() {
    this.mesh = new Mesh(new BufferGeometry(), new MeshBasicNodeMaterial());
    this.mesh.name = 'dancer-hero';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.scale.setScalar(0);
    void sharedMask();
  }

  setLod(tier: Tier): void {
    this.allow = tier !== 'low';
    if (!this.allow) {
      this.mesh.scale.setScalar(0);
      this.shown = 0;
      this.tris = 0;
      return;
    }
    const lod: DancerLod = tier === 'medium' ? 'medium' : 'high';
    if (this.loaded === lod && this.ready) return;
    const gen = ++this.gen;
    let geo = geometries.get(lod);
    if (!geo) {
      geo = loadGeometry(lod);
      geometries.set(lod, geo);
    }
    void Promise.all([sharedMaterial(), geo]).then(([material, geometry]) => {
      if (gen !== this.gen) return;
      this.mesh.geometry = geometry;
      this.mesh.material = material;
      this.trisPer = (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
      this.loaded = lod;
      this.ready = true;
    }).catch((err) => {
      console.warn('dancer hero', err);
    });
  }

  update(cam: Vector3): void {
    if (!this.allow || !this.ready) {
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
