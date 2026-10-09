import type { Tier } from '../../core/quality';
import type { InteriorDetail } from './types';

export function interiorDetail(tier: Tier): InteriorDetail {
  if (tier === 'low') return 0;
  if (tier === 'medium') return 1;
  if (tier === 'high') return 2;
  return 3;
}
