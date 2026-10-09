// Pure. Runs in the chunk worker and again inside CityQuery.
import { registerArchetype } from '../../world/fabric/registry';
import type { StyleId } from '../../world/fabric/types';
import { dressBlock, type DtlaBlock } from './block';

registerArchetype('megablock-downtown', (ctx) => {
  const b = ctx.block;
  const block: DtlaBlock = {
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: b.bx, bz: b.bz,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
    i: b.i, j: b.j,
  };
  const d = dressBlock(block, ctx.layout);
  for (const box of d.boxes) {
    ctx.box(box.s, box.t, box.lb, box.la, box.h, {
      style: box.style as StyleId,
      detail: box.detail,
      lit: box.lit,
      tint: box.tint,
      base: box.base,
    });
  }
  for (const s of d.signs) {
    ctx.sign(s.s, s.t, s.hb, s.ha, s.face, s.along, s.y, s.w, s.h, s.color, s.kind, s.seed);
  }
});
