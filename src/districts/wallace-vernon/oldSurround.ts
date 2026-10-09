// Immediate surroundings of the two dormant pyramids. They sit in the refinery belt,
// east of the Wallace polygon. This does not rename them, and it does not touch the
// shared industrial archetype. No Tyrell name, no logo, no lettering.
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three/webgpu';
import { Rng, hashString } from '../../core/rng';
import { registerDetail } from '../../world/detail/registry';
import { GeoWriter, type FaceStyle } from '../../world/landmarks/GeoWriter';
import { getCityMaterial } from '../../world/materials/cityMaterial';
import { Style } from '../../world/fabric/types';
import { makeCross } from '../_shared/kit/templates';
import { getSteamMaterial } from '../_shared/kit/materials';

const TANK: FaceStyle = { style: Style.Solid, lit: 0.02, tint: 0.42, seed: 0.19 };
const PIPE: FaceStyle = { style: Style.Solid, lit: 0, tint: 0.34, seed: 0.27 };
const WALL: FaceStyle = { style: Style.Monolith, lit: 0.03, tint: 0.5, seed: 0.33 };
const STRIPE: FaceStyle = { style: Style.Glow, lit: 0.55, tint: 1.15, seed: 0.61 };

interface Puff { x: number; y: number; z: number; seed: number }

let steamGeo: BufferGeometry | null = null;
function getSteamGeo(): BufferGeometry {
  if (steamGeo) return steamGeo;
  const t = makeCross();
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(t.position, 3));
  g.setAttribute('normal', new BufferAttribute(t.normal, 3));
  steamGeo = g;
  return g;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();

function steamMesh(pts: Puff[]): InstancedMesh {
  const geo = getSteamGeo().clone();
  const attr = new Float32Array(pts.length * 4);
  const mesh = new InstancedMesh(geo, getSteamMaterial(), pts.length);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    mesh.setMatrixAt(i, _m.compose(_p.set(p.x, p.y, p.z), _q.identity(), _s.set(1.6, 2.8, 1.6)));
    attr.set([p.seed, 0, 0, 0], i * 4);
  }
  geo.setAttribute('iSteam', new InstancedBufferAttribute(attr, 4));
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.name = 'old-pyramid-steam';
  return mesh;
}

registerDetail('old-pyramid-surround', ['southeast-industrial'], (ctx) => {
  const layout = ctx.layout;
  const x1 = ctx.x0 + ctx.size;
  const z1 = ctx.z0 + ctx.size;
  const inside = (x: number, z: number) => x >= ctx.x0 && x < x1 && z >= ctx.z0 && z < z1;
  const w = new GeoWriter();
  const puffs: Puff[] = [];
  let n = 0;
  for (const id of ['old-pyramid-north', 'old-pyramid-south'] as const) {
    const lm = layout.landmarkById(id);
    if (!lm) continue;
    const rng = new Rng(hashString(id + ':ring'));
    const gnd = layout.heightAt(lm.x, lm.z);
    const inner = lm.reserveRadius + 18;
    const outer = lm.reserveRadius + 168;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + rng.range(-0.04, 0.04);
      const dist = rng.range(inner, outer);
      const x = lm.x + Math.cos(a) * dist;
      const z = lm.z + Math.sin(a) * dist;
      if (!inside(x, z)) continue;
      if (layout.isReserved(x, z, 8)) continue;
      if (layout.districtAt(x, z).id !== 'southeast-industrial') continue;
      if (layout.isOcean(x, z)) continue;
      const y = gnd;
      const kind = i % 5;
      if (kind === 0 || kind === 1) {
        const dia = rng.range(11, 18);
        const h = rng.range(8, 16);
        w.box(x, z, y, dia, dia, h, a, TANK);
        w.box(x, z, y + h, dia + 1.1, dia + 1.1, 0.7, a, WALL);
        n++;
      } else if (kind === 2) {
        const len = rng.range(16, 28);
        const h = rng.range(6.5, 9);
        w.box(x, z, y, 0.7, 0.7, h, a, PIPE);
        w.box(x + Math.cos(a) * 6, z + Math.sin(a) * 6, y, 0.7, 0.7, h, a, PIPE);
        w.box(x + Math.cos(a) * 3, z + Math.sin(a) * 3, y + h, len, 0.8, 0.6, a, PIPE);
        n++;
      } else if (kind === 3) {
        const h = rng.range(22, 36);
        w.box(x, z, y, 3.2, 3.2, h, 0, PIPE);
        puffs.push({ x, y: y + h, z, seed: rng.next() });
        n++;
      } else {
        const len = 14;
        w.box(x, z, y, 0.8, len, 3.4, a, WALL);
        w.box(x, z, y + 1.1, 0.2, 2.2, 0.7, a, STRIPE);
        n++;
      }
    }
  }
  if (!n && !puffs.length) return null;
  const g = new Group();
  g.name = 'old-pyramid-surround';
  if (n) {
    const mesh = new Mesh(w.build(), getCityMaterial());
    mesh.name = 'old-pyramid-ring';
    g.add(mesh);
  }
  if (puffs.length && ctx.quality.tier !== 'low') g.add(steamMesh(puffs));
  return g;
});
