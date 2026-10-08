// Merges kit templates into one mesh (one draw call) with per-vertex colour and emissive.
import { BufferAttribute, BufferGeometry, Matrix3, Matrix4, Mesh, Quaternion, Vector3 } from 'three/webgpu';
import type { KitTemplate, TemplateId } from './templates';
import { getTemplate } from './templates';
import { getKitMaterial, type KitPass } from './materials';

export interface KitInstance {
  template: TemplateId;
  x: number;
  y: number;
  z: number;
  /** Yaw that maps local +Z onto this direction (atan2(nx, nz)). */
  yaw: number;
  pitch?: number;
  sx: number;
  sy: number;
  sz: number;
  color: [number, number, number];
  emissive: [number, number, number];
  /** 0 opaque cloth/concrete, 1 metal. */
  metal: number;
  alpha?: number;
  pass?: KitPass;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _qPitch = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _n = new Vector3();
const _nm = new Matrix3();
const _up = new Vector3(0, 1, 0);
const _x = new Vector3(1, 0, 0);

class Acc {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  emi: number[] = [];
  met: number[] = [];
  alp: number[] = [];
  idx: number[] = [];
  v = 0;

  add(tmpl: KitTemplate, color: [number, number, number], emissive: [number, number, number], metal: number, alpha: number): void {
    const base = this.v;
    const tp = tmpl.position, tn = tmpl.normal;
    for (let i = 0; i < tp.length; i += 3) {
      _p.set(tp[i], tp[i + 1], tp[i + 2]).applyMatrix4(_m);
      _n.set(tn[i], tn[i + 1], tn[i + 2]).applyMatrix3(_nm);
      const len = Math.hypot(_n.x, _n.y, _n.z) || 1;
      this.pos.push(_p.x, _p.y, _p.z);
      this.nor.push(_n.x / len, _n.y / len, _n.z / len);
      this.col.push(color[0], color[1], color[2]);
      this.emi.push(emissive[0], emissive[1], emissive[2]);
      this.met.push(metal);
      this.alp.push(alpha);
    }
    const nVerts = tp.length / 3;
    for (let k = 0; k < tmpl.index.length; k++) this.idx.push(base + tmpl.index[k]);
    this.v += nVerts;
  }

  mesh(pass: KitPass, name: string): Mesh | null {
    if (!this.v) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('emissive', new BufferAttribute(new Float32Array(this.emi), 3));
    g.setAttribute('metal', new BufferAttribute(new Float32Array(this.met), 1));
    g.setAttribute('alpha', new BufferAttribute(new Float32Array(this.alp), 1));
    g.setIndex(new BufferAttribute(new Uint32Array(this.idx), 1));
    g.computeBoundingSphere();
    const mesh = new Mesh(g, getKitMaterial(pass));
    mesh.name = name;
    mesh.frustumCulled = true;
    if (pass !== 'opaque') {
      mesh.renderOrder = pass === 'add' ? 3 : 2;
    }
    return mesh;
  }
}

/** Build one mesh per pass. Geometry is unique to the caller; material is shared. */
export function buildKitMeshes(items: readonly KitInstance[], name = 'kit'): Mesh[] {
  const buckets: Record<KitPass, Acc> = { opaque: new Acc(), fade: new Acc(), add: new Acc() };
  for (const it of items) {
    const pass: KitPass = it.pass ?? ((it.alpha ?? 1) < 0.98 ? 'fade' : 'opaque');
    _p.set(it.x, it.y, it.z);
    _s.set(it.sx, it.sy, it.sz);
    _q.setFromAxisAngle(_up, it.yaw);
    if (it.pitch) {
      _qPitch.setFromAxisAngle(_x, it.pitch);
      _q.multiply(_qPitch);
    }
    _m.compose(_p, _q, _s);
    _nm.getNormalMatrix(_m);
    buckets[pass].add(getTemplate(it.template), it.color, it.emissive, it.metal, it.alpha ?? 1);
  }
  const out: Mesh[] = [];
  const o = buckets.opaque.mesh('opaque', `${name}-opaque`);
  const f = buckets.fade.mesh('fade', `${name}-fade`);
  const a = buckets.add.mesh('add', `${name}-add`);
  if (o) out.push(o);
  if (f) out.push(f);
  if (a) out.push(a);
  return out;
}
