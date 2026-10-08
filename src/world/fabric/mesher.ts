// Pure module (worker-safe). Turns fabric output into packed vertex arrays for one chunk mesh.
import type { CityLayout } from '../layout';
import type { Box, FabricOutput } from './types';
import { Style } from './types';

export interface ChunkArrays {
  position: Float32Array;
  normal: Float32Array;
  facade: Float32Array;
  bdata: Float32Array;
  index: Uint32Array;
  /** stride SIGN_STRIDE: x,y,z (chunk-relative), yaw, w, h, color, seed, kind */
  signs: Float32Array;
  /** stride BLOCK_STRIDE: cx, cz, ax, az, la, lb, street, districtIndex, seed, ground */
  blocks: Float32Array;
  maxY: number;
  boxCount: number;
}

export const SIGN_STRIDE = 9;
export const BLOCK_STRIDE = 10;

export interface LodRules {
  maxDetail: number;
  minBoxHeight: number;
  minSignArea: number;
  groundCell: number;
  groundLights: boolean;
}

export function lodRules(lod: number): LodRules {
  if (lod <= 0) return { maxDetail: 2, minBoxHeight: 0, minSignArea: 0, groundCell: 25, groundLights: false };
  if (lod === 1) return { maxDetail: 1, minBoxHeight: 0, minSignArea: 12, groundCell: 50, groundLights: false };
  return { maxDetail: 0, minBoxHeight: 22, minSignArea: 150, groundCell: 100, groundLights: true };
}

const SPRAWL_LIGHTS: Record<string, number> = {
  'basin-sprawl': 1,
  'sprawl-dense': 1,
  'megablock-residential': 0.8,
  'street-market': 1,
  'neon-canyon': 1,
  entertainment: 1,
  'coastal-grey': 0.25,
  industrial: 0.35,
  'industrial-dense': 0.5,
  port: 0.4,
  spaceport: 0.3,
  'hills-sparse': 0.15,
};

class Writer {
  pos: number[] = [];
  nor: number[] = [];
  fac: number[] = [];
  bd: number[] = [];
  idx: number[] = [];
  v = 0;
  maxY = 0;

  quad(
    p: number[], // 12 floats, 4 corners CCW seen from outside
    n: [number, number, number],
    f: number[], // 8 floats
    b: [number, number, number, number],
  ): void {
    for (let k = 0; k < 4; k++) {
      this.pos.push(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]);
      if (p[k * 3 + 1] > this.maxY) this.maxY = p[k * 3 + 1];
      this.nor.push(n[0], n[1], n[2]);
      this.fac.push(f[k * 2], f[k * 2 + 1]);
      this.bd.push(b[0], b[1], b[2], b[3]);
    }
    const v = this.v;
    this.idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    this.v += 4;
  }
}

function emitBox(wr: Writer, b: Box, ox: number, oz: number): void {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  const hw = b.w / 2, hd = b.d / 2;
  const y0 = b.y0, y1 = b.y0 + b.h;
  const cx = b.x - ox, cz = b.z - oz;
  // local (lx, lz) -> world offset
  const L = (lx: number, lz: number): [number, number] => [cx + lx * c + lz * s, cz - lx * s + lz * c];
  const p00 = L(-hw, -hd), p10 = L(hw, -hd), p11 = L(hw, hd), p01 = L(-hw, hd);
  const bd: [number, number, number, number] = [b.seed, b.style, b.lit, b.tint];
  const u0 = 100 + b.seed * 1000;
  const h = b.h;
  // +Z face (p01 -> p11)
  let u = u0;
  wr.quad([p01[0], y0, p01[1], p11[0], y0, p11[1], p11[0], y1, p11[1], p01[0], y1, p01[1]], [s, 0, c], [u, 0, u + b.w, 0, u + b.w, h, u, h], bd);
  u += b.w;
  // +X face (p11 -> p10)
  wr.quad([p11[0], y0, p11[1], p10[0], y0, p10[1], p10[0], y1, p10[1], p11[0], y1, p11[1]], [c, 0, -s], [u, 0, u + b.d, 0, u + b.d, h, u, h], bd);
  u += b.d;
  // -Z face (p10 -> p00)
  wr.quad([p10[0], y0, p10[1], p00[0], y0, p00[1], p00[0], y1, p00[1], p10[0], y1, p10[1]], [-s, 0, -c], [u, 0, u + b.w, 0, u + b.w, h, u, h], bd);
  u += b.w;
  // -X face (p00 -> p01)
  wr.quad([p00[0], y0, p00[1], p01[0], y0, p01[1], p01[0], y1, p01[1], p00[0], y1, p00[1]], [-c, 0, s], [u, 0, u + b.d, 0, u + b.d, h, u, h], bd);
  // roof
  wr.quad(
    [p01[0], y1, p01[1], p11[0], y1, p11[1], p10[0], y1, p10[1], p00[0], y1, p00[1]],
    [0, 1, 0],
    [500 - hw, 500 + hd, 500 + hw, 500 + hd, 500 + hw, 500 - hd, 500 - hw, 500 - hd],
    bd,
  );
}

function emitGround(wr: Writer, layout: CityLayout, x0: number, z0: number, size: number, rules: LodRules): void {
  const n = Math.max(1, Math.round(size / rules.groundCell));
  const cs = size / n;
  const H: number[] = new Array((n + 1) * (n + 1));
  let flat = true;
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const h = layout.heightAt(x0 + i * cs, z0 + j * cs);
      H[j * (n + 1) + i] = h;
      if (h > 0.01) flat = false;
    }
  const land: boolean[] = new Array(n * n);
  let allLand = true;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const cx = x0 + (i + 0.5) * cs, cz = z0 + (j + 0.5) * cs;
      const isLand = layout.inBounds(cx, cz, 3000) && !layout.isOcean(cx, cz);
      land[j * n + i] = isLand;
      if (!isLand) allLand = false;
    }
  const lightsFor = (cx: number, cz: number): number =>
    rules.groundLights ? (SPRAWL_LIGHTS[layout.districtAt(cx, cz).archetype] ?? 0.6) : 0;

  if (flat && allLand && !rules.groundLights) {
    wr.quad([0, 0, size, size, 0, size, size, 0, 0, 0, 0, 0], [0, 1, 0], [x0, z0 + size, x0 + size, z0 + size, x0 + size, z0, x0, z0], [0, Style.Ground, 0, 1]);
    return;
  }
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      if (!land[j * n + i]) continue;
      const ax = i * cs, az = j * cs, bx = ax + cs, bz = az + cs;
      const h00 = H[j * (n + 1) + i], h10 = H[j * (n + 1) + i + 1], h01 = H[(j + 1) * (n + 1) + i], h11 = H[(j + 1) * (n + 1) + i + 1];
      // approximate normal from the cell gradient
      const dx = (h10 + h11 - h00 - h01) / (2 * cs);
      const dz = (h01 + h11 - h00 - h10) / (2 * cs);
      const inv = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
      const lit = lightsFor(x0 + ax + cs / 2, z0 + az + cs / 2);
      wr.quad(
        [ax, h01, bz, bx, h11, bz, bx, h10, az, ax, h00, az],
        [-dx * inv, inv, -dz * inv],
        [x0 + ax, z0 + bz, x0 + bx, z0 + bz, x0 + bx, z0 + az, x0 + ax, z0 + az],
        [0, Style.Ground, lit, 1],
      );
    }
}

export function buildChunkArrays(layout: CityLayout, fab: FabricOutput, x0: number, z0: number, size: number, lod: number): ChunkArrays {
  const rules = lodRules(lod);
  const wr = new Writer();
  emitGround(wr, layout, x0, z0, size, rules);
  let boxCount = 0;
  for (const b of fab.boxes) {
    if (b.detail > rules.maxDetail) continue;
    if (b.h + (b.y0 - 0) < rules.minBoxHeight && b.style !== Style.Industrial) continue;
    emitBox(wr, b, x0, z0);
    boxCount++;
  }
  const signs: number[] = [];
  for (const sg of fab.signs) {
    if (sg.w * sg.h < rules.minSignArea) continue;
    signs.push(sg.x - x0, sg.y, sg.z - z0, sg.yaw, sg.w, sg.h, sg.color, sg.seed, sg.kind);
  }
  const blocks: number[] = [];
  for (const b of fab.blocks) blocks.push(b.cx, b.cz, b.ax, b.az, b.la, b.lb, b.street, b.district.index, b.seed, b.ground);
  return {
    blocks: new Float32Array(blocks),
    position: new Float32Array(wr.pos),
    normal: new Float32Array(wr.nor),
    facade: new Float32Array(wr.fac),
    bdata: new Float32Array(wr.bd),
    index: new Uint32Array(wr.idx),
    signs: new Float32Array(signs),
    maxY: wr.maxY,
    boxCount,
  };
}
