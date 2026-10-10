// Replaces the Stage 1 port blockout on this polygon only.
// `port` stays registered and unused.
import { registerArchetype } from '../../world/fabric/registry';
import type { HarborBlock } from './spec';
import { ARCHETYPE } from './spec';
import { planHarbor } from './plan';

registerArchetype(ARCHETYPE, (ctx) => {
  const b = ctx.block;
  const block: HarborBlock = {
    i: b.i, j: b.j,
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: b.bx, bz: b.bz,
    la: b.la, lb: b.lb, street: b.street, ground: b.ground,
    index: b.district.index,
  };
  const plan = planHarbor(block, ctx.layout);
  for (const box of plan.boxes) {
    ctx.box(box.s, box.t, box.lb, box.la, box.h, {
      style: box.style,
      lit: box.lit,
      tint: box.tint,
      detail: box.detail,
      base: box.base > 0.01 ? box.base : undefined,
    });
  }
  for (const s of plan.signs) {
    ctx.sign(s.s, s.t, s.hb, s.ha, s.face, s.along, s.y, s.w, s.h, s.color, s.kind, s.seed);
  }
});
