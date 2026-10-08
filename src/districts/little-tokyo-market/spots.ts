// One-time lookup of the noodle bar and Bibi's, using the same pure dresser as the chunk worker
// so the stool you sit on is the stool that was built.
import { enumerateBlocks } from '../../world/fabric/generator';
import type { CityLayout } from '../../world/layout';
import { dressBlock, type MarketBlock, type ShopSpot } from './dress';

export interface MarketSpots {
  noodle: ShopSpot | null;
  bibi: ShopSpot | null;
}

let cache: MarketSpots | null = null;

function asMarket(b: ReturnType<typeof enumerateBlocks>[number]): MarketBlock {
  return {
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  };
}

export function marketSpots(layout: CityLayout): MarketSpots {
  if (cache) return cache;
  const out: MarketSpots = { noodle: null, bibi: null };
  for (const id of ['noodle-bar', 'bibis-bar'] as const) {
    const poi = layout.poiById(id);
    if (!poi) continue;
    for (const b of enumerateBlocks(layout, poi.x - 90, poi.z - 90, 180)) {
      if (b.district.id !== 'little-tokyo-market') continue;
      const d = dressBlock(asMarket(b), layout);
      if (d.noodle) out.noodle = d.noodle;
      if (d.bibi) out.bibi = d.bibi;
    }
  }
  cache = out;
  return out;
}
