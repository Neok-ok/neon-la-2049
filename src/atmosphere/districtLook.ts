// Per-district street fog and rain-neon, registered the same way as district audio.
// The frame loop samples a 40 m ring and does not grow a branch per district.
import type { Tier } from '../core/quality';
import { artsRiverBoost } from '../districts/arts-district/plan';
import { eastDistance } from '../districts/south-la-megablocks/spec';
import type { CityLayout } from '../world/layout';

export interface DistrictLook {
  /** Rain-streak neon pickup at street level, 0..1. */
  neonWet: number;
  /** Metres above ground where neonWet reaches 0. */
  neonAlt: number;
  /** Extra street fog at eye height, before a tier scale. */
  streetFog: number;
  /** Metres above ground where that fog reaches 0. */
  fogAlt: number;
  /** 0 = magenta/cyan rain. 1 = sodium or grey rain. */
  sheen: 0 | 1;
  /** Arts and the southern belts scale fog with the quality tier. */
  fogTier?: 'arts' | 'belt';
}

const looks = new Map<string, DistrictLook>();

const QUIET: DistrictLook = {
  neonWet: 0.04, neonAlt: 40, streetFog: 0, fogAlt: 1, sheen: 1,
};

export function registerDistrictLook(id: string, look: DistrictLook): void {
  looks.set(id, look);
}

export function districtLook(id: string): DistrictLook {
  return looks.get(id) ?? QUIET;
}

const ARTS_K: Record<Tier, number> = { low: 0.25, medium: 0.55, high: 0.85, ultra: 1 };
const BELT_K: Record<Tier, number> = { low: 0.35, medium: 0.6, high: 0.85, ultra: 1 };

const RING = 40;
/** Centre weighs more. The ring is the border width. */
const OFFSETS: Array<[number, number, number]> = [
  [0, 0, 2],
  [RING, 0, 1], [-RING, 0, 1], [0, RING, 1], [0, -RING, 1],
  [RING * 0.707, RING * 0.707, 1],
  [RING * 0.707, -RING * 0.707, 1],
  [-RING * 0.707, RING * 0.707, 1],
  [-RING * 0.707, -RING * 0.707, 1],
];

export interface LookSample {
  neonWet: number;
  streetFog: number;
  /** 0 magenta/cyan, 1 sodium. */
  sheen: number;
}

function atPoint(
  layout: CityLayout, x: number, z: number, alt: number, tier: Tier,
): { neon: number; fog: number; sheen: number } {
  const id = layout.districtAt(x, z).id;
  const look = districtLook(id);
  const neonFade = look.neonAlt > 1 ? Math.max(0, Math.min(1, 1 - alt / look.neonAlt)) : 0;
  const fogFade = look.fogAlt > 1 ? Math.max(0, Math.min(1, 1 - alt / look.fogAlt)) : 0;
  let fog = look.streetFog;
  if (id === 'arts-district') {
    fog = (fog + artsRiverBoost(layout, x, z) * 0.28) * ARTS_K[tier];
  } else if (look.fogTier === 'belt') {
    fog *= BELT_K[tier];
  }
  let neon = look.neonWet;
  if (id === 'south-la-megablocks') neon += Math.max(0, 1 - eastDistance(x, z) / 1500) * 0.1;
  return { neon: neon * neonFade, fog: fog * fogFade, sheen: look.sheen };
}

export function sampleDistrictLook(
  layout: CityLayout, x: number, z: number, alt: number, tier: Tier, coastNear: number,
): LookSample {
  let neon = 0;
  let fog = 0;
  let sheen = 0;
  let wsum = 0;
  for (const [ox, oz, w] of OFFSETS) {
    const s = atPoint(layout, x + ox, z + oz, alt, tier);
    neon += s.neon * w;
    fog += s.fog * w;
    sheen += s.sheen * w;
    wsum += w;
  }
  neon /= wsum;
  fog /= wsum;
  sheen /= wsum;
  // The sea wall's neon stays off even when the camera is still in the next district inland.
  if (coastNear > 0.45) {
    const coast = districtLook('coastal-strip');
    const fade = coast.neonAlt > 1 ? Math.max(0, 1 - alt / coast.neonAlt) : 0;
    const t = Math.min(1, (coastNear - 0.45) / 0.4);
    neon += (coast.neonWet * fade - neon) * t;
    sheen += (coast.sheen - sheen) * t;
  }
  return { neonWet: neon, streetFog: fog, sheen };
}
