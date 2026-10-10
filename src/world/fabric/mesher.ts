// Pure module (worker-safe). Turns fabric output into packed vertex arrays for one chunk mesh.
import type { CityLayout } from '../layout';
import { TRENCH_CUT, TRENCH_LIP, trenchDistance } from '../../vehicles/trenchQuery';
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
  // Dimmer than Westside (1) and just under South LA (0.62), still a carpet above the hills (0.15).
  'basin-sprawl': 0.52,
  'sprawl-dense': 1,
  // Denser amber than the basin (0.52), under Westside and Hollywood (1) and under the belt (0.9).
  'east-la-sprawl': 0.78,
  // Same pair as sprawl-dense. Stage 14 retunes basin-sprawl; leave this key alone.
  'westside-sprawl': 1,
  'megablock-residential': 0.8,
  'lakewood-megablocks': 0.5,
  'south-la-megablocks': 0.62,
  'street-market': 1,
  'little-tokyo-market': 1,
  'neon-canyon': 1,
  'historic-core': 1,
  entertainment: 1,
  // Strip carpet. The old entertainment key is unused. Hills fabric is still hills-sparse.
  'hollywood-strip': 1,
  'coastal-grey': 0.08,
  industrial: 0.35,
  'wallace-vernon': 0,
  'industrial-dense': 0.22,
  // Sodium carpet for the refinery belt. Above the basin (0.52), under Westside (1).
  // The hue stays warmC. The fire points are the flare sprites, not this value.
  'southeast-refinery': 0.9,
  // Sodium carpet for the coast. Under the belt (0.9), above the basin (0.52) and unused industrial (0.35).
  'south-bay-refinery': 0.72,
  // Sodium work-light carpet. Under the South Bay (0.72), above unused `port` (0.4).
  'harbor-port': 0.64,
  // Concrete core. Under the implicit downtown carpet (0.6) and the harbor (0.64), above Lakewood (0.5).
  'long-beach-core': 0.55,
  port: 0.4,
  spaceport: 0.3,
  // Flood carpet for the apron. The old spaceport key is unused. Under the basin (0.52), above industrial (0.35).
  'lax-apron': 0.46,
  'hills-sparse': 0.15,
};

/** How strongly wet streets reflect neon, by archetype (0..1). */
const STREET_NEON: Record<string, number> = {
  'street-market': 1,
  'little-tokyo-market': 1,
  'neon-canyon': 1,
  'historic-core': 1,
  entertainment: 1,
  // Wet violet. Under the canyon (1), above the basin (0.16). Fades by ~520 m, so a 1 km aerial is the carpet.
  'hollywood-strip': 0.86,
  'megablock-market': 0.8,
  'megablock-downtown': 0.72,
  // Wet sodium and neon. Under downtown (0.72), above the basin (0.16) and Lakewood (0.08).
  'long-beach-core': 0.28,
  'financial-megatowers': 0.55,
  'megatower-core': 0.5,
  'sprawl-dense': 0.35,
  // Wet amber above the basin (0.16), a step above Westside (0.35), well under Hollywood (0.86).
  'east-la-sprawl': 0.38,
  // Copies sprawl-dense so the amber carpet does not change. Stage 14 owns basin-sprawl.
  'westside-sprawl': 0.35,
  // Faint amber sheen: under Westside 0.35, a small step above South LA 0.10. Fades by ~520 m.
  'basin-sprawl': 0.16,
  'megablock-residential': 0.3,
  'lakewood-megablocks': 0.08,
  'south-la-megablocks': 0.1,
  civic: 0.2,
  'coastal-grey': 0.04,
  industrial: 0.1,
  // No market-neon carpet. Rain in the precinct stays a dark amber haze.
  'wallace-vernon': 0,
  'industrial-dense': 0.1,
  // A little wet amber. Under Westside 0.35. Fades by ~520 m, so a 1 km aerial is the carpet.
  'southeast-refinery': 0.18,
  // Wet amber under the belt (0.18) and above unused industrial (0.1). Fades by ~520 m.
  'south-bay-refinery': 0.12,
  // Wet sodium under the South Bay (0.12) and above unused `port` (0.1).
  'harbor-port': 0.11,
  port: 0.1,
  spaceport: 0.15,
  // Sparse wayfinding. Under industrial (0.1). Fades by ~520 m, so a 1 km aerial is the carpet.
  'lax-apron': 0.08,
  'hills-sparse': 0.05,
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

function chunkHitsTrench(layout: CityLayout, x0: number, z0: number, size: number): boolean {
  const pad = TRENCH_LIP + size * 0.25;
  for (let j = 0; j <= 4; j++) {
    for (let i = 0; i <= 4; i++) {
      if (trenchDistance(layout, x0 + (i / 4) * size, z0 + (j / 4) * size) < pad) return true;
    }
  }
  return false;
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
  // ground tint channel carries 1 + neon reflection strength (read by the city material)
  const neonFor = (cx: number, cz: number): number => 1 + (STREET_NEON[layout.districtAt(cx, cz).archetype] ?? 0.2);
  const cut = chunkHitsTrench(layout, x0, z0, size);

  if (flat && allLand && !rules.groundLights && !cut) {
    wr.quad([0, 0, size, size, 0, size, size, 0, 0, 0, 0, 0], [0, 1, 0], [x0, z0 + size, x0 + size, z0 + size, x0 + size, z0, x0, z0], [0, Style.Ground, 0, neonFor(x0 + size / 2, z0 + size / 2)]);
    return;
  }

  const emitCell = (ax: number, az: number, bx: number, bz: number, h00: number, h10: number, h01: number, h11: number): void => {
    const span = Math.max(bx - ax, bz - az);
    const cx = x0 + (ax + bx) / 2;
    const cz = z0 + (az + bz) / 2;
    const dist = cut ? trenchDistance(layout, cx, cz) : Infinity;
    if (cut && span > 28 && dist < TRENCH_LIP + span * 0.5) {
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const hM0 = layout.heightAt(x0 + mx, z0 + az);
      const h0M = layout.heightAt(x0 + ax, z0 + mz);
      const hMM = layout.heightAt(x0 + mx, z0 + mz);
      const h1M = layout.heightAt(x0 + bx, z0 + mz);
      const hM1 = layout.heightAt(x0 + mx, z0 + bz);
      emitCell(ax, az, mx, mz, h00, hM0, h0M, hMM);
      emitCell(mx, az, bx, mz, hM0, h10, hMM, h1M);
      emitCell(ax, mz, mx, bz, h0M, hMM, h01, hM1);
      emitCell(mx, mz, bx, bz, hMM, h1M, hM1, h11);
      return;
    }
    if (dist < TRENCH_CUT) return;
    const dx = (h10 + h11 - h00 - h01) / (2 * span || 1);
    const dz = (h01 + h11 - h00 - h10) / (2 * span || 1);
    const inv = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
    const lit = lightsFor(cx, cz);
    wr.quad(
      [ax, h01, bz, bx, h11, bz, bx, h10, az, ax, h00, az],
      [-dx * inv, inv, -dz * inv],
      [x0 + ax, z0 + bz, x0 + bx, z0 + bz, x0 + bx, z0 + az, x0 + ax, z0 + az],
      [0, Style.Ground, lit, neonFor(cx, cz)],
    );
  };

  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      if (!land[j * n + i]) continue;
      const ax = i * cs, az = j * cs, bx = ax + cs, bz = az + cs;
      const h00 = H[j * (n + 1) + i]!;
      const h10 = H[j * (n + 1) + i + 1]!;
      const h01 = H[(j + 1) * (n + 1) + i]!;
      const h11 = H[(j + 1) * (n + 1) + i + 1]!;
      emitCell(ax, az, bx, bz, h00, h10, h01, h11);
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
