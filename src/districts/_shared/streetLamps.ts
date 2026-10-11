// Shared LOD0 street detail: sodium/LED street lamps along every block edge. Two instanced meshes
// per chunk (poles + glowing heads). Districts can opt out by listing their own lamp module instead.
import { BoxGeometry, Color, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicNodeMaterial, MeshStandardNodeMaterial, Quaternion, Vector3 } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { registerDetail } from '../../world/detail/registry';
import { U } from '../../atmosphere/uniforms';
import { pastSeaWall } from '../coastal-strip/profile';
import { NITS, LED_RGB, SODIUM_RGB } from '../../lighting/presets.ts';
import { retainChunk } from '../../lighting/registry.ts';
import { practicalLit } from '../../lighting/shade.ts';
import { resources as gpu } from '../../core/memory/resources';

const T = TSL as any;

const POLE_H = 7.5;
const ARM = 1.6;
const SPACING = 32;
const NO_LAMPS = new Set(['little-tokyo-market', 'lax-spaceport', 'harbor', 'south-bay-refineries', 'civic-center', 'historic-core', 'wallace-vernon', 'coastal-strip', 'south-la-megablocks', 'hollywood']);

let poleGeo: BoxGeometry | null = null;
let headGeo: BoxGeometry | null = null;
let poleMat: MeshStandardNodeMaterial | null = null;
let headMat: MeshBasicNodeMaterial | null = null;

function lampMeshes() {
  if (!poleGeo) {
    poleGeo = gpu.sharedGeometry('street-lamp-pole', () => {
      const geo = new BoxGeometry(0.22, POLE_H, 0.22);
      geo.translate(0, POLE_H / 2, 0);
      return geo;
    });
    headGeo = gpu.sharedGeometry('street-lamp-head', () => {
      const geo = new BoxGeometry(0.5, 0.18, 1.1);
      geo.translate(0, POLE_H - 0.1, ARM * 0.6);
      return geo;
    });
    poleMat = gpu.material('street-lamp-pole', () => {
      const mat = new MeshStandardNodeMaterial({ color: new Color(0.09, 0.09, 0.1), roughness: 0.55, metalness: 0.7 });
      mat.emissiveNode = practicalLit(
        T.positionWorld, T.normalWorld, T.normalize(T.cameraPosition.sub(T.positionWorld)), T.vec3(0.09, 0.09, 0.1),
      );
      return mat;
    });
    headMat = gpu.material('street-lamp-head', () => {
      const mat = new MeshBasicNodeMaterial();
      mat.colorNode = T.instanceColor.mul(NITS.lampHead).mul(T.float(0.18).add(U.night.mul(0.82)));
      return mat;
    });
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
        if (ctx.layout.isReserved(x, z, 1) || ctx.layout.isOcean(x, z) || pastSeaWall(ctx.layout, x, z)) continue;
        pts.push([x, b.ground, z, Math.atan2(bx * side, bz * side)]);
      }
      const m = Math.max(1, Math.floor(b.lb / SPACING));
      for (let k = 0; k < m; k++) {
        const t = -b.lb / 2 + ((k + 0.5) * b.lb) / m;
        const s = side * (b.la / 2 + curb);
        const x = b.cx + b.ax * s + bx * t, z = b.cz + b.az * s + bz * t;
        if (x < ctx.x0 || x >= ctx.x0 + ctx.size || z < ctx.z0 || z >= ctx.z0 + ctx.size) continue;
        if (ctx.layout.isReserved(x, z, 1) || ctx.layout.isOcean(x, z) || pastSeaWall(ctx.layout, x, z)) continue;
        pts.push([x, b.ground, z, Math.atan2(b.ax * side, b.az * side)]);
      }
    }
  }
  if (!pts.length) return null;
  const r = lampMeshes();
  const poles = new InstancedMesh(r.poleGeo, r.poleMat, pts.length);
  const heads = new InstancedMesh(r.headGeo, r.headMat, pts.length);
  pts.forEach(([x, y, z, yaw], i) => {
    _q.setFromAxisAngle(_up, yaw);
    _m.compose(_p.set(x, y, z), _q, _s);
    poles.setMatrixAt(i, _m);
    heads.setMatrixAt(i, _m);
  });
  const rgb = new Float32Array(pts.length * 3);
  const lights: Array<{ preset: 'street-sodium' | 'street-led'; x: number; y: number; z: number; dx: number; dy: number; dz: number }> = [];
  pts.forEach(([x, y, z], i) => {
    const led = Math.abs(Math.sin(x * 0.17 + z)) * 100 % 7 < 1;
    const chroma = led ? LED_RGB : SODIUM_RGB;
    rgb[i * 3] = chroma[0];
    rgb[i * 3 + 1] = chroma[1];
    rgb[i * 3 + 2] = chroma[2];
    lights.push({ preset: led ? 'street-led' : 'street-sodium', x, y: y + 7.4, z, dx: 0, dy: -1, dz: 0 });
  });
  heads.instanceColor = new InstancedBufferAttribute(rgb, 3);
  poles.computeBoundingSphere();
  heads.computeBoundingSphere();
  poles.userData.sharedGeometry = true;
  heads.userData.sharedGeometry = true;
  poles.userData.releaseLights = retainChunk(`${ctx.x0}:${ctx.z0}`, lights);
  poles.add(heads);
  return poles;
});
