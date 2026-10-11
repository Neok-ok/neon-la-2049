// World streaming. Two-level quadtree:
//   superchunks (2000 m) render one merged far-LOD mesh (LOD2) when distant;
//   when the camera comes near, a superchunk is refined into 4x4 chunks (500 m) at LOD1 or LOD0.
// Geometry is generated in a worker pool; swaps are hole-free (old mesh stays until replacement is ready).
import {
  BufferAttribute, BufferGeometry, Box3, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry,
  Quaternion, Sphere, Vector3, type Object3D, type Scene,
} from 'three/webgpu';
import type { QualitySettings } from '../../core/quality';
import type { ChunkWorkerRequest, ChunkWorkerResponse } from '../fabric/chunk.worker';
import { BLOCK_STRIDE, SIGN_STRIDE } from '../fabric/mesher';
import { chunkNeedsFarDetail, farDetailsReady } from '../../districts/detailGate';
import { getCityMaterial } from '../materials/cityMaterial';
import { getSignMaterial } from '../materials/signMaterial';
import { getLayout } from '../layout';
import { buildDetails, type ChunkBlock } from '../detail/registry';
import { hologramsFromSignBuffer } from '../holograms/fromSigns';
import type { HologramSpec } from '../holograms/types';
import { SIGN_RGB } from '../materials/signPalette';
import type { GlowMark } from '../../atmosphere/AirField';

export const CHUNK = 500;
export const SUPER = 2000;
const PER = SUPER / CHUNK;
const AABB_TOP = 260;

interface Slot {
  key: string;
  x0: number;
  z0: number;
  size: number;
  want: number; // desired LOD, -1 = none
  shownLod: number;
  shown: Group | null;
  pendingLod: number;
  dist: number;
  /** Large kind-2 billboards promoted to the hologram field. Cleared on dispose. */
  panels: HologramSpec[];
  /** LOD0 signs big enough to halo. Stride 7: x, y, z, r, g, b, area. World space. */
  glows: Float32Array | null;
}

interface Super {
  sx: number;
  sz: number;
  far: Slot;
  children: Slot[] | null;
  near: boolean;
}

interface Job {
  slot: Slot;
  lod: number;
}

function dist3ToBox(p: Vector3, x0: number, z0: number, size: number): number {
  const dx = Math.max(x0 - p.x, 0, p.x - (x0 + size));
  const dz = Math.max(z0 - p.z, 0, p.z - (z0 + size));
  const dy = Math.max(0 - p.y, 0, p.y - AABB_TOP);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Distance to the nearest focus point. Secondary foci (prefetch) count as slightly farther. */
function focusDist(foci: readonly Vector3[], x0: number, z0: number, size: number): number {
  let d = dist3ToBox(foci[0], x0, z0, size);
  for (let i = 1; i < foci.length; i++) d = Math.min(d, dist3ToBox(foci[i], x0, z0, size) + 150);
  return d;
}

const _m = new Matrix4(), _q = new Quaternion(), _p = new Vector3(), _s = new Vector3(), _up = new Vector3(0, 1, 0);

export class ChunkStreamer {
  readonly root = new Group();
  private supers = new Map<string, Super>();
  private workers: Worker[] = [];
  private busy: number[] = [];
  private jobs = new Map<number, Job>();
  private nextId = 1;
  private ready: Array<{ job: Job; res: ChunkWorkerResponse }> = [];
  private layout = getLayout();
  private signGeo = new PlaneGeometry(1, 1);
  stats = {
    supersFar: 0, chunksNear: 0, lod0: 0, inFlight: 0, readyQueue: 0, lastGenMs: 0, boxes: 0,
    /** Meshes built on the main thread this frame. */
    uploads: 0,
    /** Highest uploads value since resetPeaks. */
    uploadPeak: 0,
    /** Main-thread milliseconds spent building meshes this frame. */
    uploadMs: 0,
  };

  resetPeaks(): void {
    this.stats.uploadPeak = 0;
    this.stats.uploads = 0;
    this.stats.uploadMs = 0;
  }

  constructor(scene: Scene, public quality: QualitySettings) {
    this.root.name = 'city-fabric';
    scene.add(this.root);
    this.spawnWorkers(quality.workers);
  }

  private spawnWorkers(n: number): void {
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('../fabric/chunk.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<ChunkWorkerResponse>) => {
        this.busy[i]--;
        const job = this.jobs.get(e.data.id);
        this.jobs.delete(e.data.id);
        if (!job) return;
        this.stats.lastGenMs = e.data.ms;
        if (job.slot.want === job.lod) this.ready.push({ job, res: e.data });
        else if (job.slot.pendingLod === job.lod) job.slot.pendingLod = -1;
      };
      w.onerror = (e) => console.error('chunk worker error', e);
      this.workers.push(w);
      this.busy.push(0);
    }
  }

  setQuality(q: QualitySettings): void {
    this.quality = q;
  }

  /**
   * Rebuild LOD0 chunks so a quality change picks up a new prop density.
   * In-flight results are integrated with the quality that is current at upload time.
   */
  invalidateLod0(): void {
    for (const s of this.supers.values()) {
      if (!s.children) continue;
      for (const c of s.children) {
        if (c.shownLod === 0 && c.pendingLod !== 0) c.shownLod = -1;
      }
    }
  }

  /** LOD0 results waiting on far-district prop modules. */
  private detailHeld: Array<{ job: Job; res: ChunkWorkerResponse }> = [];
  private readonly requestScratch: Slot[] = [];
  private readonly billboardScratch: HologramSpec[] = [];

  /** True when nothing is queued or in flight (used by screenshot automation). */
  isIdle(): boolean {
    if (this.jobs.size > 0 || this.ready.length > 0 || this.detailHeld.length > 0) return false;
    for (const s of this.supers.values()) {
      if (s.far.want >= 0 && s.far.shownLod !== s.far.want) return false;
      if (s.children) for (const c of s.children) if (c.want >= 0 && c.shownLod !== c.want) return false;
    }
    return true;
  }

  private mkSlot(key: string, x0: number, z0: number, size: number): Slot {
    return { key, x0, z0, size, want: -1, shownLod: -1, shown: null, pendingLod: -1, dist: 0, panels: [], glows: null };
  }

  private disposeSlot(s: Slot): void {
    if (s.shown) disposeGroup(s.shown);
    s.shown = null;
    s.shownLod = -1;
    s.want = -1;
    s.panels = [];
    s.glows = null;
  }

  /**
   * Billboard-sized signs on chunks that are actually showing. The hologram field
   * culls this list again by tier, so a far LOD upload does not force a draw.
   */
  billboards(): HologramSpec[] {
    const out = this.billboardScratch;
    out.length = 0;
    for (const s of this.supers.values()) {
      this.visitShown(s, (slot) => {
        for (let i = 0; i < slot.panels.length; i++) {
          const panel = slot.panels[i];
          if (panel) out.push(panel);
        }
      });
    }
    return out;
  }

  /**
   * Nearest LOD0 signs above `minArea`, appended to `out` (the caller clears it).
   * Capped so a dressed market chunk cannot hand the halo pass thousands of blades.
   */
  collectSignGlows(x: number, y: number, z: number, range: number, minArea: number, out: GlowMark[]): void {
    const r2 = range * range;
    const pad = range + CHUNK;
    for (const s of this.supers.values()) {
      this.visitShown(s, (slot) => {
        if (slot.shownLod !== 0 || !slot.glows) return;
        const dx0 = slot.x0 + slot.size * 0.5 - x;
        const dz0 = slot.z0 + slot.size * 0.5 - z;
        if (dx0 * dx0 + dz0 * dz0 > pad * pad) return;
        const g = slot.glows;
        for (let i = 0; i < g.length; i += 7) {
          const area = g[i + 6] ?? 0;
          if (area < minArea) continue;
          const gx = g[i] ?? 0;
          const gy = g[i + 1] ?? 0;
          const gz = g[i + 2] ?? 0;
          const dx = gx - x;
          const dy = gy - y;
          const dz = gz - z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r2) continue;
          if (out.length >= 64) {
            let far = 0;
            for (let k = 1; k < out.length; k++) if ((out[k]?.d2 ?? 0) > (out[far]?.d2 ?? 0)) far = k;
            if (d2 >= (out[far]?.d2 ?? 0)) continue;
            const item = out[far];
            if (!item) continue;
            item.x = gx; item.y = gy; item.z = gz;
            item.r = g[i + 3] ?? 1; item.g = g[i + 4] ?? 1; item.b = g[i + 5] ?? 1;
            item.area = area; item.d2 = d2;
            continue;
          }
          out.push({
            x: gx, y: gy, z: gz,
            r: g[i + 3] ?? 1, g: g[i + 4] ?? 1, b: g[i + 5] ?? 1,
            area, d2,
          });
        }
      });
    }
  }

  /** Shown slots for one super, without allocating a filtered array. */
  private visitShown(s: Super, fn: (slot: Slot) => void): void {
    if (s.near && s.children) {
      const allShown = s.children.every((c) => c.shown);
      if (allShown || !s.far.shown) {
        for (const c of s.children) if (c.shown) fn(c);
        return;
      }
    }
    if (!s.near && s.children && !s.far.shown) {
      for (const c of s.children) if (c.shown) fn(c);
      return;
    }
    if (s.far.shown) fn(s.far);
  }

  /** `foci[0]` is the camera; extra points (e.g. the next cinematic shot) are streamed in too. */
  update(foci: readonly Vector3[]): void {
    const q = this.quality;
    const R = q.farRadius;
    const bounds = this.layout.bounds;

    // create supers in range
    for (const f of foci) {
      const sx0 = Math.floor((f.x - R) / SUPER), sx1 = Math.floor((f.x + R) / SUPER);
      const sz0 = Math.floor((f.z - R) / SUPER), sz1 = Math.floor((f.z + R) / SUPER);
      for (let sx = sx0; sx <= sx1; sx++)
        for (let sz = sz0; sz <= sz1; sz++) {
          const x0 = sx * SUPER, z0 = sz * SUPER;
          if (x0 + SUPER < bounds.minX - 2000 || x0 > bounds.maxX + 2000 || z0 + SUPER < bounds.minZ - 2000 || z0 > bounds.maxZ + 2000) continue;
          const key = `${sx},${sz}`;
          if (!this.supers.has(key) && focusDist(foci, x0, z0, SUPER) < R) {
            this.supers.set(key, { sx, sz, far: this.mkSlot(`F${key}`, x0, z0, SUPER), children: null, near: false });
          }
        }
    }

    const requests = this.requestScratch;
    requests.length = 0;
    let far = 0, near = 0, l0 = 0;
    for (const [key, s] of this.supers) {
      const d = focusDist(foci, s.far.x0, s.far.z0, SUPER);
      s.far.dist = d;
      if (d > R * 1.12) {
        this.disposeSlot(s.far);
        if (s.children) s.children.forEach((c) => this.disposeSlot(c));
        this.supers.delete(key);
        continue;
      }
      const wantNear = d < (s.near ? q.nearRadius * 1.12 : q.nearRadius);
      s.near = wantNear;
      if (wantNear) {
        if (!s.children) {
          s.children = [];
          for (let i = 0; i < PER; i++)
            for (let j = 0; j < PER; j++) {
              const x0 = s.far.x0 + i * CHUNK, z0 = s.far.z0 + j * CHUNK;
              s.children.push(this.mkSlot(`C${x0},${z0}`, x0, z0, CHUNK));
            }
        }
        let allShown = true;
        for (const c of s.children) {
          c.dist = focusDist(foci, c.x0, c.z0, CHUNK);
          const lod0 = c.dist < (c.shownLod === 0 ? q.lod0Radius * 1.15 : q.lod0Radius);
          c.want = lod0 ? 0 : 1;
          if (c.shownLod !== c.want) requests.push(c);
          if (!c.shown) allShown = false;
          if (c.shown) { near++; if (c.shownLod === 0) l0++; }
        }
        if (allShown) this.disposeSlot(s.far);
        else if (s.far.shown) far++;
        else s.far.want = -1;
        // Swap atomically: while the far mesh is still up, keep the refined children hidden (no z-fighting).
        const showChildren = allShown || !s.far.shown;
        for (const c of s.children) if (c.shown) c.shown.visible = showChildren;
      } else {
        s.far.want = 2;
        if (s.far.shownLod !== 2) requests.push(s.far);
        if (s.far.shown && s.children) {
          s.children.forEach((c) => this.disposeSlot(c));
          s.children = null;
        } else if (s.children) {
          for (const c of s.children) {
            c.want = c.shownLod; // freeze: keep what is shown until the far mesh arrives
            if (c.shown) { c.shown.visible = true; near++; }
          }
        }
        if (s.far.shown) far++;
      }
    }
    this.stats.supersFar = far;
    this.stats.chunksNear = near;
    this.stats.lod0 = l0;

    // dispatch
    requests.sort((a, b) => a.dist - b.dist);
    for (const slot of requests) {
      if (slot.pendingLod === slot.want) continue;
      const wi = this.freeWorker();
      if (wi < 0) break;
      const id = this.nextId++;
      const job: Job = { slot, lod: slot.want };
      this.jobs.set(id, job);
      slot.pendingLod = slot.want;
      this.busy[wi]++;
      const req: ChunkWorkerRequest = { id, x0: slot.x0, z0: slot.z0, size: slot.size, lod: slot.want };
      this.workers[wi].postMessage(req);
    }
    this.stats.inFlight = this.jobs.size;

    // integrate finished chunks (bounded per frame, and by a short time slice so a
    // heavy LOD0 detail build does not stack a second upload in the same frame)
    if (this.detailHeld.length && farDetailsReady()) {
      for (const item of this.detailHeld) this.ready.push(item);
      this.detailHeld.length = 0;
    }
    this.ready.sort((a, b) => a.job.slot.dist - b.job.slot.dist);
    let budget = q.uploadsPerFrame;
    let uploaded = 0;
    let uploadMs = 0;
    let read = 0;
    const sliceStart = performance.now();
    const layout = this.layout;
    while (budget > 0 && read < this.ready.length) {
      if (uploaded > 0 && performance.now() - sliceStart > 8) break;
      const t0 = performance.now();
      const item = this.ready[read];
      read++;
      if (!item) break;
      const { job, res } = item;
      if (job.lod === 0 && chunkNeedsFarDetail(res.blocks, BLOCK_STRIDE, (index) => (
        index === 0 ? layout.defaultDistrict.id : layout.districts[index - 1]?.id ?? ''
      ))) {
        this.detailHeld.push(item);
        uploadMs += performance.now() - t0;
        continue;
      }
      const slot = job.slot;
      if (slot.pendingLod === job.lod) slot.pendingLod = -1;
      if (slot.want !== job.lod) {
        uploadMs += performance.now() - t0;
        continue;
      }
      const g = this.buildGroup(slot, res, job.lod);
      if (slot.shown) disposeGroup(slot.shown);
      slot.shown = g;
      slot.shownLod = job.lod;
      this.root.add(g);
      uploaded++;
      budget--;
      uploadMs += performance.now() - t0;
    }
    if (read > 0) this.ready.splice(0, read);
    this.stats.uploads = uploaded;
    if (uploaded > this.stats.uploadPeak) this.stats.uploadPeak = uploaded;
    this.stats.uploadMs = uploadMs;
    this.stats.readyQueue = this.ready.length + this.detailHeld.length;
  }

  private freeWorker(): number {
    let best = -1, bestLoad = 2;
    for (let i = 0; i < this.workers.length; i++) if (this.busy[i] < bestLoad) { best = i; bestLoad = this.busy[i]; }
    return best;
  }

  private buildGroup(slot: Slot, r: ChunkWorkerResponse, lod: number): Group {
    const g = new Group();
    g.name = `${slot.key}@L${lod}`;
    g.position.set(slot.x0, 0, slot.z0);
    if (r.index.length > 0) {
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(r.position, 3));
      geo.setAttribute('normal', new BufferAttribute(r.normal, 3));
      geo.setAttribute('facade', new BufferAttribute(r.facade, 2));
      geo.setAttribute('bdata', new BufferAttribute(r.bdata, 4));
      geo.setIndex(new BufferAttribute(r.index, 1));
      geo.boundingBox = new Box3(new Vector3(-50, -20, -50), new Vector3(slot.size + 50, Math.max(r.maxY, 1), slot.size + 50));
      geo.boundingSphere = geo.boundingBox.getBoundingSphere(new Sphere());
      const mesh = new Mesh(geo, getCityMaterial());
      mesh.name = 'fabric';
      mesh.matrixAutoUpdate = false;
      g.add(mesh);
      this.stats.boxes = r.boxCount;
    }
    const n = r.signs.length / SIGN_STRIDE;
    if (n > 0) g.add(this.buildSigns(r.signs, n));
    slot.panels = hologramsFromSignBuffer(slot.key, slot.x0, slot.z0, r.signs, n);
    slot.glows = lod === 0 ? packSignGlows(r.signs, n, slot.x0, slot.z0) : null;
    if (lod === 0 && this.quality.streetDetail) {
      const blocks: ChunkBlock[] = [];
      for (let i = 0; i < r.blocks.length; i += BLOCK_STRIDE) {
        const b = r.blocks;
        blocks.push({ cx: b[i], cz: b[i + 1], ax: b[i + 2], az: b[i + 3], la: b[i + 4], lb: b[i + 5], street: b[i + 6], districtIndex: b[i + 7], seed: b[i + 8], ground: b[i + 9] });
      }
      for (const o of buildDetails({ x0: slot.x0, z0: slot.z0, size: slot.size, blocks, layout: this.layout, quality: this.quality })) {
        o.position.x -= slot.x0;
        o.position.z -= slot.z0;
        g.add(o);
      }
    }
    g.updateMatrixWorld(true);
    return g;
  }

  private buildSigns(a: Float32Array, n: number): InstancedMesh {
    const geo = this.signGeo.clone();
    const iSign = new Float32Array(n * 4);
    const iKind = new Float32Array(n);
    const mesh = new InstancedMesh(geo, getSignMaterial(), n);
    for (let i = 0; i < n; i++) {
      const o = i * SIGN_STRIDE;
      _p.set(a[o], a[o + 1], a[o + 2]);
      _q.setFromAxisAngle(_up, a[o + 3]);
      _s.set(a[o + 4], a[o + 5], 1);
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      iSign.set([a[o + 4], a[o + 5], a[o + 6], a[o + 7]], i * 4);
      iKind[i] = a[o + 8];
    }
    geo.setAttribute('iSign', new InstancedBufferAttribute(iSign, 4));
    geo.setAttribute('iKind', new InstancedBufferAttribute(iKind, 1));
    mesh.computeBoundingSphere();
    mesh.name = 'signs';
    return mesh;
  }
}

/** Signs of at least 8 m². Smaller blades stay on the sign mesh and do not grow a halo. */
function packSignGlows(signs: Float32Array, n: number, x0: number, z0: number): Float32Array | null {
  const tmp: number[] = [];
  for (let i = 0; i < n; i++) {
    const o = i * SIGN_STRIDE;
    const w = signs[o + 4] ?? 0;
    const h = signs[o + 5] ?? 0;
    const area = w * h;
    if (area < 8) continue;
    const color = Math.max(0, Math.min(SIGN_RGB.length - 1, Math.round(signs[o + 6] ?? 0)));
    const rgb = SIGN_RGB[color] ?? SIGN_RGB[2] ?? [1, 0.55, 0.12];
    tmp.push((signs[o] ?? 0) + x0, signs[o + 1] ?? 0, (signs[o + 2] ?? 0) + z0, rgb[0], rgb[1], rgb[2], area);
  }
  return tmp.length ? new Float32Array(tmp) : null;
}

function disposeGroup(g: Object3D): void {
  g.removeFromParent();
  g.traverse((o) => {
    const m = o as Mesh;
    // Unique chunk geometry. Shared lamp/crowd geometry stays; the mesh dispose below
    // still drops the render object and its instance-matrix buffer.
    if (m.geometry && !o.userData.sharedGeometry) m.geometry.dispose();
    // WebGPURenderer keeps the render object until the mesh fires dispose. geometry.dispose()
    // alone left those objects, and their typed arrays, alive after the chunk was gone.
    o.dispose();
  });
}
