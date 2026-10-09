// South LA residential fabric. One call into the shared library.
import { registerArchetype } from '../../world/fabric/registry';
import { fillResidentialBlock } from '../_shared/residential/plan';
import { SOUTH_LA_PARAMS } from './spec';

registerArchetype('south-la-megablocks', (ctx) => {
  fillResidentialBlock(ctx, SOUTH_LA_PARAMS);
});
