// Pure module (worker-safe). Invented sign copy for the neon atlas.
// Generic food / place words only — no film logos, no real brands.
// The atlas is an 8×8 grid; phraseSeed(i) maps a cell back to a sign's seed channel.

export type SignScript = 'latin' | 'kana' | 'hangul' | 'hanzi' | 'devanagari';

export interface SignPhrase {
  script: SignScript;
  /** Short Latin line. Drawn as the whole sign, or as the subtitle under glyph blocks. */
  latin: string;
}

export const SIGN_ATLAS_COLS = 8;
export const SIGN_ATLAS_ROWS = 8;
export const SIGN_PHRASE_COUNT = SIGN_ATLAS_COLS * SIGN_ATLAS_ROWS;

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
];

if (SIGN_PHRASES.length !== SIGN_PHRASE_COUNT) {
  throw new Error(`sign atlas expects ${SIGN_PHRASE_COUNT} phrases, got ${SIGN_PHRASES.length}`);
}

/** Seed channel value that the sign shader maps back to phrase `i`. */
export function phraseSeed(i: number): number {
  const n = ((i % SIGN_PHRASE_COUNT) + SIGN_PHRASE_COUNT) % SIGN_PHRASE_COUNT;
  return (n + 0.5) / SIGN_PHRASE_COUNT;
}
