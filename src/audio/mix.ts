// Gain targets for the district bus. Pure: the live graph and the offline captures share it.
import type { DistrictBed, SlotKind } from './registry';

export interface MixIn {
  bed: DistrictBed;
  /** D1 share times how full the live crowd is (0..1). */
  presence: number;
  rain: number;
  alt: number;
  /** 0 on the street, 1 fully inside. */
  interior: number;
  /** 0 day, 1 night. */
  night: number;
  /** Existing ground-traffic bed, 0..1. */
  traffic: number;
  /** 0..1 foghorn envelope. */
  hornEnv: number;
  /** 0..1, 1 when standing under a kit awning. */
  awningNear: number;
  /** True in the night market and at the East LA hall, as the frame loop already reports. */
  inMarket: boolean;
}

export interface MixOut {
  drone: number;
  murmur: number;
  industrial: number;
  pa: number;
  /** 0..1 wet send into the canyon delay. */
  canyon: number;
  awning: number;
  horn: number;
  /** 0..1. Positional street sources use this. */
  street: number;
  /** 1 on the street, near 0 inside. */
  open: number;
}

export function mixTargets(m: MixIn, out?: MixOut): MixOut {
  const open = 1 - 0.78 * clamp01(m.interior);
  const street = m.alt < 12 ? 1 : m.alt < 48 ? (48 - m.alt) / 36 : 0;
  const wide = Math.max(0.12, 1 - m.alt / 420);
  const presence = clamp01(m.presence);
  let awning = 0;
  if (m.inMarket) {
    const close = m.alt < 25 ? 1 : m.alt < 80 ? (80 - m.alt) / 55 : 0;
    const under = m.alt < 8 ? 1 : 0;
    awning = m.rain * (0.05 + under * 0.22) * (close > 0 ? 1 : 0);
  }
  awning = Math.max(awning, m.rain * (0.04 + clamp01(m.awningNear) * 0.22) * (m.alt < 36 ? 1 : 0));
  awning *= 1 - 0.72 * clamp01(m.interior);
  const hornStreet = m.alt < 140 ? Math.max(0, 1 - m.alt / 180) : 0;
  const dest = out ?? {
    drone: 0, murmur: 0, industrial: 0, pa: 0, canyon: 0, awning: 0, horn: 0, street: 0, open: 1,
  };
  dest.drone = m.bed.drone * 0.05 * wide * open * (1 - 0.3 * clamp01(m.traffic));
  dest.murmur = m.bed.murmur * presence * 0.14 * street * open;
  dest.industrial = m.bed.industrial * 0.032 * wide * (1 - 0.45 * clamp01(m.interior));
  dest.pa = m.bed.pa * 0.085 * street * (1 - 0.92 * clamp01(m.interior)) * (0.4 + 0.6 * Math.max(presence, m.bed.pa > 0.4 ? 0.35 : 0));
  dest.canyon = clamp01(m.bed.canyon);
  dest.awning = awning;
  dest.horn = m.hornEnv * m.bed.foghorn * clamp01(m.night) * hornStreet * 0.045 * open;
  dest.street = street;
  dest.open = open;
  return dest;
}

/** Distance falloff for one pooled street voice. */
export function slotLevel(
  kind: SlotKind, bed: DistrictBed, dist: number, rain: number,
  street: number, open: number, presence: number,
): number {
  let base = 0;
  let reach = 26;
  const fill = clamp01(presence);
  if (kind === 'sizzle') {
    base = 0.3 * bed.stalls * Math.max(0.45, fill);
    reach = 24;
  } else if (kind === 'clatter') {
    base = 0.14 * bed.stalls * Math.max(0.4, fill);
    reach = 14;
  } else if (kind === 'murmur') {
    base = 0.18 * bed.murmur * fill;
    reach = 22;
  } else if (kind === 'neon') {
    base = 0.12 * bed.neon;
    reach = 7;
  } else if (kind === 'steam') {
    base = 0.16 * bed.steam * (0.4 + 0.6 * clamp01(rain));
    reach = 16;
  }
  const t = Math.max(0, 1 - dist / reach);
  return base * t * t * street * open;
}

/** A slow horn: attack, hold, release, then a long gap. Deterministic in audio time. */
export function hornEnvelope(time: number, period = 41): number {
  const local = ((time % period) + period) % period;
  if (local < 0.35) return local / 0.35;
  if (local < 2.1) return 1;
  if (local < 4.6) return Math.max(0, 1 - (local - 2.1) / 2.5);
  return 0;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
