// Pure module (worker-safe). Invented sign copy for the neon atlas.
// Food, ads, wayfinding, civic plates, industrial stencils, and paper notices.
// No film logos, no real brands, no copied slogans.
// The atlas is an 8×16 grid. Cells 0–63 are the original market band and do not move.
// phraseSeed(i) maps a cell back to a sign's seed channel.
// Seeds at or above 0.9 scroll. With 128 cells that is index >= 115, so district lists stay at or below 114.

export type SignScript = 'latin' | 'kana' | 'hangul' | 'hanzi' | 'devanagari' | 'cyrillic';

export interface SignPhrase {
  script: SignScript;
  /** Short Latin line. Drawn as the whole sign, or as the subtitle under glyph blocks. */
  latin: string;
  /** Cream plate with a double rule. Blackout paper, not a neon blade. */
  paper?: boolean;
}

export const SIGN_ATLAS_COLS = 8;
export const SIGN_ATLAS_ROWS = 16;
export const SIGN_PHRASE_COUNT = SIGN_ATLAS_COLS * SIGN_ATLAS_ROWS;

/** Named cells in the notice band (rows 8–14). Indices at or above 115 are unused filler. */
export const Phrase = {
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
  ABIERTO: 84,
  SALIDA: 85,
  AGUA: 86,
  CERRADO: 87,
  COLONY: 88,
  AMBER_FIZZ: 89,
  VELA: 90,
  SOLO_PAPEL: 91,
  EN_VIVO: 92,
  COLONIA: 93,
  TOQUE: 94,
  NIVEL_2: 95,
  KANA_DEPART: 96,
  KANA_CALDERA: 97,
  HANGUL_CURFEW: 98,
  HANGUL_WATER: 99,
  HANZI_BERTH: 100,
  HANZI_RATION: 101,
  DEVA_WATER: 102,
  CYR_DEPART: 103,
  CYR_CALDERA: 104,
  CYR_VELA: 105,
  KANA_AMBER: 106,
  HANGUL_FIZZ: 107,
  HANZI_COLONY: 108,
  DEVA_GATE: 109,
  CYR_WASH: 110,
  KANA_SECTOR: 111,
  LIVE_TONIGHT: 112,
  VEIL_HOUSE: 113,
  BOX_OFFICE: 114,
} as const;

export const SIGN_PHRASES: readonly SignPhrase[] = [
  // Row 0–7: original market band. Do not reorder.
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
  // Row 8: civic plates and sector numbers.
  { script: 'latin', latin: 'SECTOR 1' },
  { script: 'latin', latin: 'SECTOR 4' },
  { script: 'latin', latin: 'SECTOR 9' },
  { script: 'latin', latin: 'SECTOR 12' },
  { script: 'latin', latin: 'CURFEW', paper: true },
  { script: 'latin', latin: 'PAPER ONLY', paper: true },
  { script: 'latin', latin: 'GRID DOWN', paper: true },
  { script: 'latin', latin: 'BASELINE' },
  // Row 9: work and wayfinding.
  { script: 'latin', latin: 'CLOSED', paper: true },
  { script: 'latin', latin: 'RATION' },
  { script: 'latin', latin: 'PROTEIN' },
  { script: 'latin', latin: 'WATER' },
  { script: 'latin', latin: 'BERTH' },
  { script: 'latin', latin: 'DEPART' },
  { script: 'latin', latin: 'CALDERA' },
  { script: 'latin', latin: 'NINTH RING' },
  // Row 10: harbor, coast, short Spanish.
  { script: 'latin', latin: 'SEA GATE' },
  { script: 'latin', latin: 'HAUL' },
  { script: 'latin', latin: 'WASH' },
  { script: 'latin', latin: 'COLD' },
  { script: 'latin', latin: 'ABIERTO' },
  { script: 'latin', latin: 'SALIDA' },
  { script: 'latin', latin: 'AGUA' },
  { script: 'latin', latin: 'CERRADO', paper: true },
  // Row 11: colony line, a drink, an invented marque, more Spanish.
  { script: 'latin', latin: 'SHIPS FOR CALDERA COLONY' },
  { script: 'latin', latin: 'AMBER FIZZ' },
  { script: 'latin', latin: 'VELA' },
  { script: 'latin', latin: 'SOLO PAPEL', paper: true },
  { script: 'latin', latin: 'EN VIVO' },
  { script: 'latin', latin: 'COLONIA' },
  { script: 'latin', latin: 'TOQUE', paper: true },
  { script: 'latin', latin: 'NIVEL 2' },
  // Row 12: other scripts, each a different word.
  { script: 'kana', latin: 'DEPART' },
  { script: 'kana', latin: 'CALDERA' },
  { script: 'hangul', latin: 'CURFEW' },
  { script: 'hangul', latin: 'WATER' },
  { script: 'hanzi', latin: 'BERTH' },
  { script: 'hanzi', latin: 'RATION' },
  { script: 'devanagari', latin: 'WATER' },
  { script: 'cyrillic', latin: 'DEPART' },
  // Row 13.
  { script: 'cyrillic', latin: 'CALDERA' },
  { script: 'cyrillic', latin: 'VELA' },
  { script: 'kana', latin: 'AMBER' },
  { script: 'hangul', latin: 'FIZZ' },
  { script: 'hanzi', latin: 'COLONY' },
  { script: 'devanagari', latin: 'GATE' },
  { script: 'cyrillic', latin: 'WASH' },
  { script: 'kana', latin: 'SECTOR' },
  // Row 14: house ads, then unused filler that may scroll (index >= 115).
  { script: 'latin', latin: 'LIVE TONIGHT' },
  { script: 'latin', latin: 'VEIL HOUSE' },
  { script: 'latin', latin: 'BOX OFFICE' },
  { script: 'kana', latin: 'HAUL' },
  { script: 'hangul', latin: 'BERTH' },
  { script: 'hanzi', latin: 'WASH' },
  { script: 'devanagari', latin: 'COLD' },
  { script: 'cyrillic', latin: 'COLD' },
  // Row 15: filler. Do not point a district list here.
  { script: 'kana', latin: 'RING' },
  { script: 'hangul', latin: 'GATE' },
  { script: 'hanzi', latin: 'HAUL' },
  { script: 'cyrillic', latin: 'GATE' },
  { script: 'latin', latin: 'HOLD' },
  { script: 'kana', latin: 'DOCK' },
  { script: 'hangul', latin: 'DOCK' },
  { script: 'hanzi', latin: 'DOCK' },
];

if (SIGN_PHRASES.length !== SIGN_PHRASE_COUNT) {
  throw new Error(`sign atlas expects ${SIGN_PHRASE_COUNT} phrases, got ${SIGN_PHRASES.length}`);
}

/** Seed channel value that the sign shader maps back to phrase `i`. */
export function phraseSeed(i: number): number {
  const n = ((i % SIGN_PHRASE_COUNT) + SIGN_PHRASE_COUNT) % SIGN_PHRASE_COUNT;
  return (n + 0.5) / SIGN_PHRASE_COUNT;
}
