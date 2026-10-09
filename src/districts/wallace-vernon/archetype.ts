// Wallace precinct fabric. Replaces the Stage-1 `industrial` look on this polygon only.
// Windowless halls, tank farms, pipe racks, conveyors, docks, stacks. No word signs.
import { registerArchetype } from '../../world/fabric/registry';
import { designBlock } from './plan';

registerArchetype('wallace-vernon', (ctx) => {
  const b = ctx.block;
  designBlock({
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: b.bx, bz: b.bz,
    la: b.la, lb: b.lb, seed: b.seed, ground: b.ground,
  }, (s, t, lb, la, h, base, style, lit, tint, detail) => {
    ctx.box(s, t, lb, la, h, {
      style, lit, tint, detail, base: base > 0.01 ? base : undefined,
    });
  });
});
