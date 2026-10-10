// Belt plan. The kit stays default-off; this is the Stage 15 param object.
import type { CityLayout } from '../../world/layout';
import { planRefinery, type RefineryBlock, type RefineryPlan } from '../_shared/refinery/plan';
import { isPumpBlock, SOUTHEAST_PARAMS } from './spec';

export function planSoutheast(block: RefineryBlock, layout: CityLayout): RefineryPlan {
  return planRefinery(block, layout, {
    ...SOUTHEAST_PARAMS,
    pump: isPumpBlock(block),
  });
}
