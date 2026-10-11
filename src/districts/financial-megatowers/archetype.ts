// Pure module (worker-safe). Financial District fabric between the hero megastructures.
// The old two-box megablock and the compact kit tower are replaced by the B1 families.
// Heights stay under the 320 m fabric ceiling. Taller masses are the b1-hero landmarks.
import { registerArchetype } from '../../world/fabric/registry';
import type { FabricCtx, LotRect } from '../../world/fabric/types';
import { PHRASE_LEASE } from '../../world/materials/signPhrases';
import { emitPlaced, placeLot } from '../../world/buildings/place';
import { STOREY } from '../../world/buildings/parts';

function tower(ctx: FabricCtx, l: LotRect): boolean {
  const r = ctx.rng;
  const [x, z] = ctx.toWorld(l.s, l.t);
  if (ctx.layout.isOcean(x, z)) return false;
  // Whole footprint clear of reserves, otherwise a tower would be punched full of holes.
  if (ctx.layout.isReserved(x, z, Math.max(l.la, l.lb) * 0.55)) return false;
  const w = l.lb * r.range(0.82, 0.92);
  const d = l.la * r.range(0.82, 0.92);
  if (Math.min(w, d) < 18) return false;
  const home = ctx.block.district.id;
  for (const ds of [-d / 2, d / 2]) {
    for (const dt of [-w / 2, w / 2]) {
      const [cx, cz] = ctx.toWorld(l.s + ds, l.t + dt);
      if (ctx.layout.districtAt(cx, cz).id !== home) return false;
      if (ctx.layout.isOcean(cx, cz) || ctx.layout.isReserved(cx, cz, 0.5)) return false;
    }
  }
  const plinth = r.chance(0.22) ? STOREY * 2 : 0;
  const placed = placeLot(r, {
    w, d,
    minH: 151.2,
    maxH: 302.4,
    plinth,
    phrases: PHRASE_LEASE,
    lit: r.range(0.28, 0.52),
    tint: r.range(0.55, 0.85),
  });
  if (!placed) return false;
  return emitPlaced(ctx, placed) > 0;
}

registerArchetype('financial-megatowers', (ctx) => {
  const r = ctx.rng;
  for (const l of ctx.lots(55, 125, r.range(4, 9))) {
    if (r.chance(0.08)) continue;
    tower(ctx, l);
  }
});
