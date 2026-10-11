// Graphics tiers for B1 ornament. Metres do not change.
// Low keeps the masses (and the far LOD impostor). Medium adds balconies, fins and decks.
// High and ultra add pipes, AC units, vents and antennas.
import type { Tier } from '../../core/quality';

export type BuildingCap = 0 | 1 | 2;

export function buildingDetailCap(tier: Tier): BuildingCap {
  if (tier === 'low') return 0;
  if (tier === 'medium') return 1;
  return 2;
}
