// Basin sprawl, the default district. One call into the shared helper.
// The Stage 1 blockout for this id is gone.
import { registerArchetype } from '../../world/fabric/registry';
import { fillSprawlBlock } from '../_shared/sprawl/plan';
import { BASIN_PARAMS } from './spec';

registerArchetype('basin-sprawl', (ctx) => {
  fillSprawlBlock(ctx, BASIN_PARAMS);
});
