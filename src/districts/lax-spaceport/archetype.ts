// Replaces the Stage 1 spaceport sheds on this polygon only.
// `spaceport` stays registered and unused. Hills above 45 m never reach this id.
import { registerArchetype } from '../../world/fabric/registry';
import { ARCHETYPE } from './spec';
import { planLax, type LaxBlock } from './plan';

registerArchetype(ARCHETYPE, (ctx) => {
  if (ctx.block.ground > 45) return;
  const b = ctx.block;
  const block: LaxBlock = {
    i: b.i, j: b.j,
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: b.bx, bz: b.bz,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  };
  const plan = planLax(block);
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
