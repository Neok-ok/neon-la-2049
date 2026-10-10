// East LA sprawl. One call into the shared helper. sprawl-dense stays registered and unused.
import { registerArchetype } from '../../world/fabric/registry';
import { fillSprawlBlock } from '../_shared/sprawl/plan';
import { EAST_LA_PARAMS } from './spec';

registerArchetype('east-la-sprawl', (ctx) => {
  fillSprawlBlock(ctx, EAST_LA_PARAMS);
});
