// Grey Coast fabric. Low salt slabs, not the downtown megablock kit:
// those families are 90–250 m and the wrong façade. Heights stay 15–60 m.
import { registerArchetype } from '../../world/fabric/registry';
import { SignColor, Style } from '../../world/fabric/types';
import { phraseSeed } from '../../world/materials/signPhrases';
import { inApron } from './apronPlan';
import { nearSeaWall } from './profile';

const PHRASES = [2, 39, 50, 58, 62];

registerArchetype('coastal-grey', (ctx) => {
  const r = ctx.rng;
  for (const lot of ctx.lots(22, 70, 6)) {
    if (r.chance(0.26)) continue;
    const [x, z] = ctx.toWorld(lot.s, lot.t);
    if (ctx.layout.isOcean(x, z) || nearSeaWall(ctx.layout, x, z, 22) || inApron(ctx.layout, x, z, 8)) continue;
    const tall = r.chance(0.12);
    const H = tall ? r.range(48, 60) : Math.max(15, Math.min(46, r.skew(15, 46, 1.45)));
    const podium = 4.6;
    const tint = r.range(0.62, 0.88);
    ctx.box(lot.s, lot.t, lot.lb * 0.9, lot.la * 0.9, podium, {
      style: Style.Coastal, lit: r.range(0.04, 0.1), tint: tint * 0.82,
    });
    ctx.box(lot.s, lot.t, lot.lb * 0.76, lot.la * 0.76, H - podium, {
      style: Style.Coastal, base: podium, lit: r.range(0.05, 0.16), tint,
    });
    ctx.box(lot.s, lot.t - lot.lb * 0.46, 0.35, lot.la * 0.55, 3.3, {
      style: Style.Solid, detail: 2, lit: 0.02, tint: 0.38,
    });
    if (r.chance(0.35)) {
      ctx.box(lot.s + lot.lb * 0.2, lot.t - lot.lb * 0.46, 0.18, 0.7, 2.6, {
        style: Style.Solid, detail: 2, lit: 0, tint: 0.3,
      });
    }
    if (r.chance(0.18)) {
      ctx.box(lot.s, lot.t, 2.4, 2.4, 1.5, {
        style: Style.Solid, detail: 2, base: H, tint: 0.5, lit: 0,
      });
    }
    if (r.chance(0.12)) {
      ctx.sign(
        lot.s, lot.t, lot.lb * 0.46, lot.la * 0.46,
        r.chance(0.5) ? 'b+' : 'a+',
        r.range(-2, 2),
        r.range(3.6, 8),
        r.range(2.2, 4.4),
        1.05,
        r.chance(0.55) ? SignColor.White : SignColor.Cyan,
        0,
        phraseSeed(r.pick(PHRASES)),
      );
    }
  }
});
