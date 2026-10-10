// Static decks, connector ribbons, columns and lamp rows where the 5 and the 710
// cross the sunk 10. Not a traffic edge. Not a ramp on the graph.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh,
  MeshBasicNodeMaterial, MeshStandardNodeMaterial,
} from 'three/webgpu';
import * as TSL from 'three/tsl';
import type { CityLayout } from '../../world/layout';
import { U } from '../../atmosphere/uniforms';
import { freewayRoutes } from '../../vehicles/trafficRegistry';
import { eastLaCrossings, type Crossing } from './crossings';
import { DECK_LENGTH, DECK_THICK, DECK_TOP, DECK_WIDTH, RAMP_RADIUS } from './spec';

const T = TSL as any;

const CONCRETE: [number, number, number] = [0.11, 0.11, 0.12];
const BARRIER: [number, number, number] = [0.16, 0.15, 0.13];
const COLUMN: [number, number, number] = [0.09, 0.09, 0.1];

function concreteMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();
  m.name = 'east-la-deck';
  m.side = DoubleSide;
  const col = T.attribute('color', 'vec3');
  m.colorNode = col.mul(T.mix(T.float(1), T.float(0.62), U.wetness));
  m.roughnessNode = T.mix(T.float(0.86), T.float(0.28), U.wetness);
  m.metalness = 0.05;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -2;
  return m;
}

function glowMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial();
  m.name = 'east-la-deck-glow';
  m.transparent = true;
  m.depthWrite = false;
  m.blending = AdditiveBlending;
  m.side = DoubleSide;
  m.fog = false;
  m.toneMapped = false;
  const col = T.attribute('color', 'vec3');
  const dist = T.length(T.positionWorld.sub(T.cameraPosition));
  const fog = T.exp(dist.mul(U.fogDensity).mul(T.float(0.85)).negate());
  const night = T.mix(T.float(0.35), T.float(1.4), U.night);
  m.colorNode = col.mul(fog).mul(night);
  return m;
}

class Ribbon {
  readonly p: number[] = [];
  readonly n: number[] = [];
  readonly c: number[] = [];
  readonly idx: number[] = [];
  private v = 0;

  quad(a: number[], b: number[], c: number[], d: number[], rgb: [number, number, number]): void {
    const ax = b[0]! - a[0]!, ay = b[1]! - a[1]!, az = b[2]! - a[2]!;
    const bx = c[0]! - a[0]!, by = c[1]! - a[1]!, bz = c[2]! - a[2]!;
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const base = this.v;
    for (const p of [a, b, c, d]) {
      this.p.push(p[0]!, p[1]!, p[2]!);
      this.n.push(nx, ny, nz);
      this.c.push(rgb[0], rgb[1], rgb[2]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.v += 4;
  }

  mesh(material: MeshStandardNodeMaterial | MeshBasicNodeMaterial, name: string): Mesh | null {
    if (!this.p.length) return null;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(this.p), 3));
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(this.n), 3));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(this.c), 3));
    geo.setIndex(new BufferAttribute(new Uint32Array(this.idx), 1));
    geo.computeBoundingSphere();
    const mesh = new Mesh(geo, material);
    mesh.name = name;
    mesh.frustumCulled = true;
    return mesh;
  }
}

function corner(x: number, y: number, z: number, yaw: number, lx: number, ly: number, lz: number): number[] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
}

function addBox(
  ribbon: Ribbon,
  x: number, y: number, z: number,
  hx: number, hy: number, hz: number,
  yaw: number,
  rgb: [number, number, number],
): void {
  const p = (lx: number, ly: number, lz: number) => corner(x, y, z, yaw, lx, ly, lz);
  const x0 = -hx, x1 = hx, y0 = -hy, y1 = hy, z0 = -hz, z1 = hz;
  ribbon.quad(p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1), rgb);
  ribbon.quad(p(x1, y0, z0), p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0), rgb);
  ribbon.quad(p(x0, y1, z0), p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0), rgb);
  ribbon.quad(p(x0, y0, z1), p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), rgb);
  ribbon.quad(p(x1, y0, z1), p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), rgb);
  ribbon.quad(p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0), rgb);
}

function yawOf(fx: number, fz: number): number {
  return Math.atan2(fx, fz);
}

function i10Depth(): number {
  return freewayRoutes().find((f) => f.id === 'I-10')?.depth ?? 7.5;
}

function arcPoints(
  p0: { x: number; z: number },
  p1: { x: number; z: number },
  radius: number,
  bend: number,
  n: number,
): Array<{ x: number; z: number }> {
  const mx = (p0.x + p1.x) / 2;
  const mz = (p0.z + p1.z) / 2;
  const dx = p1.x - p0.x;
  const dz = p1.z - p0.z;
  const L = Math.hypot(dx, dz) || 1;
  if (L > radius * 1.9) {
    const out: Array<{ x: number; z: number }> = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      out.push({ x: p0.x + dx * k, z: p0.z + dz * k });
    }
    return out;
  }
  const h = Math.sqrt(Math.max(0, radius * radius - (L / 2) * (L / 2)));
  const px = -dz / L;
  const pz = dx / L;
  const cx = mx + px * h * bend;
  const cz = mz + pz * h * bend;
  const a0 = Math.atan2(p0.z - cz, p0.x - cx);
  let d = Math.atan2(p1.z - cz, p1.x - cx) - a0;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const out: Array<{ x: number; z: number }> = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + d * (i / n);
    out.push({ x: cx + Math.cos(a) * radius, z: cz + Math.sin(a) * radius });
  }
  return out;
}

function addCrossing(
  layout: CityLayout,
  c: Crossing,
  depth: number,
  concrete: Ribbon,
  glow: Ribbon,
): void {
  const grade = layout.heightAt(c.x, c.z);
  const top = grade + DECK_TOP;
  const yaw = yawOf(c.tx, c.tz);
  const slabY = top - DECK_THICK / 2;
  addBox(concrete, c.x, slabY, c.z, DECK_WIDTH / 2, DECK_THICK / 2, DECK_LENGTH / 2, yaw, CONCRETE);
  addBox(concrete, c.x + c.rx * (DECK_WIDTH / 2 - 0.45), top + 0.28, c.z + c.rz * (DECK_WIDTH / 2 - 0.45), 0.28, 0.28, DECK_LENGTH / 2, yaw, BARRIER);
  addBox(concrete, c.x - c.rx * (DECK_WIDTH / 2 - 0.45), top + 0.28, c.z - c.rz * (DECK_WIDTH / 2 - 0.45), 0.28, 0.28, DECK_LENGTH / 2, yaw, BARRIER);
  addBox(concrete, c.x, top + 0.32, c.z, 0.22, 0.32, DECK_LENGTH / 2 - 2, yaw, BARRIER);

  const half = DECK_LENGTH / 2;
  for (let u = -half + 8; u <= half - 8; u += 16) {
    const x = c.x + c.tx * u;
    const z = c.z + c.tz * u;
    const dist = Math.abs((x - c.x) * c.vx + (z - c.z) * c.vz);
    if (dist > 30) continue;
    const base = grade - depth;
    const hy = (top - DECK_THICK - base) / 2;
    if (hy < 0.4) continue;
    addBox(concrete, x, base + hy, z, 0.55, hy, 0.55, yaw, COLUMN);
  }

  for (let u = -half + 6; u <= half - 6; u += 18) {
    for (const side of [-1, 1]) {
      const x = c.x + c.tx * u + c.rx * side * (DECK_WIDTH / 2 - 0.7);
      const z = c.z + c.tz * u + c.rz * side * (DECK_WIDTH / 2 - 0.7);
      addBox(glow, x, top + 2.3, z, 0.12, 2.2, 0.12, yaw, [1.15, 0.48, 0.12]);
      addBox(glow, x, top + 4.55, z, 0.42, 0.1, 0.28, yaw, [1.7, 0.72, 0.18]);
    }
  }
  for (let u = -half + 10; u <= half - 10; u += 22) {
    for (const side of [-1, 1]) {
      const x = c.x + c.tx * u + c.rx * side * 3.1;
      const z = c.z + c.tz * u + c.rz * side * 3.1;
      addBox(glow, x, top + 0.08, z, 0.35, 0.04, 4.2, yaw, [1.45, 0.95, 0.55]);
    }
  }

  for (const along of [-1, 1] as const) {
    for (const side of [-1, 1] as const) {
      const p0 = {
        x: c.x + c.tx * along * 16 + c.rx * side * 5,
        z: c.z + c.tz * along * 16 + c.rz * side * 5,
      };
      const s10 = Math.sign(along * (c.tx * c.ux + c.tz * c.uz)) || along;
      const sLat = Math.sign(side * (c.rx * c.vx + c.rz * c.vz)) || side;
      const p1 = {
        x: c.x + c.ux * s10 * 18 + c.vx * sLat * 7,
        z: c.z + c.uz * s10 * 18 + c.vz * sLat * 7,
      };
      const mx = (p0.x + p1.x) / 2;
      const mz = (p0.z + p1.z) / 2;
      const dx = p1.x - p0.x;
      const dz = p1.z - p0.z;
      const L = Math.hypot(dx, dz) || 1;
      const px = -dz / L;
      const pz = dx / L;
      const toC = (c.x - mx) * px + (c.z - mz) * pz;
      const bend = toC >= 0 ? -1 : 1;
      const pts = arcPoints(p0, p1, RAMP_RADIUS, bend, 7);
      const y0 = top;
      const y1 = grade - depth + 0.35;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        const fx = b.x - a.x;
        const fz = b.z - a.z;
        const span = Math.hypot(fx, fz) || 1;
        const k = (i + 0.5) / (pts.length - 1);
        const y = y0 + (y1 - y0) * k;
        addBox(
          concrete,
          (a.x + b.x) / 2, y - 0.16, (a.z + b.z) / 2,
          3.1, 0.16, span * 0.56,
          yawOf(fx, fz),
          CONCRETE,
        );
      }
      addBox(glow, p0.x, y0 + 2.1, p0.z, 0.1, 2.0, 0.1, yaw, [1.15, 0.48, 0.12]);
      addBox(glow, p0.x, y0 + 4.15, p0.z, 0.36, 0.08, 0.22, yaw, [1.7, 0.72, 0.18]);
    }
  }
}

/** One group for both junctions. Null when neither crossing sits in East LA. */
export function mountEastLaInterchanges(layout: CityLayout): Group | null {
  const list = eastLaCrossings(layout);
  if (!list.length) return null;
  const depth = i10Depth();
  const concrete = new Ribbon();
  const glow = new Ribbon();
  for (const c of list) addCrossing(layout, c, depth, concrete, glow);
  const group = new Group();
  group.name = 'east-la-interchange';
  const deck = concrete.mesh(concreteMaterial(), 'east-la-deck');
  const lamps = glow.mesh(glowMaterial(), 'east-la-deck-glow');
  if (deck) group.add(deck);
  if (lamps) {
    lamps.renderOrder = 2;
    group.add(lamps);
  }
  return group;
}
