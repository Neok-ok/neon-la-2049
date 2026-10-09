// Original heavy sky transport (cargo hauler) for the high lanes: ~14 × 5.2 × 3.6 m, forward = −Z,
// origin at the belly centre. Angular wedge cab, slab cargo pod, four ducted lift pods, a spine of nav lights.
// Shares the spinner materials (body / vertex-coloured lights), so a lane adds no new shaders.
import { BoxGeometry, BufferGeometry, Color, ExtrudeGeometry, Float32BufferAttribute, Shape } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TRANSPORT_DIMS = { length: 14, width: 5.2, height: 3.6 };

function extrude(pts: number[][], width: number): BufferGeometry {
  const sh = new Shape();
  sh.moveTo(pts[0]![0]!, pts[0]![1]!);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i]![0]!, pts[i]![1]!);
  const g = new ExtrudeGeometry(sh, { depth: width, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(-width / 2, 0, 0);
  g.deleteAttribute('uv');
  return g.toNonIndexed();
}

function box(w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
  g.deleteAttribute('uv');
  return g;
}

function colored(g: BufferGeometry, c: Color): BufferGeometry {
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(a, 3));
  return g;
}

let cache: { body: BufferGeometry; lights: BufferGeometry } | null = null;

export function transportGeometries(): { body: BufferGeometry; lights: BufferGeometry } {
  if (cache) return cache;
  const L = TRANSPORT_DIMS.length / 2;
  // side profile (x = forward, y = up): low wedge nose rising into the cargo spine
  const cab = extrude([[L, 0.7], [L - 0.6, 1.6], [L - 3.2, 2.9], [L - 4.4, 2.95], [L - 4.4, 0.4], [L - 1.2, 0.35]], 3.4);
  const pod = box(4.4, 2.5, 8.6, 0, 1.75, 1.3);
  const spine = box(1.2, 0.6, 9.8, 0, 3.3, 1.0);
  const keel = box(2.2, 0.5, 11, 0, 0.3, 0.6);
  const ducts: BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const zz of [-3.6, 4.2]) {
      ducts.push(box(1.1, 1.3, 2.6, sx * 2.75, 1.2, zz));
      ducts.push(box(0.5, 0.35, 1.6, sx * 2.25, 1.4, zz));
    }
  }
  const fins = [box(0.25, 1.4, 1.8, 0, 4.1, 5.6), box(3.6, 0.2, 1.0, 0, 3.0, 6.0)];
  const body = mergeGeometries([cab, pod, spine, keel, ...ducts, ...fins])!;
  const white = new Color(1.7, 1.6, 1.4), red = new Color(2.2, 0.06, 0.04), amber = new Color(2.2, 1.0, 0.2), green = new Color(0.1, 2.0, 0.4);
  const lights = mergeGeometries([
    colored(box(2.4, 0.12, 0.06, 0, 0.9, -L - 0.02), white),
    colored(box(3.6, 0.14, 0.06, 0, 1.9, 5.62), red),
    colored(box(0.14, 0.14, 0.14, -3.3, 1.3, -3.6), red),
    colored(box(0.14, 0.14, 0.14, 3.3, 1.3, -3.6), green),
    colored(box(0.3, 0.12, 6.0, -2.21, 2.95, 1.3), amber),
    colored(box(0.3, 0.12, 6.0, 2.21, 2.95, 1.3), amber),
    colored(box(0.3, 0.3, 0.3, 0, 4.85, 5.6), white),
  ])!;
  cache = { body, lights };
  return cache;
}
