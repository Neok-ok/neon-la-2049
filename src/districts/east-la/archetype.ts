// East LA sprawl. One call into the shared helper. sprawl-dense stays registered and unused.
// Food stays on the strips. One GRID DOWN plate sits on a freeway wall near the 5/10.
import { registerArchetype } from '../../world/fabric/registry';
import { Phrase } from '../../world/materials/signPhrases';
import { fillSprawlBlock } from '../_shared/sprawl/plan';
import { findGridDown } from './notice';
import { EAST_LA_PARAMS } from './spec';

registerArchetype('east-la-sprawl', (ctx) => {
  const site = findGridDown(ctx.layout);
  const mine = !!site && site.i === ctx.block.i && site.j === ctx.block.j;
  fillSprawlBlock(ctx, mine && site
    ? { ...EAST_LA_PARAMS, notice: { x: site.crossX, z: site.crossZ, radius: 250, phrase: Phrase.GRID_DOWN } }
    : EAST_LA_PARAMS);
});
