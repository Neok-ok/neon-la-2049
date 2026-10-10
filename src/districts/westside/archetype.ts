// Westside sprawl. One call into the shared helper. East LA stays on sprawl-dense.
import { registerArchetype } from '../../world/fabric/registry';
import { fillSprawlBlock } from '../_shared/sprawl/plan';
import { WESTSIDE_PARAMS } from './spec';

registerArchetype('westside-sprawl', (ctx) => {
  fillSprawlBlock(ctx, WESTSIDE_PARAMS);
});
