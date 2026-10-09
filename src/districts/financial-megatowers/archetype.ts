// Pure module (worker-safe). Financial District fabric: the streets between the hero megastructures.
// Mid-rise megablock podiums with a kit tower on roughly every other lot: compact kit plans written
// through the box-only FabricSink, kept under the 320 m fabric ceiling (BIBLE §7.3: the background canyon
// is 150–300 m; everything taller is a hand-placed landmark).
import { registerArchetype } from '../../world/fabric/registry';
import { Style, SignColor, type FabricCtx, type LotRect } from '../../world/fabric/types';
import { buildTower, type CrownKind, type TowerForm } from '../_shared/megatower/tower';
import { FabricSink } from '../_shared/megatower/fabricSink';

const FORMS: TowerForm[] = ['slab', 'slab', 'stepped', 'stack', 'blade', 'cross'];
const CROWNS: CrownKind[] = ['hammer', 'stepped', 'stepped', 'lantern', 'flare', 'blade'];
const PAL = [SignColor.Cyan, SignColor.Pink, SignColor.White, SignColor.Violet, SignColor.Amber];

/** Tallest fabric structure, mast included (CityQuery.FABRIC_CEILING is 320 m). */
const MAX_TOP = 305;

function tower(ctx: FabricCtx, l: LotRect): boolean {
  const r = ctx.rng;
  const [x, z] = ctx.toWorld(l.s, l.t);
  // whole footprint clear of reserves, otherwise ctx.box would cut pieces out of the middle of the tower
  if (ctx.layout.isReserved(x, z, Math.max(l.la, l.lb) * 0.6)) return false;
  const pw = l.lb * r.range(0.86, 0.96), pd = l.la * r.range(0.86, 0.96);
  const w = pw * r.range(0.5, 0.64), d = pd * r.range(0.5, 0.64);
  if (Math.min(w, d) < 22) return false;
  const mast = r.chance(0.5) ? r.range(10, 26) : 0;
  const height = Math.min(MAX_TOP - mast, r.skew(165, 300, 1.3));
  const sink = new FabricSink(ctx, l.s, l.t);
  const parts = buildTower({
    seed: r.next(), height, w, d,
    podium: { w: pw, d: pd, h: r.range(28, 52) },
    form: r.pick(FORMS), crown: r.pick(CROWNS),
    crownH: r.range(16, 30), mast, fins: r.chance(0.6) ? r.range(5, 9) : 0,
    lit: r.range(0.3, 0.55), tint: r.range(0.72, 1.08), holo: r.int(1, 2), compact: true,
    mechEvery: r.range(90, 130),
  }, sink);
  sink.signs(parts.signs);
  sink.holoPanels(parts, PAL, r.next());
  return true;
}

function megablock(ctx: FabricCtx, l: LotRect): void {
  const r = ctx.rng;
  const H = r.range(90, 155);
  const split = r.range(0.22, 0.45), inset = r.range(0.74, 0.9);
  const tint = r.range(0.72, 1.1), lit = r.range(0.25, 0.5);
  ctx.box(l.s, l.t, l.lb * inset, l.la * inset, H * split, { style: Style.Megablock, lit, tint });
  ctx.box(l.s, l.t, l.lb, l.la, H * (1 - split), { style: r.chance(0.5) ? Style.Ribbon : Style.Megablock, lit, tint, base: H * split });
  // slit-window service cores and rooftop plant
  ctx.box(l.s + l.la * 0.3, l.t - l.lb * 0.3, Math.min(10, l.lb * 0.18), Math.min(10, l.la * 0.18), H + r.range(8, 20), { style: Style.Slit, lit: 0.3, tint, detail: 1 });
  for (let k = r.int(1, 3); k > 0; k--) {
    ctx.box(l.s + r.range(-l.la / 4, l.la / 4), l.t + r.range(-l.lb / 4, l.lb / 4), r.range(4, 10), r.range(4, 10), r.range(2, 6), { style: Style.Industrial, detail: 2, base: H, lit: 0.05 });
  }
  // ground-floor shop signs
  for (const f of ['a+', 'a-', 'b+', 'b-'] as const) {
    const len = f[0] === 'a' ? l.lb : l.la;
    for (let n = Math.floor(len / 18); n > 0; n--) {
      ctx.sign(l.s, l.t, l.lb * inset / 2, l.la * inset / 2, f, r.range(-len / 2.6, len / 2.6), r.range(4, 9), r.range(3, 8), r.range(1, 2.4), r.pick(PAL), 0);
    }
  }
}

registerArchetype('financial-megatowers', (ctx) => {
  const r = ctx.rng;
  for (const l of ctx.lots(55, 125, r.range(4, 9))) {
    if (r.chance(0.48) && tower(ctx, l)) continue;
    megablock(ctx, l);
  }
});
