// One instanced draw for every hologram in the city, plus one draw for ground spill cards.
// Which panels survive is decided every frame from the live quality tier, so the FPS governor's
// tier drop shrinks count, fidelity, spill and range in the same frame the streamer pulls in.
import {
  DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, Vector3,
  type PerspectiveCamera,
} from 'three/webgpu';
import type { QualitySettings } from '../../core/quality';
import { U } from '../../atmosphere/uniforms';
import { SIGN_RGB } from '../materials/signPalette';
import type { CityLayout } from '../layout';
import { getHoloCardMaterial, getHoloMaterial } from './material';
import { allHolograms } from './registry';
import { clearHoloSpill, HOLO_SPILL_SLOTS, setHoloSpill } from './spill';
import { holoIndex, type HologramSpec } from './types';

const MAX = 96;
const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);
const _fwd = new Vector3();
const _flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);

interface Cand {
  spec: HologramSpec;
  dist: number;
  range: number;
  score: number;
}

function rgbOf(color: number): [number, number, number] {
  const c = SIGN_RGB[Math.max(0, Math.min(SIGN_RGB.length - 1, color | 0))] ?? SIGN_RGB[1];
  return c ?? [0.15, 0.85, 1];
}

export class HologramField {
  readonly group = new Group();
  /** Panels actually drawn this frame (not counting depth slices). */
  shown = 0;
  /** Ground spill cards drawn this frame. */
  cards = 0;
  /** Placements that passed range and view tests, before the tier cap. */
  candidates = 0;

  private readonly panels: InstancedMesh;
  private readonly cardMesh: InstancedMesh;
  private readonly iHolo: InstancedBufferAttribute;
  private readonly iTint: InstancedBufferAttribute;
  private readonly iCard: InstancedBufferAttribute;

  constructor(private layout: CityLayout) {
    const geo = new PlaneGeometry(1, 1);
    this.iHolo = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.iTint = new InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.iHolo.setUsage(DynamicDrawUsage);
    this.iTint.setUsage(DynamicDrawUsage);
    geo.setAttribute('iHolo', this.iHolo);
    geo.setAttribute('iTint', this.iTint);
    this.panels = new InstancedMesh(geo, getHoloMaterial(), MAX);
    this.panels.name = 'holograms';
    this.panels.frustumCulled = false;
    this.panels.renderOrder = 6;
    this.panels.count = 0;

    const cardGeo = new PlaneGeometry(1, 1);
    this.iCard = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.iCard.setUsage(DynamicDrawUsage);
    cardGeo.setAttribute('iCard', this.iCard);
    this.cardMesh = new InstancedMesh(cardGeo, getHoloCardMaterial(), MAX);
    this.cardMesh.name = 'hologram-spill';
    this.cardMesh.frustumCulled = false;
    this.cardMesh.renderOrder = 4;
    this.cardMesh.count = 0;

    this.group.name = 'hologram-field';
    this.group.add(this.panels, this.cardMesh);
  }

  update(camera: PerspectiveCamera, q: QualitySettings, streamed: readonly HologramSpec[]): void {
    camera.getWorldDirection(_fwd);
    const cam = camera.position;
    const regs = allHolograms();
    const cand: Cand[] = [];
    const consider = (spec: HologramSpec): void => {
      const dx = spec.x - cam.x;
      const dy = spec.y - cam.y;
      const dz = spec.z - cam.z;
      const dist = Math.hypot(dx, dy, dz) || 0.001;
      const range = spec.band === 'street' ? q.lod0Radius * 0.9 : q.nearRadius * 1.35;
      if (dist > range) return;
      const dot = (dx * _fwd.x + dy * _fwd.y + dz * _fwd.z) / dist;
      // Wide cone so a panel you are about to walk under stays up, but off-screen towers
      // do not spend the tier cap.
      if (dist > 28 && dot < 0.22) return;
      const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
      cand.push({ spec, dist, range, score: dist / range + spec.rank * 0.42 + ang * 0.1 });
    };
    for (const spec of regs) consider(spec);
    for (const spec of streamed) {
      let dup = false;
      for (const r of regs) {
        const dx = r.x - spec.x;
        const dy = r.y - spec.y;
        const dz = r.z - spec.z;
        if (dx * dx + dy * dy + dz * dz < 36) { dup = true; break; }
      }
      if (!dup) consider(spec);
    }
    cand.sort((a, b) => a.score - b.score);
    this.candidates = cand.length;
    const cap = Math.min(q.holoCount, cand.length);
    const chosen = cand.slice(0, cap);
    this.shown = chosen.length;

    const slices = q.holoDetail >= 3 ? 3 : q.holoDetail >= 2 ? 2 : 1;
    const sliced = q.holoDetail >= 2 ? 5 : 0;
    let n = 0;
    for (let i = 0; i < chosen.length && n < MAX; i++) {
      const c = chosen[i];
      if (!c) continue;
      const spec = c.spec;
      const nx = Math.sin(spec.yaw);
      const nz = Math.cos(spec.yaw);
      const count = i < sliced ? slices : 1;
      const detail = Math.max(0, Math.min(1, (q.holoDetail / 3) * (1 - c.dist / (c.range * 1.05))));
      const [r, g, b] = rgbOf(spec.color);
      for (let s = 0; s < count && n < MAX; s++) {
        const back = s * 0.85;
        _p.set(spec.x - nx * back, spec.y, spec.z - nz * back);
        _q.setFromAxisAngle(_up, spec.yaw);
        _s.set(spec.w, spec.h, 1);
        this.panels.setMatrixAt(n, _m.compose(_p, _q, _s));
        this.iHolo.setXYZW(n, holoIndex(spec.design), spec.seed, s, detail);
        this.iTint.setXYZ(n, r, g, b);
        n++;
      }
    }
    this.panels.count = n;
    this.panels.visible = n > 0;
    this.panels.instanceMatrix.needsUpdate = true;
    this.iHolo.needsUpdate = true;
    this.iTint.needsUpdate = true;

    U.holoSpill.value = q.holoSpill > 0 ? 1 : 0;
    clearHoloSpill();
    const lit = chosen.filter((c) => c.spec.spill > 0).sort((a, b) => a.dist - b.dist);
    const spillN = Math.min(q.holoSpill, HOLO_SPILL_SLOTS, lit.length);
    for (let i = 0; i < spillN; i++) {
      const c = lit[i];
      if (!c) continue;
      const [r, g, b] = rgbOf(c.spec.color);
      setHoloSpill(i, c.spec.x, c.spec.y, c.spec.z, c.spec.spill, r, g, b);
    }

    let cards = 0;
    if (q.holoCards > 0) {
      for (const c of lit) {
        if (cards >= q.holoCards || cards >= MAX) break;
        const ground = this.layout.heightAt(c.spec.x, c.spec.z);
        if (c.spec.y - ground > 80) continue;
        const d = Math.max(6, c.spec.spill * 1.35);
        _p.set(c.spec.x, ground + 0.16, c.spec.z);
        _s.set(d, d, 1);
        this.cardMesh.setMatrixAt(cards, _m.compose(_p, _flat, _s));
        const [r, g, b] = rgbOf(c.spec.color);
        this.iCard.setXYZW(cards, r, g, b, 0.32);
        cards++;
      }
    }
    this.cards = cards;
    this.cardMesh.count = cards;
    this.cardMesh.visible = cards > 0;
    this.cardMesh.instanceMatrix.needsUpdate = true;
    this.iCard.needsUpdate = true;
  }
}
