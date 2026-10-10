// South Bay plan. The kit stays default-off; this is the Stage 18 param object.
import type { CityLayout } from '../../world/layout';
import { planRefinery, type RefineryBlock, type RefineryPlan } from '../_shared/refinery/plan';
import { coastParams, flareKeepOut, isControlBlock } from './spec';

export function planSouthBay(block: RefineryBlock, layout: CityLayout): RefineryPlan {
  return planRefinery(block, layout, {
    ...coastParams(block),
    pump: isControlBlock(block),
    keepOut: flareKeepOut(layout),
  });
}
