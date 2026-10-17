// One-time lookup of the noodle bar and Bibi's, using the same pure dresser as the chunk worker
// so the stool you sit on is the stool that was built.
import { enumerateBlocks } from '../../world/fabric/generator';
import type { CityLayout } from '../../world/layout';
import { dressBlock, type MarketBlock, type ShopSpot, type SteamPoint } from './dress';

export interface MarketSpots {
  noodle: ShopSpot | null;
  bibi: ShopSpot | null;
}

let cache: MarketSpots | null = null;
let steamCache: SteamPoint[] | null = null;
let plateCache: SteamPoint[] | null = null;

function asMarket(b: ReturnType<typeof enumerateBlocks>[number]): MarketBlock {
  return {
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  };
}

export function marketSpots(layout: CityLayout): MarketSpots {
  if (cache && steamCache) return cache;
  const out: MarketSpots = { noodle: null, bibi: null };
  const steam: SteamPoint[] = [];
  const plates: SteamPoint[] = [];
  const seen = new Set<string>();
  for (const id of ['noodle-bar', 'bibis-bar'] as const) {
    const poi = layout.poiById(id);
    if (!poi) continue;
    for (const b of enumerateBlocks(layout, poi.x - 90, poi.z - 90, 180)) {
      if (b.district.id !== 'little-tokyo-market') continue;
      const key = `${b.cx},${b.cz}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const d = dressBlock(asMarket(b), layout);
      if (d.noodle) out.noodle = d.noodle;
      if (d.bibi) out.bibi = d.bibi;
      for (const s of d.steam) steam.push(s);
      for (const p of d.plates) {
        if (p.template !== 'quadY') continue;
        plates.push({
          x: p.x, y: p.y + 0.13, z: p.z,
          seed: (Math.imul(Math.round(p.x * 10), 73856093) ^ Math.imul(Math.round(p.z * 10), 19349663)) >>> 0,
          rank: 0,
        });
      }
    }
  }
  cache = out;
  steamCache = steam;
  plateCache = plates;
  return out;
}

/** Courtyard grates. The same centre key as the plate mesh, on every block that has one. */
export function marketPlates(layout: CityLayout): SteamPoint[] {
  if (!plateCache) marketSpots(layout);
  return plateCache ?? [];
}

/** Stall pots, wall vents, and courtyard grates from the same dresser as the kit. */
export function marketSteamPoints(layout: CityLayout): SteamPoint[] {
  if (!steamCache) marketSpots(layout);
  return steamCache ?? [];
}
