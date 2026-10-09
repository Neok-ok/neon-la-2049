// Replaces the Stage 1 industrial-dense blockout. The id stays, so the JSON entry does not move.
import { registerArchetype } from '../../world/fabric/registry';
import type { ArtsBlock } from './spec';
import { planArts } from './plan';

registerArchetype('industrial-dense', (ctx) => {
  const b = ctx.block;
  const block: ArtsBlock = {
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: b.bx, bz: b.bz,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  };
  const plan = planArts(block, ctx.layout);
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
