// Shared LOD0 street detail: sodium/LED street lamps along every block edge. Two instanced meshes
// per chunk (poles + glowing heads). Districts can opt out by listing their own lamp module instead.
import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicNodeMaterial, MeshStandardNodeMaterial, Quaternion, Vector3 } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { registerDetail } from '../../world/detail/registry';
import { U } from '../../atmosphere/uniforms';

const T = TSL as any;

const POLE_H = 7.5;
const ARM = 1.6;
const SPACING = 32;
const NO_LAMPS = new Set(['little-tokyo-market', 'lax-spaceport', 'harbor', 'south-bay-refineries', 'civic-center', 'historic-core', 'wallace-vernon', 'coastal-strip', 'south-la-megablocks']);

let poleGeo: BoxGeometry | null = null;
let headGeo: BoxGeometry | null = null;
let poleMat: MeshStandardNodeMaterial | null = null;
let headMat: MeshBasicNodeMaterial | null = null;

function resources() {
  if (!poleGeo) {
    poleGeo = new BoxGeometry(0.22, POLE_H, 0.22);
    poleGeo.translate(0, POLE_H / 2, 0);
    headGeo = new BoxGeometry(0.5, 0.18, 1.1);
    headGeo.translate(0, POLE_H - 0.1, ARM * 0.6);
    poleMat = new MeshStandardNodeMaterial({ color: new Color(0.09, 0.09, 0.1), roughness: 0.55, metalness: 0.7 });
    headMat = new MeshBasicNodeMaterial();
    // warm sodium at night, dim during the day
    headMat.colorNode = T.vec3(1.0, 0.62, 0.28).mul(T.float(0.6).add(U.night.mul(5.0)));
  }
  return { poleGeo: poleGeo!, headGeo: headGeo!, poleMat: poleMat!, headMat: headMat! };
}

const _m = new Matrix4(), _q = new Quaternion(), _p = new Vector3(), _s = new Vector3(1, 1, 1), _up = new Vector3(0, 1, 0);

registerDetail('street-lamps', '*', (ctx) => {
  const pts: Array<[number, number, number, number]> = [];
  for (const b of ctx.blocks) {
    const d = b.districtIndex === 0 ? ctx.layout.defaultDistrict : ctx.layout.districts[b.districtIndex - 1];
    if (NO_LAMPS.has(d.id) || b.street < 9) continue;
    const bx = -b.az, bz = b.ax;
    const curb = Math.min(2.2, b.street * 0.18);
    // lamps on the two long edges (axis A) and the two short edges (axis B), arm pointing into the street
    for (const side of [-1, 1]) {
      const n = Math.max(1, Math.floor(b.la / SPACING));
      for (let k = 0; k < n; k++) {
        const s = -b.la / 2 + ((k + 0.5) * b.la) / n;
        const t = side * (b.lb / 2 + curb);
        const x = b.cx + b.ax * s + bx * t, z = b.cz + b.az * s + bz * t;
        if (x < ctx.x0 || x >= ctx.x0 + ctx.size || z < ctx.z0 || z >= ctx.z0 + ctx.size) continue;
        if (ctx.layout.isReserved(x, z, 1)) continue;
        pts.push([x, b.ground, z, Math.atan2(bx * side, bz * side)]);
      }
      const m = Math.max(1, Math.floor(b.lb / SPACING));
      for (let k = 0; k < m; k++) {
        const t = -b.lb / 2 + ((k + 0.5) * b.lb) / m;
        const s = side * (b.la / 2 + curb);
        const x = b.cx + b.ax * s + bx * t, z = b.cz + b.az * s + bz * t;
        if (x < ctx.x0 || x >= ctx.x0 + ctx.size || z < ctx.z0 || z >= ctx.z0 + ctx.size) continue;
        if (ctx.layout.isReserved(x, z, 1)) continue;
        pts.push([x, b.ground, z, Math.atan2(b.ax * side, b.az * side)]);
      }
    }
  }
  if (!pts.length) return null;
  const r = resources();
  const poles = new InstancedMesh(r.poleGeo, r.poleMat, pts.length);
  const heads = new InstancedMesh(r.headGeo, r.headMat, pts.length);
  pts.forEach(([x, y, z, yaw], i) => {
    _q.setFromAxisAngle(_up, yaw);
    _m.compose(_p.set(x, y, z), _q, _s);
    poles.setMatrixAt(i, _m);
    heads.setMatrixAt(i, _m);
  });
  poles.computeBoundingSphere();
  heads.computeBoundingSphere();
  poles.userData.sharedGeometry = true;
  heads.userData.sharedGeometry = true;
  poles.add(heads);
  return poles;
});
