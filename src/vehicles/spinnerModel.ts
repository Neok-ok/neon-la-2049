// Original low-poly "spinner" (flying police car) in the angular 2049 pattern language. ~5.0 x 2.3 x 1.45 m.
// Forward = -Z. Origin at the ground contact centre.
import {
  BoxGeometry, BufferGeometry, Color, ExtrudeGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicNodeMaterial,
  MeshStandardNodeMaterial, Shape,
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TSL from 'three/tsl';
import { U } from '../atmosphere/uniforms';

const T = TSL as any;

export const SPINNER_DIMS = { length: 5.0, width: 2.3, height: 1.45 };

function extrudeProfile(pts: number[][], width: number): BufferGeometry {
  const sh = new Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  const g = new ExtrudeGeometry(sh, { depth: width, bevelEnabled: false });
  g.rotateY(Math.PI / 2); // shape X (forward) -> -Z
  g.translate(-width / 2, 0, 0);
  return g;
}

function colored(g: BufferGeometry, c: Color): BufferGeometry {
  const g2 = g.index ? g.toNonIndexed() : g;
  const n = g2.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g2.setAttribute('color', new Float32BufferAttribute(a, 3));
  return g2;
}

let cache: { body: BufferGeometry; glass: BufferGeometry; lights: BufferGeometry } | null = null;

export function spinnerGeometries() {
  if (cache) return cache;
  const L = SPINNER_DIMS.length / 2;
  const hull = extrudeProfile(
    [[-L, 0.32], [L - 0.15, 0.36], [L, 0.55], [L - 0.9, 0.86], [-L + 0.5, 0.95], [-L, 0.8]],
    2.1,
  );
  const cabin = extrudeProfile([[1.25, 0.84], [0.25, 1.43], [-1.25, 1.4], [-1.55, 0.9]], 1.78);
  const podL = new BoxGeometry(0.42, 0.62, 1.7).translate(-1.12, 0.42, 1.25).toNonIndexed();
  const podR = new BoxGeometry(0.42, 0.62, 1.7).translate(1.12, 0.42, 1.25).toNonIndexed();
  const fpodL = new BoxGeometry(0.34, 0.45, 1.1).translate(-1.08, 0.38, -1.55).toNonIndexed();
  const fpodR = new BoxGeometry(0.34, 0.45, 1.1).translate(1.08, 0.38, -1.55).toNonIndexed();
  for (const g of [hull, podL, podR, fpodL, fpodR]) g.deleteAttribute('uv');
  cabin.deleteAttribute('uv');
  const body = mergeGeometries([hull, podL, podR, fpodL, fpodR])!;
  const white = new Color(1.6, 1.5, 1.3), red = new Color(2.2, 0.08, 0.05), blue = new Color(0.15, 0.35, 2.5);
  const lights = mergeGeometries([
    colored(new BoxGeometry(1.7, 0.06, 0.05).translate(0, 0.62, -L - 0.01), white),
    colored(new BoxGeometry(1.9, 0.08, 0.05).translate(0, 0.78, L + 0.01), red),
    colored(new BoxGeometry(0.5, 0.08, 0.18).translate(-0.3, 1.47, -0.2), red),
    colored(new BoxGeometry(0.5, 0.08, 0.18).translate(0.3, 1.47, -0.2), blue),
  ].map((g) => { g.deleteAttribute('uv'); return g; }))!;
  cache = { body, glass: cabin, lights };
  return cache;
}

let mats: { body: MeshStandardNodeMaterial; glass: MeshStandardNodeMaterial; lights: MeshBasicNodeMaterial } | null = null;

export function spinnerMaterials() {
  if (mats) return mats;
  const body = new MeshStandardNodeMaterial({ color: 0x1a1c1f, metalness: 0.7, roughness: 0.32 });
  body.roughnessNode = T.mix(T.float(0.36), T.float(0.12), U.wetness);
  const glass = new MeshStandardNodeMaterial({ color: 0x07090b, metalness: 0.9, roughness: 0.06 });
  const lights = new MeshBasicNodeMaterial({ vertexColors: true });
  // police bar strobes: modulate red/blue channels in alternation
  lights.colorNode = T.Fn(() => {
    const c = T.attribute('color', 'vec3');
    const s = T.step(0.5, T.fract(U.time.mul(2.5)));
    const isBar = T.step(1.5, c.x.add(c.z)).mul(T.step(c.y, 0.5));
    const k = T.mix(T.float(1), T.mix(s, T.float(1).sub(s), T.step(c.z, c.x)), isBar);
    return c.mul(k.mul(0.85).add(0.15));
  })();
  mats = { body, glass, lights };
  return mats;
}

export function createSpinnerMesh(): Group {
  const g = spinnerGeometries();
  const m = spinnerMaterials();
  const grp = new Group();
  grp.name = 'player-spinner';
  grp.add(new Mesh(g.body, m.body), new Mesh(g.glass, m.glass), new Mesh(g.lights, m.lights));
  return grp;
}
