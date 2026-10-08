// Pure. Runs in the chunk worker and again inside CityQuery. Props stay on the main thread (details.ts).
import { registerArchetype } from '../../world/fabric/registry';
import type { StyleId } from '../../world/fabric/types';
import { dressBlock, type MarketBlock } from './dress';

registerArchetype('little-tokyo-market', (ctx) => {
  const b = ctx.block;
  const mb: MarketBlock = {
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  };
  const d = dressBlock(mb, ctx.layout);
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
