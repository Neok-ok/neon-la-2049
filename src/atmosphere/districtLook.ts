// Per-district street fog and rain-neon, registered the same way as district audio.
// The frame loop samples a 40 m ring and does not grow a branch per district.
import type { Tier } from '../core/quality';
import { artsRiverBoost } from '../districts/arts-district/plan';
import { eastDistance } from '../districts/south-la-megablocks/spec';
import type { CityLayout } from '../world/layout';

export interface DistrictAir {
  /** Analytic ground-band weight, 0..1. */
  ground: number;
  /** Mid inversion weight, 0..1. 1 keeps the weather peak. */
  mid: number;
  /** High-deck weight, 0..1. */
  deck: number;
  /**
   * Hue multiply on the low fog. Keep the luminance near 1 so a night street
   * stays black and only the haze shifts colour.
   */
  tint: readonly [number, number, number];
  /** 0..1 mix of that hue into the ground band. */
  mix: number;
  /** 0..1 how often a street cell grows a vent. */
  breath: number;
}

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
  air: DistrictAir;
}

const looks = new Map<string, DistrictLook>();

const QUIET: DistrictLook = {
  neonWet: 0.04, neonAlt: 40, streetFog: 0, fogAlt: 1, sheen: 1,
  air: { ground: 0.3, mid: 1, deck: 0.65, tint: [1, 0.96, 0.9], mix: 0.08, breath: 0.05 },
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
  ground: number;
  mid: number;
  deck: number;
  tintR: number;
  tintG: number;
  tintB: number;
  tintMix: number;
  breath: number;
}

interface PointLook {
  neon: number;
  fog: number;
  sheen: number;
  ground: number;
  mid: number;
  deck: number;
  tintR: number;
  tintG: number;
  tintB: number;
  tintMix: number;
  breath: number;
}

function atPoint(
  layout: CityLayout, x: number, z: number, alt: number, tier: Tier,
): PointLook {
  const id = layout.districtAt(x, z).id;
  const look = districtLook(id);
  const neonFade = look.neonAlt > 1 ? Math.max(0, Math.min(1, 1 - alt / look.neonAlt)) : 0;
  const fogFade = look.fogAlt > 1 ? Math.max(0, Math.min(1, 1 - alt / look.fogAlt)) : 0;
  let fog = look.streetFog;
  let ground = look.air.ground;
  if (id === 'arts-district') {
    const river = artsRiverBoost(layout, x, z);
    fog = (fog + river * 0.28) * ARTS_K[tier];
    ground = Math.min(1, ground + river * 0.2);
  } else if (look.fogTier === 'belt') {
    fog *= BELT_K[tier];
  }
  let neon = look.neonWet;
  if (id === 'south-la-megablocks') neon += Math.max(0, 1 - eastDistance(x, z) / 1500) * 0.1;
  const air = look.air;
  return {
    neon: neon * neonFade,
    fog: fog * fogFade,
    sheen: look.sheen,
    ground,
    mid: air.mid,
    deck: air.deck,
    tintR: air.tint[0],
    tintG: air.tint[1],
    tintB: air.tint[2],
    tintMix: air.mix,
    breath: air.breath,
  };
}

export function sampleDistrictLook(
  layout: CityLayout, x: number, z: number, alt: number, tier: Tier, coastNear: number,
): LookSample {
  let neon = 0;
  let fog = 0;
  let sheen = 0;
  let ground = 0;
  let mid = 0;
  let deck = 0;
  let tintR = 0;
  let tintG = 0;
  let tintB = 0;
  let tintMix = 0;
  let breath = 0;
  let wsum = 0;
  for (const [ox, oz, w] of OFFSETS) {
    const s = atPoint(layout, x + ox, z + oz, alt, tier);
    neon += s.neon * w;
    fog += s.fog * w;
    sheen += s.sheen * w;
    ground += s.ground * w;
    mid += s.mid * w;
    deck += s.deck * w;
    tintR += s.tintR * w;
    tintG += s.tintG * w;
    tintB += s.tintB * w;
    tintMix += s.tintMix * w;
    breath += s.breath * w;
    wsum += w;
  }
  neon /= wsum;
  fog /= wsum;
  sheen /= wsum;
  ground /= wsum;
  mid /= wsum;
  deck /= wsum;
  tintR /= wsum;
  tintG /= wsum;
  tintB /= wsum;
  tintMix /= wsum;
  breath /= wsum;
  // The sea wall's neon stays off even when the camera is still in the next district inland.
  if (coastNear > 0.45) {
    const coast = districtLook('coastal-strip');
    const fade = coast.neonAlt > 1 ? Math.max(0, 1 - alt / coast.neonAlt) : 0;
    const t = Math.min(1, (coastNear - 0.45) / 0.4);
    neon += (coast.neonWet * fade - neon) * t;
    sheen += (coast.sheen - sheen) * t;
    const a = coast.air;
    ground += (a.ground - ground) * t;
    mid += (a.mid - mid) * t;
    deck += (a.deck - deck) * t;
    tintR += (a.tint[0] - tintR) * t;
    tintG += (a.tint[1] - tintG) * t;
    tintB += (a.tint[2] - tintB) * t;
    tintMix += (a.mix - tintMix) * t;
    breath += (a.breath - breath) * t;
  }
  return { neonWet: neon, streetFog: fog, sheen, ground, mid, deck, tintR, tintG, tintB, tintMix, breath };
}
