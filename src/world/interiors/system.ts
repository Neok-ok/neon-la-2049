// Streams interiors, hides the city once a walker is past an exterior door, and muffles the bed.
// Fly mode never enters: the volume is solid through FlyController.blocksExtra.
import { Group, Mesh, type Object3D, type Scene } from 'three/webgpu';
import type { CityQuery } from '../CityQuery';
import type { ModeId } from '../../camera/types';
import type { Tier } from '../../core/quality';
import { allInteriors } from './api';
import { interiorDetail } from './detail';
import { buildInteriorGeometry, trisOf } from './geom';
import { interiorMaterial } from './material';
import { buildPortalGeometry, portalMaterial } from './portal';
import { buildRainGeometry, rainMaterial } from './rain';
import type { InteriorDetail, InteriorRide, InteriorSpec } from './types';
import { boxVolume, containsBox, distToBox } from './volume';

export interface ExteriorHosts {
  /** Forced hidden while occluded, forced visible again outside. They do not manage their own flag. */
  toggle: Object3D[];
  /** Forced hidden while occluded only. Rain, haze and lane traffic set their own flag every frame. */
  suppress: Object3D[];
  /** Landmark root. Children not named in the active interior's keep list are hidden. */
  landmarks: Object3D;
}

interface Run {
  spec: InteriorSpec;
  group: Group;
  mesh: Mesh;
  portal: Mesh;
  rain: Mesh | null;
  mounted: boolean;
  shown: boolean;
  meshTris: number;
  portalTris: number;
  rainTris: number;
}

const RAIN_COUNT: Record<InteriorDetail, number> = { 0: 0, 1: 16, 2: 28, 3: 42 };

export interface RidePose {
  x: number;
  y: number;
  z: number;
  heading: number;
}

export interface InteriorStats {
  interior: string;
  interiorOccluded: boolean;
  interiorMuffle: number;
  interiorTris: number;
  interiorMeshes: number;
  interiorMounted: number;
}

export class InteriorSystem {
  readonly group = new Group();
  private readonly runs = new Map<string, Run>();
  private detail: InteriorDetail;
  private activeId: string | null = null;
  private occluded = false;
  private muffle = 0;
  private hum = 0;
  private hosts: ExteriorHosts | null = null;
  private ride: {
    specId: string;
    doorId: string;
    to: string;
    toDoor: string;
    dwell: number;
    t: number;
    phase: 'dwell' | 'fade';
  } | null = null;
  private pendingRide: RidePose | null = null;

  constructor(scene: Scene, query: CityQuery, tier: Tier) {
    this.group.name = 'interiors';
    scene.add(this.group);
    this.detail = interiorDetail(tier);
    for (const spec of allInteriors()) {
      if (spec.colliders?.length) {
        query.addColliders(spec.colliders.map((c) => ({ ...c, yaw: c.yaw ?? 0 })));
      }
      const run = this.make(spec);
      this.runs.set(spec.id, run);
      this.rebuild(run);
    }
  }

  bind(hosts: ExteriorHosts): void {
    this.hosts = hosts;
  }

  setTier(tier: Tier): void {
    const next = interiorDetail(tier);
    if (next === this.detail) return;
    this.detail = next;
    for (const run of this.runs.values()) this.rebuild(run);
  }

  /** True when a spinner body would be inside any interior. Walk mode does not call this. */
  blocksFly(x: number, y: number, z: number): boolean {
    for (const run of this.runs.values()) {
      if (containsBox(run.spec.volume, x, y, z, 0.2)) return true;
    }
    return false;
  }

  get blend(): number {
    return this.muffle;
  }

  /** 0..1. The quiet interior hum, already smoothed. */
  get humAmount(): number {
    return this.hum;
  }

  /**
   * Feet for a finished ride. The caller moves the walker; this does not.
   * One pose per fade, then null until the next ride.
   */
  consumeRide(): RidePose | null {
    const p = this.pendingRide;
    this.pendingRide = null;
    return p;
  }

  /**
   * Fly mode cannot enter a volume. A high exterior door (sill above 12 m) hands
   * walk mode to the threshold instead of the street, so a roof pad can be walked.
   * Horizontal radius 28 m, vertical 16 m.
   */
  walkHandoff(x: number, y: number, z: number): RidePose | null {
    let best: RidePose | null = null;
    let bd = 28;
    for (const run of this.runs.values()) {
      for (const d of run.spec.doors) {
        if (!d.exterior) continue;
        const b = d.box;
        if (b.y0 < 12) continue;
        const dist = Math.hypot(x - b.x, z - b.z);
        const midY = (b.y0 + b.y1) * 0.5;
        if (dist >= bd || Math.abs(y - midY) > 16) continue;
        bd = dist;
        const vx = b.x - run.spec.volume.x;
        const vz = b.z - run.spec.volume.z;
        const len = Math.hypot(vx, vz) || 1;
        const fx = b.x + (vx / len) * 1.2;
        const fz = b.z + (vz / len) * 1.2;
        best = {
          x: fx,
          y: b.y0 + 0.05,
          z: fz,
          heading: Math.atan2(run.spec.volume.x - fx, -(run.spec.volume.z - fz)),
        };
      }
    }
    return best;
  }

  update(dt: number, mode: ModeId, x: number, y: number, z: number, rain: number): void {
    const active = mode === 'walk' ? this.pick(x, y, z) : null;
    this.activeId = active?.id ?? null;
    const inDoor = !!active && this.inExteriorDoor(active, x, y, z);
    this.occluded = !!active && !inDoor;
    this.trackRide(dt, mode, active, x, y, z);
    const fading = this.ride?.phase === 'fade';
    const target = fading ? 1 : !active ? 0 : inDoor ? 0.36 : (active.muffle ?? 0.85);
    const humTarget = active && this.occluded ? (active.hum ?? 0) : 0;
    const hk = 1 - Math.exp(-Math.max(0, dt) * 1.6);
    this.hum += (humTarget - this.hum) * hk;
    const k = 1 - Math.exp(-Math.max(0, dt) * 2.6);
    this.muffle += (target - this.muffle) * k;

    const links = new Set(active?.links ?? []);
    for (const run of this.runs.values()) {
      const dist = distToBox(run.spec.volume, x, y, z);
      const radius = run.spec.streamRadius ?? 72;
      const linked = !!active && (run.spec.id === active.id || links.has(run.spec.id) || (run.spec.links ?? []).includes(active.id));
      if (!run.mounted && dist <= radius) run.mounted = true;
      else if (run.mounted && dist > radius * 1.35 && !linked) run.mounted = false;
      const fromStreet = run.spec.showFromOutside !== false;
      const show = run.mounted && (linked || (!this.occluded && fromStreet));
      if (show !== run.shown) {
        run.shown = show;
        run.group.visible = show;
        run.spec.onShown?.(show);
      }
      run.portal.visible = show && this.occluded && run.portalTris > 0;
      if (run.rain) run.rain.visible = show && this.occluded && rain > 0.12;
    }
    this.applyExterior();
  }

  get stats(): InteriorStats {
    let tris = 0, meshes = 0, mounted = 0;
    for (const run of this.runs.values()) {
      if (run.mounted) mounted++;
      if (!run.shown) continue;
      if (run.meshTris > 0) { meshes++; tris += run.meshTris; }
      if (run.portal.visible) { meshes++; tris += run.portalTris; }
      if (run.rain?.visible) { meshes++; tris += run.rainTris; }
    }
    return {
      interior: this.activeId ?? '',
      interiorOccluded: this.occluded,
      interiorMuffle: this.muffle,
      interiorTris: tris,
      interiorMeshes: meshes,
      interiorMounted: mounted,
    };
  }

  hudLabel(): string {
    const s = this.stats;
    if (!s.interior) return `outside · mounted ${s.interiorMounted}`;
    const where = s.interiorOccluded ? 'occluded' : 'threshold';
    return `${s.interior} · ${where} · muffle ${s.interiorMuffle.toFixed(2)} · ${s.interiorMeshes} mesh · ${s.interiorTris} tris`;
  }

  private trackRide(dt: number, mode: ModeId, active: InteriorSpec | null, x: number, y: number, z: number): void {
    if (mode !== 'walk' || !active?.rides?.length) {
      if (this.ride?.phase !== 'fade') this.ride = null;
      else this.advanceFade(dt);
      return;
    }
    if (this.ride?.phase === 'fade') {
      this.advanceFade(dt);
      return;
    }
    let hit: InteriorRide | null = null;
    for (const r of active.rides) {
      const door = active.doors.find((d) => d.id === r.door);
      if (door && containsBox(door.box, x, y, z)) { hit = r; break; }
    }
    if (!hit) { this.ride = null; return; }
    if (!this.ride || this.ride.specId !== active.id || this.ride.doorId !== hit.door) {
      this.ride = {
        specId: active.id, doorId: hit.door, to: hit.to, toDoor: hit.toDoor,
        dwell: hit.dwell ?? 0.8, t: 0, phase: 'dwell',
      };
    }
    this.ride.t += dt;
    if (this.ride.t >= this.ride.dwell) {
      this.ride.phase = 'fade';
      this.ride.t = 0;
    }
  }

  private advanceFade(dt: number): void {
    if (!this.ride || this.ride.phase !== 'fade') return;
    this.ride.t += dt;
    if (this.ride.t < 0.4) return;
    const pose = this.ridePose(this.ride.to, this.ride.toDoor);
    if (pose) this.pendingRide = pose;
    this.ride = null;
  }

  /** Just inside the destination, facing its exit door, clear of the call panels. */
  private ridePose(toId: string, toDoor: string): RidePose | null {
    const spec = this.runs.get(toId)?.spec;
    if (!spec) return null;
    const exit = spec.doors.find((d) => d.id === 'out') ?? spec.doors.find((d) => d.id === toDoor);
    const vol = spec.volume;
    let x = vol.x;
    let z = vol.z;
    if (exit) {
      const dx = vol.x - exit.box.x;
      const dz = vol.z - exit.box.z;
      const len = Math.hypot(dx, dz) || 1;
      x = exit.box.x + (dx / len) * 0.72;
      z = exit.box.z + (dz / len) * 0.72;
    }
    const heading = exit ? Math.atan2(exit.box.x - x, -(exit.box.z - z)) : 0;
    return { x, y: vol.y0 + 0.08, z, heading };
  }

  private pick(x: number, y: number, z: number): InteriorSpec | null {
    if (this.activeId) {
      const cur = this.runs.get(this.activeId)?.spec;
      if (cur && containsBox(cur.volume, x, y, z)) return cur;
    }
    let best: InteriorSpec | null = null;
    let bv = Infinity;
    for (const run of this.runs.values()) {
      if (!containsBox(run.spec.volume, x, y, z)) continue;
      const v = boxVolume(run.spec.volume);
      if (v < bv) { bv = v; best = run.spec; }
    }
    return best;
  }

  private inExteriorDoor(spec: InteriorSpec, x: number, y: number, z: number): boolean {
    for (const d of spec.doors) {
      if (d.exterior && containsBox(d.box, x, y, z)) return true;
    }
    return false;
  }

  private make(spec: InteriorSpec): Run {
    const group = new Group();
    group.name = spec.id;
    group.visible = false;
    const mesh = new Mesh(buildInteriorGeometry([], [], [0, 0, 0], 0), interiorMaterial());
    mesh.name = `${spec.id}-mesh`;
    mesh.frustumCulled = true;
    const portal = new Mesh(buildPortalGeometry([]), portalMaterial());
    portal.name = `${spec.id}-portal`;
    portal.visible = false;
    portal.frustumCulled = false;
    group.add(mesh, portal);
    this.group.add(group);
    return {
      spec, group, mesh, portal, rain: null, mounted: false, shown: false,
      meshTris: 0, portalTris: 0, rainTris: 0,
    };
  }

  private rebuild(run: Run): void {
    const built = run.spec.build(this.detail);
    run.mesh.geometry.dispose();
    run.mesh.geometry = buildInteriorGeometry(built.boxes, built.lights, built.ambient, this.detail);
    run.meshTris = trisOf(run.mesh.geometry);
    run.portal.geometry.dispose();
    run.portal.geometry = buildPortalGeometry(built.portals);
    run.portalTris = trisOf(run.portal.geometry);
    if (run.rain) {
      run.rain.geometry.dispose();
      run.group.remove(run.rain);
      run.rain = null;
    }
    const n = RAIN_COUNT[this.detail];
    run.rainTris = 0;
    if (n > 0 && built.openSky) {
      const rain = new Mesh(buildRainGeometry(built.openSky, n), rainMaterial());
      rain.name = `${run.spec.id}-rain`;
      rain.visible = false;
      rain.frustumCulled = false;
      rain.renderOrder = 4;
      run.group.add(rain);
      run.rain = rain;
      run.rainTris = trisOf(rain.geometry);
    }
  }

  private applyExterior(): void {
    const hosts = this.hosts;
    if (!hosts) return;
    if (!this.occluded) {
      for (const o of hosts.toggle) o.visible = true;
      for (const child of hosts.landmarks.children) child.visible = true;
      return;
    }
    for (const o of hosts.toggle) o.visible = false;
    for (const o of hosts.suppress) o.visible = false;
    const keep = new Set(this.runs.get(this.activeId ?? '')?.spec.keepLandmarks ?? []);
    for (const child of hosts.landmarks.children) child.visible = keep.has(child.name);
  }
}
