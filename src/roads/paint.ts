// Original trim sheet, marking atlas and gantry phrases. Painted in code.
// Row 0 of each buffer is the top of the image. Textures set flipY so v = 1 is that row.
// No photographs, no shields, no brands.

export const TRIM = 256;
export const MARK = 256;
export const SIGN_W = 512;
export const SIGN_H = 128;

const FONT: Record<string, number[]> = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

export const SIGN_PHRASES = ['NORTH', 'SLOW', 'KEEP LANE', 'EXIT', 'THROUGH', 'DECK 2049'] as const;

function hash(ix: number, iy: number): number {
  let h = (ix * 374761393 + iy * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function put(buf: Uint8Array, w: number, x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || y < 0 || x >= w) return;
  const h = buf.length / (w * 4);
  if (y >= h) return;
  const i = (y * w + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

function blot(buf: Uint8Array, w: number, x: number, y: number, r: number, g: number, b: number, a: number): void {
  const grime = hash(x, y);
  const fade = grime > 0.86 ? 0.35 : grime > 0.72 ? 0.7 : 1;
  put(buf, w, x, y, r * fade, g * fade, b * fade, a * fade);
}

function rect(buf: Uint8Array, index: number, x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, a: number): void {
  const col = index % 4;
  const row = Math.floor(index / 4);
  const ox = col * 64;
  const oy = row * 64;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) blot(buf, MARK, ox + x, oy + y, r, g, b, a);
}

/** 2×2 trim: asphalt, sidewalk, curb concrete, patch. RGB albedo, A roughness (255 = rough). */
export function trimBytes(): Uint8Array {
  const w = TRIM;
  const buf = new Uint8Array(w * w * 4);
  const cell = w / 2;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const cx = x >= cell ? 1 : 0;
      const cy = y >= cell ? 1 : 0;
      const lx = x % cell;
      const ly = y % cell;
      const n = hash(x, y);
      const n2 = hash(x * 3 + 1, y * 5 + 2);
      let r = 12, g = 12, b = 13, rough = 230;
      if (cx === 0 && cy === 0) {
        r = 11 + n * 10;
        g = 11 + n * 8;
        b = 12 + n * 8;
        if (Math.abs(ly - cell * 0.5) < 2 && n2 > 0.4) { r *= 0.7; g *= 0.7; b *= 0.7; }
        if (n2 > 0.92) { r += 18; g += 16; b += 14; }
        rough = 210 + n * 30;
      } else if (cx === 1 && cy === 0) {
        const jx = lx % 32 < 2;
        const jy = ly % 32 < 2;
        r = jx || jy ? 28 : 78 + n * 16;
        g = jx || jy ? 28 : 78 + n * 14;
        b = jx || jy ? 30 : 80 + n * 12;
        rough = jx || jy ? 250 : 190;
      } else if (cx === 0 && cy === 1) {
        r = 96 + n * 18;
        g = 96 + n * 16;
        b = 98 + n * 14;
        if (lx < 3 || ly < 3) { r *= 0.55; g *= 0.55; b *= 0.55; }
        rough = 200;
      } else {
        r = 22 + n * 8;
        g = 20 + n * 6;
        b = 18 + n * 6;
        rough = 235;
      }
      put(buf, w, x, y, r, g, b, rough);
    }
  }
  return buf;
}

/** Matching object-space normal atlas. RGB is the normal, 128 is flat. */
export function normalBytes(): Uint8Array {
  const w = TRIM;
  const buf = new Uint8Array(w * w * 4);
  const h = (x: number, y: number): number => {
    const cx = x >= w / 2 ? 1 : 0;
    const cy = y >= w / 2 ? 1 : 0;
    const n = hash(x, y);
    if (cx === 1 && cy === 0) {
      const lx = x % (w / 2);
      const ly = y % (w / 2);
      return (lx % 32 < 2 || ly % 32 < 2 ? 0 : 0.6) + n * 0.15;
    }
    if (cx === 0 && cy === 0) return n * 0.35 + (hash(x * 2, y) > 0.96 ? 0.8 : 0);
    return 0.4 + n * 0.2;
  };
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const hl = h(Math.max(0, x - 1), y);
      const hr = h(Math.min(w - 1, x + 1), y);
      const hd = h(x, Math.max(0, y - 1));
      const hu = h(x, Math.min(w - 1, y + 1));
      let nx = hl - hr;
      let ny = hd - hu;
      let nz = 1.6;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      put(buf, w, x, y, (nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255, 255);
    }
  }
  return buf;
}

/** 4×4 symbol sheet. Each symbol fills its cell, so the quad size is the world size. */
export function markBytes(): Uint8Array {
  const buf = new Uint8Array(MARK * MARK * 4);
  const paint = 232;
  const white = () => rect(buf, 0, 0, 0, 64, 64, paint, 228, 210, 235);
  white();
  rect(buf, 1, 0, 0, 64, 64, 238, 234, 220, 245);
  rect(buf, 2, 0, 0, 64, 64, 236, 232, 218, 240);
  const arrow = (index: number, turn: -1 | 0 | 1) => {
    rect(buf, index, 26, 16, 38, 62, paint, 228, 210, 235);
    for (let i = 0; i < 16; i++) {
      const y = i;
      const half = 16 - i;
      const shift = turn * i * 0.85;
      rect(buf, index, Math.round(32 - half + shift), y, Math.round(32 + half + shift), y + 1, paint, 228, 210, 235);
    }
    if (turn !== 0) {
      for (let i = 0; i < 18; i++) {
        const x = 32 + turn * (6 + i);
        rect(buf, index, x, 14, x + 1, 26, paint, 228, 210, 220);
      }
    }
  };
  arrow(3, 0);
  arrow(4, -1);
  arrow(5, 1);
  rect(buf, 6, 18, 0, 28, 64, 196, 154, 42, 235);
  rect(buf, 6, 36, 0, 46, 64, 196, 154, 42, 235);
  for (let y = 4; y < 60; y++) for (let x = 4; x < 60; x++) {
    const dx = x - 32, dy = y - 32;
    const d = Math.hypot(dx, dy);
    if (d > 28 || d < 10) continue;
    const dark = Math.sin(Math.atan2(dy, dx) * 6) > 0.15;
    rect(buf, 7, x, y, x + 1, y + 1, dark ? 36 : 150, dark ? 36 : 146, dark ? 38 : 138, 235);
  }
  for (let x = 2; x < 62; x += 8) rect(buf, 8, x, 8, x + 3, 56, 28, 30, 32, 230);
  rect(buf, 9, 0, 0, 64, 64, 16, 16, 17, 220);
  return buf;
}

function drawPhrase(buf: Uint8Array, index: number, text: string): void {
  const col = index % 4;
  const row = Math.floor(index / 4);
  const ox = col * 128;
  const oy = row * 64;
  const scale = 3;
  const glyph = 6 * scale;
  const width = text.length * glyph - scale;
  let pen = ox + Math.max(2, Math.floor((128 - width) / 2));
  const top = oy + Math.floor((64 - 7 * scale) / 2);
  for (const ch of text) {
    const rows = FONT[ch] ?? FONT[' '];
    for (let ry = 0; ry < 7; ry++) {
      const bits = rows[ry] ?? 0;
      for (let rx = 0; rx < 5; rx++) {
        if (((bits >> (4 - rx)) & 1) === 0) continue;
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
          const x = pen + rx * scale + sx;
          const y = top + ry * scale + sy;
          const grime = hash(x, y);
          const a = grime > 0.9 ? 80 : 230;
          put(buf, SIGN_W, x, y, 210, 196, 150, a);
        }
      }
    }
    pen += glyph;
  }
}

/** 4×2 phrase sheet. Invented wording, block letters, no shields. */
export function signBytes(): Uint8Array {
  const buf = new Uint8Array(SIGN_W * SIGN_H * 4);
  SIGN_PHRASES.forEach((phrase, i) => drawPhrase(buf, i, phrase));
  return buf;
}
