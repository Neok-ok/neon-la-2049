// Fabric for the port: sheds, a control shell with a door gap, sparse atlas stencils.
// Container stacks and crane gantries are instanced elsewhere. They are not these boxes.
import { Rng } from '../../core/rng';
import { Style, SignColor, type Detail, type FaceDir, type SignKind, type StyleId } from '../../world/fabric/types';
import { phraseSeed } from '../../world/materials/signPhrases';
import type { CityLayout } from '../../world/layout';
import type { HarborBlock } from './spec';
import { blockSeed } from './spec';
import { SHELL, craneNear, harborSites } from './sites';

export interface FabricBox {
  s: number;
  t: number;
  lb: number;
  la: number;
  h: number;
  base: number;
  style: StyleId;
  lit: number;
  tint: number;
  detail: Detail;
}

export interface FabricSign {
  s: number;
  t: number;
  hb: number;
  ha: number;
  face: FaceDir;
  along: number;
  y: number;
  w: number;
  h: number;
  color: number;
  kind: SignKind;
  seed: number;
}

export interface HarborPlan {
  boxes: FabricBox[];
  signs: FabricSign[];
}

const EMPTY: HarborPlan = { boxes: [], signs: [] };
const SHED_H = [15, 20, 25, 30];

export function planHarbor(block: HarborBlock, layout: CityLayout): HarborPlan {
  if (block.ground > 45) return EMPTY;
  if (layout.isOcean(block.cx, block.cz) || layout.isReserved(block.cx, block.cz, 8)) return EMPTY;
  if (layout.districtAt(block.cx, block.cz).id !== 'harbor') return EMPTY;
  const sites = harborSites(layout);
  const boxes: FabricBox[] = [];
  const signs: FabricSign[] = [];
  if (sites.control && sites.control.i === block.i && sites.control.j === block.j) {
    shell(boxes, block, sites.control.x, sites.control.z, sites.control.yaw);
    return { boxes, signs };
  }
  if (craneNear(sites, block.cx, block.cz, 120)) return EMPTY;
  for (const ship of sites.ships) {
    if (Math.hypot(ship.x - block.cx, ship.z - block.cz) < 80) return EMPTY;
  }
  const r = new Rng(blockSeed(block.i, block.j, block.index));
  const roll = r.next();
  if (roll < 0.42) {
    const h = SHED_H[r.int(0, SHED_H.length - 1)]!;
    const la = r.int(4, 7) * 5;
    const lb = r.int(3, 5) * 5;
    boxes.push({
      s: r.range(-18, 18), t: r.range(-16, 16),
      lb, la, h, base: 0,
      style: Style.Industrial, lit: r.range(0.04, 0.1), tint: r.range(0.72, 0.95), detail: 0,
    });
    if (r.chance(0.18)) {
      signs.push({
        s: 0, t: 0, hb: lb / 2, ha: la / 2, face: 'a-', along: 0,
        y: Math.min(8, h - 2), w: 1.4, h: 6,
        color: SignColor.Amber, kind: 1,
        seed: phraseSeed(r.pick([47, 49, 62])),
      });
    }
  } else if (roll < 0.62) {
    boxes.push({
      s: 0, t: 0, lb: 28, la: 36, h: 1.2, base: 0,
      style: Style.Solid, lit: 0.02, tint: 0.55, detail: 2,
    });
  }
  return { boxes, signs };
}

function toST(block: HarborBlock, doorX: number, doorZ: number, yaw: number, lx: number, lz: number): { s: number; t: number } {
  const x = doorX + lx * Math.cos(yaw) + lz * Math.sin(yaw);
  const z = doorZ - lx * Math.sin(yaw) + lz * Math.cos(yaw);
  return {
    s: (x - block.cx) * block.ax + (z - block.cz) * block.az,
    t: (x - block.cx) * block.bx + (z - block.cz) * block.bz,
  };
}

function put(
  boxes: FabricBox[], block: HarborBlock,
  doorX: number, doorZ: number, yaw: number,
  lx: number, lz: number, w: number, d: number, h: number, base: number,
  lit: number,
): void {
  const p = toST(block, doorX, doorZ, yaw, lx, lz);
  const quarter = Math.abs(Math.sin(yaw)) > 0.5;
  boxes.push({
    s: p.s, t: p.t,
    la: quarter ? w : d,
    lb: quarter ? d : w,
    h, base,
    style: Style.Industrial, lit, tint: 0.78, detail: 0,
  });
}

/** Grid-aligned shell. The door faces local +Z. The room runs toward −Z. */
function shell(boxes: FabricBox[], block: HarborBlock, doorX: number, doorZ: number, yaw: number): void {
  const depth = SHELL.depth;
  const width = SHELL.width;
  const H = SHELL.height;
  const wall = 0.5;
  const gap = 2.2;
  const cheek = (width - gap) / 2;
  const front = -wall / 2;
  put(boxes, block, doorX, doorZ, yaw, -gap / 2 - cheek / 2, front, cheek, wall, H, 0, 0.08);
  put(boxes, block, doorX, doorZ, yaw, gap / 2 + cheek / 2, front, cheek, wall, H, 0, 0.08);
  put(boxes, block, doorX, doorZ, yaw, 0, front, gap, wall, H - 2.7, 2.7, 0.08);
  const mid = -depth / 2;
  put(boxes, block, doorX, doorZ, yaw, -width / 2 + wall / 2, mid, wall, depth, H, 0, 0.06);
  put(boxes, block, doorX, doorZ, yaw, width / 2 - wall / 2, mid, wall, depth, H, 0, 0.06);
  put(boxes, block, doorX, doorZ, yaw, 0, -depth + wall / 2, width, wall, H, 0, 0.06);
  put(boxes, block, doorX, doorZ, yaw, 0, mid, width - 0.4, depth - 0.6, 0.45, H, 0.02);
}
