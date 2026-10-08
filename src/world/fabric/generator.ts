// Pure module (worker-safe). Deterministic city fabric: walks each district's street grid and
// hands every block owned by the requested rectangle to that district's archetype function.
import { Rng, hash2i } from '../../core/rng';
import { bearingToDir } from '../geo';
import type { CityLayout, District } from '../layout';
import { getArchetype } from './registry';
import type { BlockInfo, Box, FabricCtx, FabricOutput, LotRect, Sign, BoxOpts, FaceDir, SignKind } from './types';
import '../../districts/fabric-index';

const HILL_ARCHETYPE_THRESHOLD = 45;

function splitLots(rng: Rng, s: number, t: number, la: number, lb: number, minLot: number, maxLot: number, out: LotRect[], depth = 0): void {
  const big = Math.max(la, lb);
  if (depth > 10 || big <= maxLot || (big < maxLot * 1.6 && rng.chance(0.35))) {
    out.push({ s, t, la, lb });
    return;
  }
  const r = rng.range(0.35, 0.65);
  if (la >= lb) {
    const a1 = la * r;
    if (a1 < minLot || la - a1 < minLot) return void out.push({ s, t, la, lb });
    splitLots(rng, s - la / 2 + a1 / 2, t, a1, lb, minLot, maxLot, out, depth + 1);
    splitLots(rng, s + a1 / 2, t, la - a1, lb, minLot, maxLot, out, depth + 1);
  } else {
    const b1 = lb * r;
    if (b1 < minLot || lb - b1 < minLot) return void out.push({ s, t, la, lb });
    splitLots(rng, s, t - lb / 2 + b1 / 2, la, b1, minLot, maxLot, out, depth + 1);
    splitLots(rng, s, t + b1 / 2, la, lb - b1, minLot, maxLot, out, depth + 1);
  }
}

class Ctx implements FabricCtx {
  rng: Rng;
  private boxSeq = 0;
  constructor(
    readonly layout: CityLayout,
    readonly block: BlockInfo,
    private boxes: Box[],
    private signs: Sign[],
  ) {
    this.rng = new Rng(block.seed);
  }

  toWorld(s: number, t: number): [number, number] {
    const b = this.block;
    return [b.cx + b.ax * s + b.bx * t, b.cz + b.az * s + b.bz * t];
  }

  lots(minLot: number, maxLot: number, gap: number): LotRect[] {
    const out: LotRect[] = [];
    splitLots(this.rng, 0, 0, this.block.la, this.block.lb, minLot, maxLot, out);
    if (gap > 0) for (const l of out) { l.la = Math.max(2, l.la - gap); l.lb = Math.max(2, l.lb - gap); }
    return out;
  }

  box(s: number, t: number, lb: number, la: number, h: number, o: BoxOpts): Box | null {
    const [x, z] = this.toWorld(s, t);
    const r = Math.max(la, lb) * 0.5;
    if (this.layout.isReserved(x, z, r * 0.8)) return null;
    if (this.layout.isOcean(x, z)) return null;
    const seq = this.boxSeq++;
    const b: Box = {
      x, z,
      w: lb,
      d: la,
      h,
      yaw: this.block.yaw,
      y0: this.block.ground + (o.base ?? 0),
      style: o.style,
      seed: hash2i(this.block.seed, seq, 77) / 4294967296,
      detail: o.detail ?? 0,
      lit: o.lit ?? 0.35,
      tint: o.tint ?? 1,
    };
    // On slopes, sink grounded boxes so they never float above the terrain.
    if (!o.base && this.block.ground > 0.5) {
      b.y0 -= 8;
      b.h += 8;
    }
    this.boxes.push(b);
    return b;
  }

  sign(s: number, t: number, hb: number, ha: number, face: FaceDir, along: number, y: number, w: number, h: number, color: number, kind: SignKind): void {
    const bl = this.block;
    // outward normal in block space
    let ns = 0, nt = 0, ps = s, pt = t;
    if (face === 'a+') { ns = 1; ps = s + ha; pt = t + along; }
    else if (face === 'a-') { ns = -1; ps = s - ha; pt = t + along; }
    else if (face === 'b+') { nt = 1; pt = t + hb; ps = s + along; }
    else { nt = -1; pt = t - hb; ps = s + along; }
    const out = kind === 1 ? w * 0.5 + 0.4 : 0.35;
    ps += ns * out;
    pt += nt * out;
    const [x, z] = this.toWorld(ps, pt);
    if (this.layout.isReserved(x, z, 1)) return;
    const nx = bl.ax * ns + bl.bx * nt;
    const nz = bl.az * ns + bl.bz * nt;
    // blade signs are perpendicular to the facade (visible down the street)
    const yaw = kind === 1 ? Math.atan2(nx, nz) + Math.PI / 2 : Math.atan2(nx, nz);
    this.signs.push({ x, y: bl.ground + y, z, yaw, w, h, color, seed: this.rng.next(), kind });
  }
}

function makeBlock(layout: CityLayout, d: District, i: number, j: number, cx: number, cz: number): BlockInfo {
  const [ax, az] = bearingToDir(d.grid.bearingDeg);
  const [bx, bz] = bearingToDir(d.grid.bearingDeg + 90);
  const ground = layout.heightAt(cx, cz);
  const arch = ground > HILL_ARCHETYPE_THRESHOLD ? 'hills-sparse' : d.archetype;
  return {
    district: d,
    archetype: arch,
    i, j, cx, cz, ax, az, bx, bz,
    la: d.grid.block[0] - d.grid.street,
    lb: d.grid.block[1] - d.grid.street,
    street: d.grid.street,
    yaw: Math.PI - (d.grid.bearingDeg * Math.PI) / 180,
    seed: hash2i(i + 100000, j + 100000, d.index * 7919 + 13),
    ground,
  };
}

/** Enumerate blocks whose center lies inside [x0, x0+size) x [z0, z0+size). */
export function enumerateBlocks(layout: CityLayout, x0: number, z0: number, size: number): BlockInfo[] {
  const x1 = x0 + size, z1 = z0 + size;
  const out: BlockInfo[] = [];
  const pad = 400;
  for (const d of layout.districtsOverlapping(x0 - pad, z0 - pad, x1 + pad, z1 + pad)) {
    const [ax, az] = bearingToDir(d.grid.bearingDeg);
    const [bx, bz] = bearingToDir(d.grid.bearingDeg + 90);
    const B0 = d.grid.block[0], B1 = d.grid.block[1];
    let smin = Infinity, smax = -Infinity, tmin = Infinity, tmax = -Infinity;
    for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
      const s = (px * ax + pz * az) / B0, t = (px * bx + pz * bz) / B1;
      smin = Math.min(smin, s); smax = Math.max(smax, s);
      tmin = Math.min(tmin, t); tmax = Math.max(tmax, t);
    }
    for (let i = Math.floor(smin) - 1; i <= Math.ceil(smax); i++) {
      for (let j = Math.floor(tmin) - 1; j <= Math.ceil(tmax); j++) {
        const cs = (i + 0.5) * B0, ct = (j + 0.5) * B1;
        const cx = ax * cs + bx * ct, cz = az * cs + bz * ct;
        if (cx < x0 || cx >= x1 || cz < z0 || cz >= z1) continue;
        if (!layout.inBounds(cx, cz)) continue;
        if (layout.districtAt(cx, cz) !== d) continue;
        if (layout.isOcean(cx, cz)) continue;
        out.push(makeBlock(layout, d, i, j, cx, cz));
      }
    }
  }
  return out;
}

export function generateFabric(layout: CityLayout, x0: number, z0: number, size: number): FabricOutput {
  const blocks = enumerateBlocks(layout, x0, z0, size);
  const boxes: Box[] = [];
  const signs: Sign[] = [];
  for (const b of blocks) {
    const fn = getArchetype(b.archetype);
    fn(new Ctx(layout, b, boxes, signs));
  }
  return { boxes, signs, blocks };
}
