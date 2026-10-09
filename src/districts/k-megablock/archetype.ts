// Residential fabric around the hero slab. One compact megablock per 150 × 90 m block.
// Signage stays at the street. High blades from the kit are dropped.
import { registerArchetype } from '../../world/fabric/registry';
import { SignColor } from '../../world/fabric/types';
import { phraseSeed } from '../../world/materials/signPhrases';
import { buildMegablock, type MegablockForm } from '../_shared/megablock/build';
import { FabricSink } from '../_shared/megatower/fabricSink';

const FORMS: MegablockForm[] = ['bar', 'slab-podium', 'bar', 'slab-podium'];
const STREET = [0, 1, 4, 5, 2, 58];

registerArchetype('k-megablock', (ctx) => {
  const r = ctx.rng;
  const tower = ctx.layout.landmarkById('k-megablock-tower');
  const [bx, bz] = ctx.toWorld(0, 0);
  const near = !!tower && Math.hypot(bx - tower.x, bz - tower.z) < 240;
  const lots = ctx.lots(120, 170, 6);
  for (const lot of lots) {
    const [x, z] = ctx.toWorld(lot.s, lot.t);
    if (ctx.layout.isReserved(x, z, 8) || ctx.layout.isOcean(x, z)) continue;
    const sink = new FabricSink(ctx, lot.s, lot.t);
    const raw = r.chance(0.07) ? r.range(168, 185) : r.skew(64, 156, 1.25);
    const height = Math.max(61.2, Math.min(183.6, Math.round(raw / 3.4) * 3.4));
    buildMegablock({
      seed: r.next(),
      height,
      w: lot.lb * 0.92,
      d: lot.la * 0.9,
      form: r.pick(FORMS),
      family: r.chance(0.55) ? 'ribbed' : 'panelled',
      lit: r.range(0.1, 0.22),
      tint: r.range(0.72, 0.95),
      residential: r.range(0.72, 1),
      compact: true,
      walkways: false,
      holo: 0,
    }, sink);
    const n = near ? 2 + (r.chance(0.45) ? 1 : 0) : r.chance(0.22) ? 1 : 0;
    for (let i = 0; i < n; i++) {
      ctx.sign(
        lot.s, lot.t, lot.lb * 0.44, lot.la * 0.44,
        r.chance(0.5) ? 'a+' : 'b+',
        r.range(-lot.lb * 0.2, lot.lb * 0.2),
        r.range(3.1, 6.4), r.range(2.2, 4.2), 1.05,
        r.chance(0.7) ? SignColor.Amber : SignColor.White,
        0, phraseSeed(near ? STREET[i % STREET.length]! : 2),
      );
    }
  }
});
