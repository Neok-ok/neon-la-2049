// Civic Center fabric. Symmetrical slabs and short colonnaded wings. The mall between LAPD and
// City Hall is left empty so the two stairs can see each other. No walkway decks: those belong to DTLA.
import { registerArchetype } from '../../world/fabric/registry';
import { Style, SignColor } from '../../world/fabric/types';
import { phraseSeed } from '../../world/materials/signPhrases';
import { buildMegablock, type MegablockForm } from '../_shared/megablock/build';
import { FabricSink } from '../_shared/megatower/fabricSink';
import { inCivicMall, mallAxis } from './spec';

const FORMS: MegablockForm[] = ['slab-podium', 'bar', 'courtyard', 'slab-podium'];

registerArchetype('civic-center', (ctx) => {
  const r = ctx.rng;
  const lapd = ctx.layout.landmarkById('lapd-hq');
  const hall = ctx.layout.landmarkById('city-hall');
  const lots = ctx.lots(46, 108, 8);
  for (const lot of lots) {
    const [x, z] = ctx.toWorld(lot.s, lot.t);
    if (lapd && hall && inCivicMall(lapd.x, lapd.z, hall.x, hall.z, x, z)) continue;
    if (ctx.layout.isReserved(x, z, 6) || ctx.layout.isOcean(x, z)) continue;
    const nearMall = lapd && hall
      ? mallAxis(lapd.x, lapd.z, hall.x, hall.z, x, z).off < 78
      : false;
    if (!nearMall && r.chance(0.07)) continue;

    if (nearMall && r.chance(0.62)) {
      // A lower wing along the mall, so the two monuments still own the sky.
      const H = r.range(36, 52);
      const plinth = 7;
      ctx.box(lot.s, lot.t, lot.lb * 0.98, lot.la * 0.98, plinth, { style: Style.Civic, lit: 0.1, tint: 0.68 });
      ctx.box(lot.s, lot.t, lot.lb * 0.82, lot.la * 0.82, H - plinth, {
        style: Style.Civic, lit: r.range(0.06, 0.14), tint: r.range(0.78, 0.95), base: plinth,
      });
      const n = Math.max(3, Math.min(7, Math.floor(lot.lb / 9)));
      for (let i = 0; i < n; i++) {
        const t = lot.t - lot.lb * 0.4 + ((i + 0.5) * lot.lb * 0.8) / n;
        ctx.box(lot.s + lot.la * 0.5, t, 1.5, 1.5, plinth + 0.4, { style: Style.Civic, lit: 0.04, tint: 0.55, detail: 1 });
      }
      ctx.box(lot.s, lot.t, 2.2, 2.2, r.range(4, 9), { style: Style.Industrial, lit: 0, tint: 0.6, base: H, detail: 2 });
      if (r.chance(0.35)) {
        ctx.sign(lot.s, lot.t, lot.lb * 0.5, lot.la * 0.5, 'a+', 0, plinth + 2.2, r.range(3.5, 6), 1.2, SignColor.White, 0, phraseSeed(43));
      }
      continue;
    }

    const sink = new FabricSink(ctx, lot.s, lot.t);
    const height = Math.max(58, Math.min(122, r.skew(58, 124, 1.2)));
    buildMegablock({
      seed: r.next(),
      height,
      w: lot.lb * 0.94,
      d: lot.la * 0.94,
      form: r.pick(FORMS),
      family: r.chance(0.55) ? 'panelled' : 'coffered',
      lit: r.range(0.05, 0.16),
      tint: r.range(0.7, 0.92),
      residential: 0,
      compact: true,
      walkways: false,
      holo: 0,
    }, sink);
    // The kit's shop signs stay in the parts list. Civic does not emit them.
    if (r.chance(0.2)) {
      ctx.sign(
        lot.s, lot.t, lot.lb * 0.47, lot.la * 0.47, r.chance(0.5) ? 'a+' : 'b+',
        0, r.range(6, 16), r.range(3.2, 6.5), 1.3, SignColor.White, 0, phraseSeed(r.chance(0.7) ? 43 : 60),
      );
    }
  }
});
