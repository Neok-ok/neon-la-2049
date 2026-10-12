// Sign halos, spinner searchlight shafts, and a pooled street breath.
// Two draws on medium and up (one additive, one steam). Low draws neither.
// Shafts attach to spinners that already exist. This does not spawn any.
import {
  AdditiveBlending, BufferGeometry, BufferAttribute, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh,
  Matrix4, MeshBasicNodeMaterial, NormalBlending, PlaneGeometry, Quaternion, Vector3, type Scene,
} from 'three/webgpu';
import { uniform } from 'three/tsl';
import * as TSL from 'three/tsl';
import type { Tier } from '../core/quality';
import { resources } from '../core/memory';
import { hash2i } from '../core/rng';
import type { CityQuery } from '../world/CityQuery';
import { makeCross } from '../districts/_shared/kit/templates';
import { smokeCovers } from '../fx/smoke/field';
import { fogDepth } from './SkyFog';
import { U } from './uniforms';
import { airFlags, airSample, airTier } from './airState';
import { AIR_LIGHT_SLOTS, AIR_SHAFT_SLOTS, clearAirLights, setAirLight, setAirShaft } from './airLights';

const T = TSL as any;
const { Fn, attribute, vec3, vec4, float, length, smoothstep, abs, exp, select, uv, sin, fract, cameraPosition, positionWorld, positionLocal } = T;

/** Metres per second, shared with the weather the smoke field already uses. */
const breathWind = uniform(new Vector3());

const HALO_CAP: Record<Tier, number> = { low: 0, medium: 4, high: 8, ultra: 12 };
const HALO_RANGE: Record<Tier, number> = { low: 0, medium: 52, high: 120, ultra: 190 };
const HALO_AREA: Record<Tier, number> = { low: 1e9, medium: 16, high: 9, ultra: 8 };
const HALO_SIZE: Record<Tier, number> = { low: 0, medium: 8, high: 14, ultra: 18 };
const SHAFT_CAP: Record<Tier, number> = { low: 0, medium: 2, high: 4, ultra: 4 };
const SHAFT_RANGE: Record<Tier, number> = { low: 0, medium: 180, high: 340, ultra: 420 };
const SHAFT_LEN: Record<Tier, number> = { low: 0, medium: 44, high: 64, ultra: 76 };
const BREATH_CAP: Record<Tier, number> = { low: 0, medium: 10, high: 18, ultra: 26 };

const GLOW_MAX = 12 + 4 * 2;
const BREATH_MAX = 26;

export interface GlowMark {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  area: number;
  d2: number;
}

export interface CraftMark {
  x: number;
  y: number;
  z: number;
  yaw: number;
  salt: number;
  police: boolean;
  d2: number;
}

export interface AirBeam {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  length: number;
}

export interface AirSnapshot {
  ground: boolean;
  mid: boolean;
  deck: boolean;
  halos: number;
  shafts: number;
  breath: number;
  groundY: number;
  groundW: number;
  deckY: number;
  deckW: number;
  layerY: number;
  groundBand: number;
  deckDensity: number;
  layerDensity: number;
  rainReact: number;
  draws: number;
  beams: AirBeam[];
}

const _m = new Matrix4();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _dir = new Vector3();
const _up = new Vector3(0, 1, 0);

function glowMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial();
  m.transparent = true;
  m.depthWrite = false;
  m.depthTest = true;
  m.side = DoubleSide;
  m.blending = AdditiveBlending;
  m.fog = false;
  m.colorNode = Fn(() => {
    const info = attribute('iAir', 'vec4');
    const kind = info.x;
    const inten = info.y;
    const tint = attribute('iTint', 'vec3');
    const u = uv();
    const radial = length(u.sub(0.5)).mul(2.0);
    const disc = smoothstep(1.0, 0.0, radial).pow(1.7);
    const across = smoothstep(0.5, 0.02, abs(u.x.sub(0.5)));
    const along = smoothstep(0.0, 0.06, u.y).mul(smoothstep(1.0, 0.78, u.y));
    const beam = across.pow(1.4).mul(along);
    const shape = select(kind.lessThan(0.5), disc, beam);
    const fogA = exp(fogDepth(cameraPosition, positionWorld).mul(-0.4));
    const dist = length(positionWorld.sub(cameraPosition));
    const far = smoothstep(460.0, 80.0, dist);
    const col = tint.mul(shape).mul(inten).mul(fogA).mul(far).mul(U.signPower).mul(U.night.mul(0.8).add(0.2));
    return vec4(col, float(1));
  })();
  return m;
}

/** Street-level breath. Own material so the kit steam gain can mute district crosses. */
function breathMaterial(): MeshBasicNodeMaterial {
  return resources.material('air-breath', () => {
    const steam = new MeshBasicNodeMaterial();
    steam.transparent = true;
    steam.depthWrite = false;
    steam.blending = NormalBlending;
    steam.side = DoubleSide;
    steam.fog = true;
    const seed = attribute('iSteam', 'vec4').x;
    const life = fract(U.time.mul(0.18).add(seed));
    const drift = sin(U.time.mul(0.7).add(seed.mul(6.0))).mul(0.08);
    // Same wind as the vents, at a fraction of a metre per second. No authored lift.
    const gust = breathWind.mul(life);
    steam.positionNode = positionLocal.add(vec3(drift, life.mul(1.7), drift.mul(0.35))).add(gust);
    const fade = sin(life.mul(Math.PI));
    const dist = length(positionWorld.sub(cameraPosition));
    const col = U.fogColor.mul(1.35);
    steam.colorNode = vec4(col, fade.mul(0.22).mul(smoothstep(36.0, 5.0, dist)));
    return steam;
  });
}

function steamGeo(): BufferGeometry {
  const t = makeCross();
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(t.position, 3));
  g.setAttribute('normal', new BufferAttribute(t.normal, 3));
  return g;
}

export class AirField {
  readonly glowMesh: InstancedMesh;
  readonly breathMesh: InstancedMesh;
  halos = 0;
  shafts = 0;
  breath = 0;
  readonly beams: AirBeam[] = [];

  private readonly iAir: InstancedBufferAttribute;
  private readonly iTint: InstancedBufferAttribute;
  private readonly iSteam: InstancedBufferAttribute;
  private readonly held = new Set<number>();
  private readonly glowScratch: GlowMark[] = [];
  private readonly craftScratch: CraftMark[] = [];

  constructor(scene: Scene) {
    const geo = new PlaneGeometry(1, 1);
    this.iAir = new InstancedBufferAttribute(new Float32Array(GLOW_MAX * 4), 4);
    this.iTint = new InstancedBufferAttribute(new Float32Array(GLOW_MAX * 3), 3);
    this.iAir.setUsage(DynamicDrawUsage);
    this.iTint.setUsage(DynamicDrawUsage);
    geo.setAttribute('iAir', this.iAir);
    geo.setAttribute('iTint', this.iTint);
    this.glowMesh = new InstancedMesh(geo, glowMaterial(), GLOW_MAX);
    this.glowMesh.name = 'air-glow';
    this.glowMesh.frustumCulled = false;
    this.glowMesh.renderOrder = 7;
    this.glowMesh.count = 0;
    this.glowMesh.visible = false;

    const bgeo = steamGeo();
    this.iSteam = new InstancedBufferAttribute(new Float32Array(BREATH_MAX * 4), 4);
    this.iSteam.setUsage(DynamicDrawUsage);
    bgeo.setAttribute('iSteam', this.iSteam);
    this.breathMesh = new InstancedMesh(bgeo, breathMaterial(), BREATH_MAX);
    this.breathMesh.name = 'air-breath';
    this.breathMesh.frustumCulled = false;
    this.breathMesh.renderOrder = 4;
    this.breathMesh.count = 0;
    this.breathMesh.visible = false;
    scene.add(this.glowMesh, this.breathMesh);
  }

  update(opts: {
    tier: Tier;
    camX: number;
    camY: number;
    camZ: number;
    alt: number;
    time: number;
    cameraQuat: Quaternion;
    signs: (out: GlowMark[], range: number, minArea: number) => void;
    holos: readonly GlowMark[];
    craft: (out: CraftMark[], range: number) => void;
    query: CityQuery;
    wind?: number;
    windDir?: number;
  }): void {
    const tier = opts.tier;
    this.placeHalos(tier, opts);
    this.placeShafts(tier, opts);
    this.placeBreath(tier, opts);
  }

  snapshot(): AirSnapshot {
    const glowOn = this.glowMesh.visible && this.glowMesh.count > 0;
    const breathOn = this.breathMesh.visible && this.breathMesh.count > 0;
    return {
      ground: airFlags.ground,
      mid: airFlags.mid,
      deck: airFlags.deck,
      halos: this.halos,
      shafts: this.shafts,
      breath: this.breath,
      groundY: Number(U.groundY.value),
      groundW: Number(U.groundW.value),
      deckY: Number(U.deckY.value),
      deckW: Number(U.deckW.value),
      layerY: Number(U.layerY.value),
      groundBand: Number(U.groundBand.value),
      deckDensity: Number(U.deckDensity.value),
      layerDensity: Number(U.layerDensity.value),
      rainReact: Number(U.rainReact.value),
      draws: (glowOn ? 1 : 0) + (breathOn ? 1 : 0),
      beams: this.beams.map((b) => ({ ...b })),
    };
  }

  private placeHalos(tier: Tier, opts: {
    camX: number; camY: number; camZ: number; cameraQuat: Quaternion;
    signs: (out: GlowMark[], range: number, minArea: number) => void;
    holos: readonly GlowMark[];
  }): void {
    const cap = airFlags.halos ? HALO_CAP[tier] : 0;
    const range = HALO_RANGE[tier];
    clearAirLights();
    this.glowScratch.length = 0;
    if (cap > 0 && range > 0) {
      opts.signs(this.glowScratch, range, HALO_AREA[tier]);
      const r2 = range * range;
      for (const h of opts.holos) {
        if (h.area < HALO_AREA[tier] || h.d2 > r2) continue;
        this.glowScratch.push(h);
      }
      this.glowScratch.sort((a, b) => a.d2 - b.d2);
    }
    const kept: GlowMark[] = [];
    for (const g of this.glowScratch) {
      if (kept.length >= cap) break;
      let near = false;
      for (const k of kept) {
        const dx = k.x - g.x, dy = k.y - g.y, dz = k.z - g.z;
        if (dx * dx + dy * dy + dz * dz < 49) { near = true; break; }
      }
      if (!near) kept.push(g);
    }
    let n = 0;
    const maxSize = HALO_SIZE[tier];
    for (let i = 0; i < kept.length && n < GLOW_MAX; i++) {
      const g = kept[i]!;
      const dist = Math.sqrt(g.d2);
      const span = Math.sqrt(Math.max(g.area, 1));
      const world = Math.min(maxSize, Math.max(3.2, span * 0.38));
      const size = Math.min(world, Math.max(2.4, dist * 0.28));
      _p.set(g.x, g.y, g.z);
      _s.set(size, size, 1);
      this.glowMesh.setMatrixAt(n, _m.compose(_p, opts.cameraQuat, _s));
      this.iAir.setXYZW(n, 0, 0.72, 0, 0);
      this.iTint.setXYZ(n, g.r, g.g, g.b);
      if (i < AIR_LIGHT_SLOTS) setAirLight(i, g.x, g.y, g.z, Math.max(10, size * 1.6), g.r, g.g, g.b);
      n++;
    }
    this.halos = n;
    this.glowMesh.count = n;
    // Shafts append after this, so visibility is finished in placeShafts.
  }

  private placeShafts(tier: Tier, opts: {
    camX: number; camY: number; camZ: number; time: number;
    craft: (out: CraftMark[], range: number) => void;
  }): void {
    const capWant = airFlags.shaftCap >= 0 ? airFlags.shaftCap : SHAFT_CAP[tier];
    const cap = airFlags.shafts ? Math.max(0, Math.min(AIR_SHAFT_SLOTS, capWant)) : 0;
    const range = SHAFT_RANGE[tier];
    this.craftScratch.length = 0;
    if (cap > 0 && range > 0) opts.craft(this.craftScratch, range);
    const held = this.held;
    this.craftScratch.sort((a, b) => {
      const as = Math.sqrt(a.d2) - (a.police ? 90 : 0) - (held.has(a.salt) ? 36 : 0);
      const bs = Math.sqrt(b.d2) - (b.police ? 90 : 0) - (held.has(b.salt) ? 36 : 0);
      return as - bs;
    });
    const picked = this.craftScratch.slice(0, cap);
    held.clear();
    this.beams.length = 0;
    let n = this.halos;
    const len = SHAFT_LEN[tier];
    for (let i = 0; i < picked.length && i < AIR_SHAFT_SLOTS; i++) {
      const c = picked[i]!;
      held.add(c.salt);
      const rate = 0.08 + (c.salt % 13) * 0.005;
      const yaw = c.yaw + Math.sin(opts.time * rate + (c.salt % 17)) * 0.78;
      const steep = c.salt % 5 === 0;
      const pitch = (steep ? -1.02 : -0.46) + Math.sin(opts.time * rate * 0.37 + c.salt * 0.01) * 0.1;
      const cp = Math.cos(pitch);
      const dx = Math.sin(yaw) * cp;
      const dy = Math.sin(pitch);
      const dz = -Math.cos(yaw) * cp;
      _dir.set(dx, dy, dz);
      if (_dir.lengthSq() < 1e-6) _dir.set(0, -1, 0);
      else _dir.normalize();
      setAirShaft(i, c.x, c.y, c.z, _dir.x, _dir.y, _dir.z, len);
      this.beams.push({ x: c.x, y: c.y, z: c.z, dx: _dir.x, dy: _dir.y, dz: _dir.z, length: len });
      _q.setFromUnitVectors(_up, _dir);
      const mid = len * 0.5;
      const width = tier === 'medium' ? 6.5 : 10;
      for (let k = 0; k < 2 && n < GLOW_MAX; k++) {
        _q2.setFromAxisAngle(_dir, k * Math.PI * 0.5).multiply(_q);
        _p.set(c.x + _dir.x * mid, c.y + _dir.y * mid, c.z + _dir.z * mid);
        _s.set(width, len, 1);
        this.glowMesh.setMatrixAt(n, _m.compose(_p, _q2, _s));
        this.iAir.setXYZW(n, 1, 1.35, c.salt, 0);
        this.iTint.setXYZ(n, 0.82, 0.88, 1);
        n++;
      }
    }
    for (let i = picked.length; i < AIR_SHAFT_SLOTS; i++) setAirShaft(i, 0, 0, 0, 0, -1, 0, 0);
    this.shafts = picked.length;
    this.glowMesh.count = n;
    this.glowMesh.visible = n > 0;
    this.glowMesh.instanceMatrix.needsUpdate = true;
    this.iAir.needsUpdate = true;
    this.iTint.needsUpdate = true;
  }

  private placeBreath(tier: Tier, opts: {
    camX: number; camY: number; camZ: number; alt: number; query: CityQuery;
    wind?: number; windDir?: number;
  }): void {
    const cap = airFlags.breath ? BREATH_CAP[tier] : 0;
    const wind = opts.wind ?? 0;
    const windDir = opts.windDir ?? 0;
    breathWind.value.set(Math.cos(windDir) * wind * 0.08, 0, Math.sin(windDir) * wind * 0.08);
    const weight = airSample().breath;
    const reach = tier === 'ultra' ? 84 : tier === 'high' ? 68 : 46;
    if (cap === 0 || weight < 0.04 || opts.alt > 40 || opts.alt < -1) {
      this.breath = 0;
      this.breathMesh.count = 0;
      this.breathMesh.visible = false;
      return;
    }
    const layout = opts.query.layout;
    const cell = 24;
    const ix0 = Math.floor((opts.camX - reach) / cell);
    const ix1 = Math.floor((opts.camX + reach) / cell);
    const iz0 = Math.floor((opts.camZ - reach) / cell);
    const iz1 = Math.floor((opts.camZ + reach) / cell);
    const r2 = reach * reach;
    let n = 0;
    for (let ix = ix0; ix <= ix1 && n < cap; ix++) {
      for (let iz = iz0; iz <= iz1 && n < cap; iz++) {
        const h = hash2i(ix, iz, 9049);
        if ((h % 1000) / 1000 > weight * 0.62) continue;
        const x = ix * cell + cell * 0.5 + ((hash2i(ix, iz, 9050) % 1000) / 1000 - 0.5) * 10;
        const z = iz * cell + cell * 0.5 + ((hash2i(ix, iz, 9051) % 1000) / 1000 - 0.5) * 10;
        const dx = x - opts.camX;
        const dz = z - opts.camZ;
        if (dx * dx + dz * dz > r2) continue;
        if (layout.isOcean(x, z)) continue;
        if (smokeCovers(x, z, 5)) continue;
        const gy = layout.heightAt(x, z);
        if (Math.abs(opts.camY - gy) > 16) continue;
        const kind = h % 3;
        const wide = kind === 0 ? 2.3 : kind === 1 ? 1.05 : 0.5;
        const tall = kind === 0 ? 1.5 : kind === 1 ? 2.2 : 2.7;
        const lift = kind === 0 ? 0.35 : kind === 1 ? 0.7 : 1.15;
        _p.set(x, gy + lift, z);
        _q.identity();
        _s.set(wide, tall, wide);
        this.breathMesh.setMatrixAt(n, _m.compose(_p, _q, _s));
        this.iSteam.setXYZW(n, (h % 997) / 997, 0, 0, 0);
        n++;
      }
    }
    this.breath = n;
    this.breathMesh.count = n;
    this.breathMesh.visible = n > 0;
    this.breathMesh.instanceMatrix.needsUpdate = true;
    this.iSteam.needsUpdate = true;
  }
}

/** Tier the debug hook and the docs agree on, before a `searchlights()` override. */
export function shaftCapFor(tier: Tier): number {
  return SHAFT_CAP[tier];
}

export function airTierNow(): Tier {
  return airTier();
}
