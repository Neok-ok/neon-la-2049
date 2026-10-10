// One registration path for district ambience. A district calls registerDistrictAudio.
// App.ts does not grow a branch per district. The bus is pulled in by the existing
// MarketAudio update, which the frame loop already calls.
import type { Tier } from '../core/quality';

export interface DistrictBed {
  /** 0..1 extra low drone under the shared city bed. */
  drone: number;
  /** 0..1 crowd murmur before the D1 share is applied. */
  murmur: number;
  /** 0..1 street PA / advert babble. Neon cores only. */
  pa: number;
  /** 0..1 pipe and air texture. The 41 Hz machinery bed stays on Ambience. */
  industrial: number;
  /** 0..1 canyon delay wetness. */
  canyon: number;
  /** 0..1 stall sizzle and clatter. */
  stalls: number;
  /** 0..1 neon-tube buzz, only within a few metres. */
  neon: number;
  /** 0..1 steam-vent hiss. */
  steam: number;
  /** 0..1 night foghorn. Harbor is the loud one. */
  foghorn: number;
  /** 0..3 invented babble recipe. Not a language, not words. */
  tongue: number;
}

const beds = new Map<string, DistrictBed>();

export function registerDistrictAudio(id: string, bed: DistrictBed): void {
  beds.set(id, bed);
}

export function districtBed(id: string): DistrictBed | undefined {
  return beds.get(id);
}

export function registeredDistrictIds(): string[] {
  return [...beds.keys()];
}

/** Positional street voices (stalls, neon, steam). PA and the spinner sit beside this pool. */
export const VOICE_CAP: Record<Tier, number> = { low: 2, medium: 4, high: 6, ultra: 8 };

export const SLOT_KINDS = ['sizzle', 'murmur', 'neon', 'steam', 'clatter', 'sizzle', 'murmur', 'neon'] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];

export function blendBeds(a: DistrictBed, b: DistrictBed, aw: number, bw: number, out?: DistrictBed): DistrictBed {
  const n = aw + bw || 1;
  const mix = (x: number, y: number) => (x * aw + y * bw) / n;
  const dest = out ?? {
    drone: 0, murmur: 0, pa: 0, industrial: 0, canyon: 0,
    stalls: 0, neon: 0, steam: 0, foghorn: 0, tongue: 0,
  };
  dest.drone = mix(a.drone, b.drone);
  dest.murmur = mix(a.murmur, b.murmur);
  dest.pa = mix(a.pa, b.pa);
  dest.industrial = mix(a.industrial, b.industrial);
  dest.canyon = mix(a.canyon, b.canyon);
  dest.stalls = mix(a.stalls, b.stalls);
  dest.neon = mix(a.neon, b.neon);
  dest.steam = mix(a.steam, b.steam);
  dest.foghorn = mix(a.foghorn, b.foghorn);
  dest.tongue = aw >= bw ? a.tongue : b.tongue;
  return dest;
}

const QUIET: DistrictBed = {
  drone: 0.2, murmur: 0, pa: 0, industrial: 0.05, canyon: 0,
  stalls: 0, neon: 0, steam: 0, foghorn: 0, tongue: 0,
};

/** A district with no bed still has a quiet registration, so the mix never looks up a hole. */
export function bedOrQuiet(id: string): DistrictBed {
  return beds.get(id) ?? QUIET;
}
