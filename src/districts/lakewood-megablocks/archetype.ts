// Lakewood / Downey residential fabric. One call into the shared library.
import { registerArchetype } from '../../world/fabric/registry';
import { fillResidentialBlock } from '../_shared/residential/plan';
import { LAKEWOOD_PARAMS } from './spec';

registerArchetype('lakewood-megablocks', (ctx) => {
  fillResidentialBlock(ctx, LAKEWOOD_PARAMS);
});
