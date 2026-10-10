// Replaces the Stage 1 industrial blockout on this polygon only.
// `industrial` stays registered and unused. The flare-field landmark is not this body.
import { registerArchetype } from '../../world/fabric/registry';
import type { RefineryBlock } from '../_shared/refinery/plan';
import { planSouthBay } from './plan';
import { ARCHETYPE } from './spec';

registerArchetype(ARCHETYPE, (ctx) => {
  if (ctx.block.ground > 45) return;
  const b = ctx.block;
  const block: RefineryBlock = {
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: b.bx, bz: b.bz,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  };
  const plan = planSouthBay(block, ctx.layout);
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
