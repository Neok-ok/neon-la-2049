import { InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, Vector3 } from 'three/webgpu';
import { getSignMaterial } from './signMaterial';
import type { Sign } from '../fabric/types';

const plane = new PlaneGeometry(1, 1);
const _m = new Matrix4(), _q = new Quaternion(), _p = new Vector3(), _s = new Vector3(), _up = new Vector3(0, 1, 0);

/** Instanced neon signs / hologram panels. Positions are used as given (caller decides world/local). */
export function makeSignMesh(signs: Sign[]): InstancedMesh {
  const n = signs.length;
  const geo = plane.clone();
  const iSign = new Float32Array(n * 4);
  const iKind = new Float32Array(n);
  const mesh = new InstancedMesh(geo, getSignMaterial(), n);
  signs.forEach((s, i) => {
    _p.set(s.x, s.y, s.z);
    _q.setFromAxisAngle(_up, s.yaw);
    _s.set(s.w, s.h, 1);
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    iSign.set([s.w, s.h, s.color, s.seed], i * 4);
    iKind[i] = s.kind;
  });
  geo.setAttribute('iSign', new InstancedBufferAttribute(iSign, 4));
  geo.setAttribute('iKind', new InstancedBufferAttribute(iKind, 1));
  mesh.computeBoundingSphere();
  mesh.name = 'signs';
  return mesh;
}
