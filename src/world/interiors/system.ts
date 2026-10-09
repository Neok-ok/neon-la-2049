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
import type { InteriorDetail, InteriorSpec } from './types';
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
  private hosts: ExteriorHosts | null = null;

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

  update(dt: number, mode: ModeId, x: number, y: number, z: number, rain: number): void {
    const active = mode === 'walk' ? this.pick(x, y, z) : null;
    this.activeId = active?.id ?? null;
    const inDoor = !!active && this.inExteriorDoor(active, x, y, z);
    this.occluded = !!active && !inDoor;
    const target = !active ? 0 : inDoor ? 0.36 : (active.muffle ?? 0.85);
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
