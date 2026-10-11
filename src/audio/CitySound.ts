// District bus, street pool, PA and the harbor horn. Ticked from MarketAudio.update,
// which the frame loop already calls. No per-district branch in App.ts.
import { CityLayout, distToPolyline } from '../world/layout';
import { bearingToDir, bearingToYaw } from '../world/geo';
import { U } from '../atmosphere/uniforms';
import { allHolograms } from '../world/holograms/registry';
import type { Tier } from '../core/quality';
import { hash2i } from '../core/rng';
import { crowdAudioSnap, crowdShareOf, umbrellaFraction } from '../districts/little-tokyo-market/crowd';
import { edgeNear, streetGraph } from '../vehicles/streetGraph';
import { freewayRoutes } from '../vehicles/trafficRegistry';
import type { Ambience } from './Ambience';
import './beds';
import { ensureSlotOccluder, makeSlot, mountCityGraph, type CityGraph, type StreetSlot } from './graph';
import { canyonDelay, canyonFeedback, cityPlaceOf, hornEnvelope, mixTargets, slotLevel, spinnerVoice } from './mix';
import { scheduleParam } from './param';
import { SLOT_KINDS, VOICE_CAP, bedOrQuiet, blendBeds, type DistrictBed, type SlotKind } from './registry';
import { setListener, setPanningModel, setPos } from './synth';
import { LivingSound } from './living';
import {
  TIER_PLAN,
  bufferBytes,
  columnSolid,
  crowdDensity,
  evaluateLiving,
  gridLotSolid,
  hearDefaults,
  memoryFor,
  nearbyPeople,
  occlusionHits,
  occlusionOf,
  type Column,
  type HearInput,
  type MemoryTier,
  type Occlusion,
} from './livingModel';

interface Vec3 { x: number; y: number; z: number }
interface SpinnerAt extends Vec3 { dist: number; closing?: number; heavy?: boolean }

interface Candidate {
  x: number;
  y: number;
  z: number;
  kind: SlotKind;
  key: number;
  d2: number;
}

const HEARD = 0.004;
const KIND_SALT: Record<SlotKind, number> = { sizzle: 1, murmur: 2, neon: 3, steam: 4, clatter: 5 };

export class CitySound {
  voices = 0;
  voiceCap = VOICE_CAP.medium;
  districtId = '';
  private graph: CityGraph | null = null;
  private aId = '';
  private bId = '';
  private aW = 0;
  private bW = 0;
  private lastMs = 0;
  private holoAt = 0;
  private holos: Array<{ x: number; y: number; z: number; band: string }> = [];
  private readonly pool: Candidate[] = Array.from({ length: 48 }, () => ({
    x: 0, y: 0, z: 0, kind: 'sizzle', key: 0, d2: 0,
  }));
  private candN = 0;
  private awningNear = 0;
  private spinnerOn = 0;
  private camX = 0;
  private camZ = 0;
  private readonly used = [0, 0, 0, 0, 0, 0, 0, 0];
  private readonly bedMix: DistrictBed = {
    drone: 0, murmur: 0, pa: 0, industrial: 0, canyon: 0,
    stalls: 0, neon: 0, steam: 0, foghorn: 0, tongue: 0,
  };
  private readonly mixOut = {
    drone: 0, murmur: 0, industrial: 0, pa: 0, canyon: 0, awning: 0, horn: 0, street: 1, open: 1,
  };
  private layout: CityLayout | null = null;
  private readonly living = new LivingSound();
  private tier: Tier = 'medium';
  private readonly columns: Column[] = [];
  private columnsAt = 0;
  private readonly occMemo = new Map<number, { at: number; gain: number; hz: number }>();

  constructor(private ambience: Ambience) {}

  /** Decoded bytes for every tier. The living layer adds none. Runtime bytes are the mounted buffers. */
  memoryReport(): { tiers: MemoryTier[]; runtimeBytes: number; livingBytes: number } {
    const rate = this.ambience.context?.sampleRate ?? 44100;
    const buffers = [
      ...this.ambience.decodedBuffers,
      ...(this.graph?.buffers ?? []),
    ];
    return {
      tiers: (['low', 'medium', 'high', 'ultra'] as const).map((tier) => memoryFor(tier, rate)),
      runtimeBytes: bufferBytes(buffers),
      livingBytes: 0,
    };
  }

  update(
    cam: Vec3,
    forward: Vec3,
    up: Vec3,
    rain: number,
    inMarket: boolean,
    alt: number,
    sizzleAt: Vec3 | null,
    spinnerAt: SpinnerAt | null,
    flying = false,
  ): void {
    const now = performance.now();
    const dt = this.lastMs ? Math.min(0.1, (now - this.lastMs) / 1000) : 0.016;
    this.lastMs = now;
    this.camX = cam.x;
    this.camZ = cam.z;
    this.follow(cam.x, cam.z, dt);

    const ctx = this.ambience.context;
    const master = this.ambience.output;
    if (!ctx || !master) {
      this.voices = 0;
      return;
    }
    const tier = liveTier();
    this.tier = tier;
    this.voiceCap = VOICE_CAP[tier];
    if (!this.graph) this.graph = mountCityGraph(ctx, master, this.voiceCap);
    this.living.mount(ctx, master, this.graph.white, tier);
    this.syncSlots(ctx, master, this.voiceCap);
    const plan = TIER_PLAN[tier];
    for (const s of this.graph.slots) setPanningModel(s.pan, plan.hrtf);
    setPanningModel(this.graph.spinnerPan, plan.hrtf);

    const bedA = bedOrQuiet(this.aId);
    const bedB = bedOrQuiet(this.bId || this.aId);
    const bed = blendBeds(bedA, bedB, this.aW, this.bW, this.bedMix);
    const rawPresence = this.aW * presenceOf(this.aId) + this.bW * presenceOf(this.bId || this.aId);
    const near = nearbyPeople(crowdAudioSnap().life, cam.x, cam.z, 18);
    const presence = crowdDensity(rawPresence, near);
    const g = this.graph;
    const t = ctx.currentTime;
    const interior = this.ambience.interiorAmount;
    this.awningNear = this.peekAwning(cam);
    const mix = mixTargets({
      bed,
      presence,
      rain,
      alt,
      interior,
      night: nightAmount(),
      traffic: this.ambience.trafficAmount,
      hornEnv: hornEnvelope(t),
      awningNear: this.awningNear,
      inMarket,
    }, this.mixOut);

    aim(g.drone.gain, mix.drone, t, 0.45, 'drone');
    aim(g.murmur.gain, mix.murmur, t, 0.4, 'murmur');
    aim(g.industrial.gain, mix.industrial, t, 0.5, 'industrial');
    aim(g.awning.gain, mix.awning, t, 0.35, 'awning');
    aim(g.horn.gain, mix.horn, t, 0.08, 'horn');
    aim(g.wet.gain, mix.pa * mix.canyon * 0.7, t, 0.4, 'wet');
    aim(g.feedback.gain, canyonFeedback(mix.canyon), t, 0.5, 'feedback');
    aim(g.delay.delayTime, canyonDelay(mix.canyon), t, 0.5, 'delay');
    const tongueB = this.bId ? bedOrQuiet(this.bId).tongue : bedA.tongue;
    for (let i = 0; i < g.pa.length; i++) {
      let w = 0;
      if (i === bedA.tongue) w += this.aW;
      if (i === tongueB) w += this.bW;
      aim(g.pa[i]!.gain, mix.pa * w, t, 0.35, `pa${i}`);
    }

    this.placeStreet(cam, alt, rain, sizzleAt, mix.street, mix.open, presence, bed, t);
    this.placeSpinner(spinnerAt, interior, flying, cam, t);
    this.living.update(evaluateLiving(this.hear(cam, alt, rain, interior, near, bed), tier), t);
    setListener(ctx, cam, forward, up);

    let n = this.ambience.bedVoices();
    n += heard(mix.drone) + heard(mix.murmur) + heard(mix.industrial) + heard(mix.awning) + heard(mix.horn);
    if (mix.pa > HEARD) n += 1;
    for (const s of g.slots) if (s.connected && s.target > HEARD) n += 1;
    this.voices = n + this.spinnerOn + this.living.voices;
  }

  private follow(x: number, z: number, dt: number): void {
    if (!this.layout) this.layout = new CityLayout();
    const id = heardDistrictId(this.layout, x, z);
    this.districtId = id;
    if (!this.aId) {
      this.aId = id;
      this.aW = 1;
      this.pushPlace();
      return;
    }
    if (id !== this.aId) {
      const next = retargetCrossfade(this.aW, this.bW);
      this.bId = this.aId;
      this.bW = next.bW;
      this.aId = id;
      this.aW = next.aW;
    }
    const k = 1 - Math.exp(-dt / 1.35);
    this.aW += (1 - this.aW) * k;
    this.bW += (0 - this.bW) * k;
    if (this.bW < 0.02) {
      this.bW = 0;
      this.bId = '';
    }
    this.pushPlace();
  }

  private pushPlace(): void {
    const aw = this.aW;
    const bw = this.bW;
    const n = aw + bw || 1;
    const b = this.bId || this.aId;
    const place = (cityPlaceOf(this.aId) * aw + cityPlaceOf(b) * bw) / n;
    this.ambience.setCityPlace(place);
  }

  private syncSlots(ctx: BaseAudioContext, master: AudioNode, cap: number): void {
    const g = this.graph;
    if (!g) return;
    while (g.slots.length < cap) {
      g.slots.push(makeSlot(ctx, master, g.white, SLOT_KINDS[g.slots.length]!));
    }
    for (let i = 0; i < g.slots.length; i++) {
      const slot = g.slots[i]!;
      if (i >= cap) {
        if (slot.connected) {
          slot.target = 0;
          aim(slot.gain.gain, 0, ctx.currentTime, 0.08, 'slot');
          try { slot.pan.disconnect(); } catch { /* already out */ }
          slot.connected = false;
        }
        slot.parked = false;
        this.living.attachSend(slot.gain, false);
      } else if (!slot.parked && !slot.connected) {
        slot.pan.connect(master);
        slot.connected = true;
      }
    }
  }

  private placeStreet(
    cam: Vec3, alt: number, rain: number, sizzleAt: Vec3 | null,
    street: number, open: number, presence: number, bed: DistrictBed, t: number,
  ): void {
    const g = this.graph;
    const master = this.ambience.output;
    if (!g || !master) return;
    this.candN = 0;
    const ground = cam.y - alt;
    let awningD = 18;
    const life = crowdAudioSnap().life;
    const limit = Math.min(life.length, 40);
    for (let i = 0; i < limit; i++) {
      const s = life[i]!;
      const dx = s.x - cam.x;
      const dz = s.z - cam.z;
      const d = Math.hypot(dx, dz);
      if (s.kind === 'awning') awningD = Math.min(awningD, d);
      if (d > 32) continue;
      if (s.kind === 'queue') {
        this.add(s.x, ground + 1.15, s.z, 'sizzle');
        this.add(s.x + 0.4, ground + 1.05, s.z, 'clatter');
        this.add(s.x, ground + 1.3, s.z, 'steam');
      } else {
        this.add(s.x, ground + 1.6, s.z, 'murmur');
        this.add(s.x, ground + 2.4, s.z, 'steam');
      }
    }
    if (sizzleAt) this.add(sizzleAt.x, sizzleAt.y + 1.1, sizzleAt.z, 'sizzle');
    this.awningNear = Math.max(0, 1 - awningD / 14);

    if (nowSec() - this.holoAt > 0.5) {
      this.holoAt = nowSec();
      this.holos = allHolograms();
    }
    for (let i = 0; i < this.holos.length; i++) {
      const h = this.holos[i]!;
      if (h.band !== 'street') continue;
      const dx = h.x - cam.x;
      const dz = h.z - cam.z;
      if (dx * dx + dz * dz > 100) continue;
      if (Math.abs(h.y - (ground + 3)) > 18) continue;
      this.add(h.x, h.y, h.z, 'neon');
    }

    const used = this.used;
    let usedN = 0;
    for (let i = 0; i < g.slots.length; i++) {
      const slot = g.slots[i]!;
      if (i >= this.voiceCap) continue;
      const best = this.nearest(slot, used, usedN);
      if (!best) {
        slot.key = 0;
        slot.target = 0;
        aim(slot.gain.gain, 0, t, 0.12, 'slot');
        this.living.attachSend(slot.gain, false);
        if (slot.connected && slot.gain.gain.value < 0.002) {
          try { slot.pan.disconnect(); } catch { /* already out */ }
          slot.connected = false;
          slot.parked = true;
        }
        continue;
      }
      if (!slot.connected) {
        slot.pan.connect(master);
        slot.connected = true;
        slot.parked = false;
      }
      used[usedN++] = best.key;
      slot.key = best.key;
      setPos(slot.pan, best.x, best.y, best.z);
      const dist = Math.sqrt(best.d2);
      const plan = TIER_PLAN[this.tier];
      const occ = this.occlusionAt(best.x, best.y, best.z, cam, dist);
      if (plan.occlusion === 'lowpass') ensureSlotOccluder(slot, this.ambience.context!);
      slot.target = slotLevel(slot.kind, bed, dist, rain, street, open, presence) * (plan.occlusion === 'off' ? 1 : occ.gain);
      aim(slot.gain.gain, slot.target, t, 0.1, 'slot');
      if (slot.occlude) aim(slot.occlude.frequency, plan.occlusion === 'lowpass' ? occ.hz : 18000, t, 0.12, 'occlude', 1);
      this.living.attachSend(slot.gain, plan.combs > 0 && slot.target > HEARD);
    }
  }

  private peekAwning(cam: Vec3): number {
    const life = crowdAudioSnap().life;
    let awningD = 18;
    const n = Math.min(life.length, 40);
    for (let i = 0; i < n; i++) {
      const s = life[i]!;
      if (s.kind !== 'awning') continue;
      const d = Math.hypot(s.x - cam.x, s.z - cam.z);
      if (d < awningD) awningD = d;
    }
    return Math.max(0, 1 - awningD / 14);
  }

  private add(x: number, y: number, z: number, kind: SlotKind): void {
    if (this.candN >= this.pool.length) return;
    const c = this.pool[this.candN++]!;
    c.x = x;
    c.y = y;
    c.z = z;
    c.kind = kind;
    c.key = hash2i(Math.round(x * 2), Math.round(z * 2), KIND_SALT[kind]);
    const dx = x - this.camX;
    const dz = z - this.camZ;
    c.d2 = dx * dx + dz * dz;
  }

  private nearest(slot: StreetSlot, used: number[], usedN: number): Candidate | null {
    let best: Candidate | null = null;
    let bestD = Infinity;
    let held: Candidate | null = null;
    let heldD = Infinity;
    for (let i = 0; i < this.candN; i++) {
      const c = this.pool[i]!;
      if (c.kind !== slot.kind || taken(used, usedN, c.key)) continue;
      if (c.d2 < bestD) {
        bestD = c.d2;
        best = c;
      }
      if (c.key === slot.key && c.d2 < heldD) {
        heldD = c.d2;
        held = c;
      }
    }
    if (held && heldD < bestD * 1.45) return held;
    return best;
  }

  private placeSpinner(spinnerAt: SpinnerAt | null, interior: number, flying: boolean, cam: Vec3, t: number): void {
    const g = this.graph;
    if (!g) return;
    const voice = spinnerVoice(spinnerAt, interior, flying);
    if (voice.gain > 0) {
      const plan = TIER_PLAN[this.tier];
      let gain = voice.gain;
      let freq = voice.freq;
      if (voice.onListener) setPos(g.spinnerPan, cam.x, cam.y, cam.z);
      else if (spinnerAt) {
        setPos(g.spinnerPan, spinnerAt.x, spinnerAt.y, spinnerAt.z);
        if (plan.occlusion !== 'off') {
          const occ = this.occlusionAt(spinnerAt.x, spinnerAt.y, spinnerAt.z, cam, spinnerAt.dist);
          gain *= occ.gain;
          if (plan.occlusion === 'lowpass') freq = Math.min(freq, occ.hz);
        }
      }
      aim(g.spinner.gain, gain, t, voice.onListener ? 0.25 : 0.08, 'spinner');
      aim(g.spinnerFilter.frequency, freq, t, 0.05, 'spinnerFreq', 1);
      this.spinnerOn = gain > HEARD ? 1 : 0;
    } else {
      aim(g.spinner.gain, 0, t, 0.1, 'spinner');
      this.spinnerOn = 0;
    }
  }

  private hear(cam: Vec3, alt: number, rain: number, interior: number, near: number, bed: DistrictBed): HearInput {
    const layout = this.layout ?? new CityLayout();
    this.layout = layout;
    const here = layout.districtAt(cam.x, cam.z);
    const graph = streetGraph(layout);
    const edge = edgeNear(graph, cam.x, cam.z, 48);
    let edgeKind: HearInput['edgeKind'] = 'none';
    let laneDist = 80;
    let deck = 0;
    if (edge) {
      const row = graph.edges[edge.edge];
      if (row) {
        edgeKind = row.kind;
        laneDist = edge.dist;
        deck = row.deck;
      }
    }
    let freewayDist = 800;
    let freewayWidth = 70;
    let freewayDepth = 0;
    for (const line of layout.freeways) {
      const d = distToPolyline(cam.x, cam.z, line);
      if (d >= freewayDist) continue;
      freewayDist = d;
      freewayWidth = line.width;
      freewayDepth = freewayRoutes().find((r) => r.id === line.id)?.depth ?? 0;
    }
    let signNear = 0;
    let signX = cam.x;
    let signY = cam.y;
    let signZ = cam.z;
    for (let i = 0; i < this.holos.length; i++) {
      const h = this.holos[i]!;
      const d = Math.hypot(h.x - cam.x, h.y - cam.y, h.z - cam.z);
      if (d >= 16) continue;
      const n = 1 - d / 16;
      if (n > signNear) {
        signNear = n;
        signX = h.x;
        signY = h.y;
        signZ = h.z;
      }
    }
    const cloth = Math.max(
      umbrellaFraction(rain) * Math.min(1, near / 3),
      rain > 0.45 && alt < 4 && this.awningNear < 0.4 && interior < 0.3 ? 0.4 : 0,
    );
    const surf = this.ambience.surfLevel;
    return hearDefaults({
      x: cam.x, z: cam.z, y: cam.y, alt, rain, interior,
      streetWidth: here.grid.street,
      laneDist, edgeKind, deck,
      freewayDist, freewayWidth, freewayDepth,
      canyon: bed.canyon,
      industrial: bed.industrial,
      neon: bed.neon,
      awningNear: this.awningNear,
      umbrella: cloth,
      storm: surf,
      surf,
      signNear, signX, signY, signZ,
      district: this.districtId || here.id,
      time: this.ambience.context?.currentTime ?? 0,
    });
  }

  private refreshColumns(cam: Vec3): void {
    const now = nowMs();
    if (now - this.columnsAt < 400) return;
    this.columnsAt = now;
    const layout = this.layout;
    if (!layout) return;
    this.columns.length = 0;
    for (const lm of layout.landmarks) {
      if (Math.hypot(lm.x - cam.x, lm.z - cam.z) > 170) continue;
      const yaw = bearingToYaw(lm.bearingDeg);
      this.columns.push({
        x: lm.x,
        z: lm.z,
        hw: lm.baseWidth * 0.5,
        hd: (lm.baseDepth ?? lm.baseWidth) * 0.5,
        c: Math.cos(yaw),
        s: Math.sin(yaw),
        top: lm.height,
      });
    }
  }

  private occlusionAt(x: number, y: number, z: number, cam: Vec3, dist: number): Occlusion {
    const plan = TIER_PLAN[this.tier];
    if (plan.occSteps <= 0) return occlusionOf(0, dist, 'off');
    const key = hash2i(Math.round(x * 0.5), Math.round(z * 0.5), Math.round(y));
    const now = nowMs();
    const cached = this.occMemo.get(key);
    if (cached && now - cached.at < 220) return { gain: cached.gain, hz: cached.hz, hits: 0 };
    this.refreshColumns(cam);
    const hits = occlusionHits(cam.x, cam.y, cam.z, x, y, z, plan.occSteps, (px, py, pz) => this.solidAt(px, py, pz));
    const occ = occlusionOf(hits, dist, plan.occlusion);
    this.occMemo.set(key, { at: now, gain: occ.gain, hz: occ.hz });
    if (this.occMemo.size > 48) this.occMemo.clear();
    return occ;
  }

  private solidAt(x: number, y: number, z: number): boolean {
    if (y > 80) return false;
    for (const col of this.columns) if (columnSolid(col, x, y, z)) return true;
    const layout = this.layout;
    if (!layout || layout.isOcean(x, z) || layout.isReserved(x, z, 0)) return false;
    const d = layout.districtAt(x, z);
    const [ax, az] = bearingToDir(d.grid.bearingDeg);
    const [bx, bz] = bearingToDir(d.grid.bearingDeg + 90);
    if (y > 28 + d.grid.block[0] * 0.15) return false;
    return gridLotSolid(x, z, ax, az, bx, bz, d.grid.block[0], d.grid.block[1], d.grid.street);
  }
}

function presenceOf(id: string): number {
  const share = crowdShareOf(id);
  const snap = crowdAudioSnap();
  if (!id || snap.districtId !== id) return share;
  if (snap.want <= 0) return 0;
  return share * Math.min(1, snap.count / snap.want);
}

function taken(used: number[], n: number, key: number): boolean {
  for (let i = 0; i < n; i++) if (used[i] === key) return true;
  return false;
}

function aim(param: AudioParam, value: number, time: number, tc: number, name: string, epsilon = 0.001): void {
  scheduleParam(param, value, time, tc, name, epsilon);
}

/**
 * Polygon, or the Wallace pyramid reserve plus 40 m — the same test App uses
 * for machinery. The causeway and the north court sit outside the polygon.
 */
export function heardDistrictId(layout: CityLayout, x: number, z: number): string {
  let id = layout.districtAt(x, z).id;
  const wal = layout.landmarkById('wallace-pyramid');
  if (wal && Math.hypot(x - wal.x, z - wal.z) < wal.reserveRadius + 40) id = 'wallace-vernon';
  return id;
}

/** On a new district, keep whatever was still fading. Weight is conserved. */
export function retargetCrossfade(aW: number, bW: number): { aW: number; bW: number } {
  let nextA = 0;
  let nextB = aW + bW;
  const sum = nextA + nextB;
  if (sum > 1) {
    nextA /= sum;
    nextB /= sum;
  }
  return { aW: nextA, bW: nextB };
}

function heard(v: number): number {
  return v > HEARD ? 1 : 0;
}

function nightAmount(): number {
  const u = U.night as unknown as { value?: number };
  const v = u.value;
  return typeof v === 'number' && Number.isFinite(v) ? v : 1;
}

function liveTier(): Tier {
  const w = window as unknown as { __nla?: { app?: { quality?: { tier?: Tier } } } };
  return w.__nla?.app?.quality?.tier ?? 'medium';
}

function nowSec(): number {
  return performance.now() / 1000;
}

function nowMs(): number {
  return performance.now();
}
