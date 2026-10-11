// Pure module (worker-safe). Invented sign copy for the neon atlas.
// The first 64 cells stay the market band. Cells 64–127 are notices, ads and work.
// No film logos, no real brands, no copied slogans.
// phraseSeed(i) maps a cell back to a sign's seed channel.

export type SignScript = 'latin' | 'kana' | 'hangul' | 'hanzi' | 'devanagari' | 'cyrillic';

export interface SignPhrase {
  script: SignScript;
  /** Short Latin line. Drawn as the whole sign, or as the subtitle under glyph blocks. */
  latin: string;
}

export const SIGN_ATLAS_COLS = 8;
export const SIGN_ATLAS_ROWS = 16;
export const SIGN_PHRASE_COUNT = SIGN_ATLAS_COLS * SIGN_ATLAS_ROWS;

/** Named cells in the notice band. The market band (0–63) is addressed by index. */
export const CELL = {
  SECTOR_1: 64,
  SECTOR_4: 65,
  SECTOR_9: 66,
  SECTOR_12: 67,
  CURFEW: 68,
  PAPER_ONLY: 69,
  GRID_DOWN: 70,
  BASELINE: 71,
  CLOSED: 72,
  RATION: 73,
  PROTEIN: 74,
  WATER: 75,
  BERTH: 76,
  DEPART: 77,
  CALDERA: 78,
  NINTH_RING: 79,
  SEA_GATE: 80,
  HAUL: 81,
  WASH: 82,
  COLD: 83,
  OPEN: 84,
  AMBER_FIZZ: 85,
  KITE_MARQUE: 86,
  GATE_9: 87,
  AGUA: 88,
  SALIDA: 89,
  CERRADO: 90,
  RACION: 91,
  SOLO_PAPEL: 92,
  ABIERTO: 93,
  MUELLE: 94,
  FRIO: 95,
  DEPART_CYR: 96,
  COLD_CYR: 97,
  WATER_CYR: 98,
  SECTOR_CYR: 99,
  CALDERA_CYR: 100,
  CLOSED_CYR: 101,
  WASH_CYR: 102,
  RATION_CYR: 103,
  DEPART_KANA: 104,
  CALDERA_HANZI: 105,
  DEPART_HANGUL: 106,
  WATER_DEVA: 107,
  KITE_KANA: 108,
  FIZZ_HANZI: 109,
  SEA_GATE_HANGUL: 110,
  BERTH_DEVA: 111,
  COLONY: 112,
  NINTH_KANA: 113,
  SECTOR_12_KANA: 114,
  GRID_DOWN_HANZI: 115,
  PAPER_CYR: 116,
  CURFEW_DEVA: 117,
  BASELINE_HANGUL: 118,
  HAUL_KANA: 119,
  SECTOR_1_KANA: 120,
  WASH_HANZI: 121,
  PROTEIN_HANGUL: 122,
  COLD_DEVA: 123,
  KITE_9: 124,
  FIZZ_CYR: 125,
  SALIDA_12: 126,
  GATE_OPEN: 127,
} as const;

export const SIGN_PHRASES: readonly SignPhrase[] = [
  { script: 'latin', latin: 'NOODLES' },
  { script: 'latin', latin: 'HOT BROTH' },
  { script: 'latin', latin: 'OPEN LATE' },
  { script: 'latin', latin: 'STEAM BAR' },
  { script: 'latin', latin: 'NIGHT MARKET' },
  { script: 'latin', latin: 'RICE BOWL' },
  { script: 'latin', latin: 'WARM BOWL' },
  { script: 'latin', latin: 'COUNTER' },
  { script: 'kana', latin: 'BROTH' },
  { script: 'kana', latin: 'NOODLES' },
  { script: 'kana', latin: 'STEAM' },
  { script: 'kana', latin: 'MARKET' },
  { script: 'kana', latin: 'LATE' },
  { script: 'kana', latin: 'BOWL' },
  { script: 'kana', latin: 'GRILL' },
  { script: 'kana', latin: 'TEA' },
  { script: 'hangul', latin: 'SOUP' },
  { script: 'hangul', latin: 'MARKET' },
  { script: 'hangul', latin: 'NOODLES' },
  { script: 'hangul', latin: 'NIGHT' },
  { script: 'hangul', latin: 'BAR' },
  { script: 'hangul', latin: 'HOT' },
  { script: 'hangul', latin: 'EAT' },
  { script: 'hangul', latin: 'STEAM' },
  { script: 'hanzi', latin: 'NOODLES' },
  { script: 'hanzi', latin: 'NIGHT' },
  { script: 'hanzi', latin: 'MARKET' },
  { script: 'hanzi', latin: 'TEA' },
  { script: 'hanzi', latin: 'SOUP' },
  { script: 'hanzi', latin: 'OPEN' },
  { script: 'hanzi', latin: 'BOWL' },
  { script: 'hanzi', latin: 'HOT' },
  { script: 'devanagari', latin: 'CHAI' },
  { script: 'devanagari', latin: 'MARKET' },
  { script: 'devanagari', latin: 'SPICE' },
  { script: 'devanagari', latin: 'TEA' },
  { script: 'latin', latin: 'SYNTH TEA' },
  { script: 'latin', latin: 'SKEWERS' },
  { script: 'latin', latin: 'DUMPLINGS' },
  { script: 'latin', latin: 'SECTOR 5' },
  { script: 'kana', latin: 'ODEN' },
  { script: 'kana', latin: 'UDON' },
  { script: 'kana', latin: 'RAMEN' },
  { script: 'kana', latin: 'YAKITORI' },
  { script: 'hangul', latin: 'RICE' },
  { script: 'hangul', latin: 'LATE' },
  { script: 'hanzi', latin: 'BAR' },
  { script: 'hanzi', latin: 'STEAM' },
  { script: 'latin', latin: 'RED LANTERN' },
  { script: 'latin', latin: 'BLACK OIL' },
  { script: 'latin', latin: 'SALT BOWL' },
  { script: 'latin', latin: 'KASAI' },
  { script: 'kana', latin: 'KASAI' },
  { script: 'kana', latin: 'MIDORI' },
  { script: 'hanzi', latin: 'MIDORI' },
  { script: 'hangul', latin: 'KASAI' },
  { script: 'devanagari', latin: 'BOWL' },
  { script: 'devanagari', latin: 'NIGHT' },
  { script: 'latin', latin: 'VENDING' },
  { script: 'latin', latin: 'EAT HERE' },
  { script: 'kana', latin: 'OPEN' },
  { script: 'hanzi', latin: 'LANTERN' },
  { script: 'latin', latin: '2049' },
  { script: 'hangul', latin: 'COUNTER' },
  { script: 'latin', latin: 'SECTOR 1' },
  { script: 'latin', latin: 'SECTOR 4' },
  { script: 'latin', latin: 'SECTOR 9' },
  { script: 'latin', latin: 'SECTOR 12' },
  { script: 'latin', latin: 'CURFEW' },
  { script: 'latin', latin: 'PAPER ONLY' },
  { script: 'latin', latin: 'GRID DOWN' },
  { script: 'latin', latin: 'BASELINE' },
  { script: 'latin', latin: 'CLOSED' },
  { script: 'latin', latin: 'RATION' },
  { script: 'latin', latin: 'PROTEIN' },
  { script: 'latin', latin: 'WATER' },
  { script: 'latin', latin: 'BERTH' },
  { script: 'latin', latin: 'DEPART' },
  { script: 'latin', latin: 'CALDERA' },
  { script: 'latin', latin: 'NINTH RING' },
  { script: 'latin', latin: 'SEA GATE' },
  { script: 'latin', latin: 'HAUL' },
  { script: 'latin', latin: 'WASH' },
  { script: 'latin', latin: 'COLD' },
  { script: 'latin', latin: 'OPEN' },
  { script: 'latin', latin: 'AMBER FIZZ' },
  { script: 'latin', latin: 'KITE MARQUE' },
  { script: 'latin', latin: 'GATE 9' },
  { script: 'latin', latin: 'AGUA' },
  { script: 'latin', latin: 'SALIDA' },
  { script: 'latin', latin: 'CERRADO' },
  { script: 'latin', latin: 'RACION' },
  { script: 'latin', latin: 'SOLO PAPEL' },
  { script: 'latin', latin: 'ABIERTO' },
  { script: 'latin', latin: 'MUELLE' },
  { script: 'latin', latin: 'FRIO' },
  { script: 'cyrillic', latin: 'DEPART' },
  { script: 'cyrillic', latin: 'COLD' },
  { script: 'cyrillic', latin: 'WATER' },
  { script: 'cyrillic', latin: 'SECTOR' },
  { script: 'cyrillic', latin: 'CALDERA' },
  { script: 'cyrillic', latin: 'CLOSED' },
  { script: 'cyrillic', latin: 'WASH' },
  { script: 'cyrillic', latin: 'RATION' },
  { script: 'kana', latin: 'DEPART' },
  { script: 'hanzi', latin: 'CALDERA' },
  { script: 'hangul', latin: 'DEPART' },
  { script: 'devanagari', latin: 'WATER' },
  { script: 'kana', latin: 'KITE' },
  { script: 'hanzi', latin: 'FIZZ' },
  { script: 'hangul', latin: 'SEA GATE' },
  { script: 'devanagari', latin: 'BERTH' },
  { script: 'latin', latin: 'CALDERA BERTH IS OPEN' },
  { script: 'kana', latin: 'NINTH' },
  { script: 'kana', latin: 'SECTOR 12' },
  { script: 'hanzi', latin: 'GRID DOWN' },
  { script: 'cyrillic', latin: 'PAPER ONLY' },
  { script: 'devanagari', latin: 'CURFEW' },
  { script: 'hangul', latin: 'BASELINE' },
  { script: 'kana', latin: 'HAUL' },
  { script: 'kana', latin: 'SECTOR 1' },
  { script: 'hanzi', latin: 'WASH' },
  { script: 'hangul', latin: 'PROTEIN' },
  { script: 'devanagari', latin: 'COLD' },
  { script: 'latin', latin: 'KITE 9' },
  { script: 'cyrillic', latin: 'FIZZ' },
  { script: 'latin', latin: 'SALIDA 12' },
  { script: 'latin', latin: 'GATE OPEN' },
];

if (SIGN_PHRASES.length !== SIGN_PHRASE_COUNT) {
  throw new Error(`sign atlas expects ${SIGN_PHRASE_COUNT} phrases, got ${SIGN_PHRASES.length}`);
}

/** Seed channel value that the sign shader maps back to phrase `i`. */
export function phraseSeed(i: number): number {
  const n = ((i % SIGN_PHRASE_COUNT) + SIGN_PHRASE_COUNT) % SIGN_PHRASE_COUNT;
  return (n + 0.5) / SIGN_PHRASE_COUNT;
}

const C = CELL;

/** Lease and wayfinding. Financial podiums and one downtown register. No food. */
export const PHRASE_LEASE = [
  C.NINTH_RING, C.DEPART_KANA, C.CALDERA_HANZI, 62, C.DEPART_CYR,
  C.AMBER_FIZZ, C.KITE_MARQUE, C.COLONY, C.AGUA, C.KITE_KANA,
] as const;

/** Downtown canyon ads. No food, no SECTOR 5, no BLACK OIL. */
export const PHRASE_DTLA = [
  C.NINTH_RING, C.DEPART, 62, C.CALDERA, C.AMBER_FIZZ, C.KITE_MARQUE,
  C.DEPART_KANA, C.CALDERA_HANZI, C.AGUA, C.DEPART_CYR, C.SALIDA, C.KITE_KANA,
] as const;

/** Hollywood houses. Not a market, not Sector 5, not BLACK OIL. */
export const PHRASE_HOUSES = [
  2, 48, 51, 53, 62, 52, 54, 55, C.AMBER_FIZZ, C.KITE_MARQUE,
  C.SECTOR_1, C.DEPART_CYR, C.AGUA, C.FIZZ_HANZI, C.KITE_KANA, C.SECTOR_1_KANA,
] as const;

/** Civic Center only. SECTOR 5 does not leave this list. */
export const PHRASE_CIVIC = [39, 62, C.BASELINE, C.CURFEW, C.PAPER_ONLY] as const;

/** Broadway canyon: market plus house names. No SECTOR 5, no BLACK OIL. */
export const PHRASE_HERITAGE = [
  2, 3, 48, 51, 53, 62, 1, 5, 16, 20, 23, 9, C.AMBER_FIZZ, 52, C.AGUA,
] as const;

/** Refinery and arts yards. */
export const PHRASE_POWER = [49, 47, 62, 10, C.COLD] as const;

/** Arts District yards. Steam and BLACK OIL stay. Food and SECTOR 5 leave. */
export const PHRASE_ARTS = [10, 23, 47, 49, 62, C.COLD, C.COLD_DEVA] as const;

/** Harbor sheds and Long Beach faces toward the docks. */
export const PHRASE_PORT = [C.BERTH, C.HAUL, C.WASH, C.MUELLE, C.WASH_HANZI, 62] as const;

export const PHRASE_LONG_BEACH = [
  C.BERTH, C.HAUL, C.WASH, C.OPEN, 62, C.MUELLE, C.WASH_HANZI,
] as const;

/** Sea wall. Not SECTOR 5, not SALT BOWL. */
export const PHRASE_WATER = [C.SEA_GATE, C.WATER, C.AGUA, 62, C.WATER_DEVA, C.OPEN] as const;

/** Basin strip and paper notices. Not COUNTER. */
export const PHRASE_PAPER = [
  C.PAPER_ONLY, C.OPEN, C.CURFEW, C.SOLO_PAPEL, C.PAPER_CYR, C.SALIDA,
] as const;

/** South LA spines. RATION and SECTOR 4, not a noodle stall. */
export const PHRASE_RATION = [C.RATION, C.PROTEIN, C.SECTOR_4, C.PROTEIN_HANGUL, C.WASH] as const;

/** Lakewood side streets. */
export const PHRASE_WASH = [C.WASH, C.OPEN, C.MUELLE, C.WASH_HANZI] as const;

/** Westside diner strip. OPEN LATE stays. NIGHT MARKET and HOT BROTH do not. */
export const PHRASE_WESTSIDE = [2, 0, 5, 3, 48, 9, 16, 36] as const;

/** LAX wayfinding. Sector 12, not Sector 5. */
export const PHRASE_WAY = [C.SECTOR_12, C.DEPART, C.CALDERA, 62] as const;
