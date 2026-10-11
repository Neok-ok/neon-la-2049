// Byte estimates for GPU resources. Format ids match three.js constants so callers
// can pass texture.format / texture.type without importing them here.

const RGBA = 1023;
const RGB = 1022;
const RG = 1030;
const RED = 1028;
const BYTE = 1009;
const HALF = 1016;
const FLOAT = 1015;
const UINT = 1014;

export interface AttrLike {
  array?: { byteLength: number } | null;
}

export interface GeoLike {
  attributes?: Record<string, AttrLike | undefined>;
  index?: AttrLike | null;
  morphAttributes?: Record<string, AttrLike[] | undefined>;
}

export function geometryBytes(g: GeoLike): number {
  let n = 0;
  const attrs = g.attributes ?? {};
  for (const key in attrs) {
    const attr = attrs[key];
    if (attr?.array?.byteLength) n += attr.array.byteLength;
  }
  if (g.index?.array?.byteLength) n += g.index.array.byteLength;
  const morph = g.morphAttributes ?? {};
  for (const key in morph) {
    const list = morph[key] ?? [];
    for (const attr of list) if (attr?.array?.byteLength) n += attr.array.byteLength;
  }
  return n;
}

function components(format: number): number {
  if (format === RGB) return 3;
  if (format === RG) return 2;
  if (format === RED) return 1;
  return 4;
}

function typeBytes(type: number): number {
  if (type === HALF) return 2;
  if (type === FLOAT || type === UINT) return 4;
  return 1;
}

/**
 * Uncompressed level size. Unknown formats fall back to RGBA8, which is the
 * conservative side for a budget (we would rather evict early).
 */
export function texelBytes(width: number, height: number, format = RGBA, type = BYTE): number {
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  return w * h * components(format || RGBA) * typeBytes(type || BYTE);
}

/** Full mip chain is about 4/3 of the base. `levels` includes the base. */
export function mipChainBytes(base: number, levels: number): number {
  const n = Math.max(1, levels);
  let sum = 0;
  let level = base;
  for (let i = 0; i < n; i++) {
    sum += level;
    level = Math.max(1, level >> 2);
  }
  return sum;
}

export interface TexLevel {
  width?: number;
  height?: number;
  data?: { byteLength: number } | null;
}

/** Prefer the encoded byte length (KTX2/Basis). Otherwise estimate RGBA and mips. */
export function textureBytes(image: TexLevel | null | undefined, mipmaps: TexLevel[] | null | undefined, format: number, type: number): number {
  let n = 0;
  const add = (level: TexLevel | null | undefined, useEstimate: boolean) => {
    if (!level) return;
    if (level.data?.byteLength) n += level.data.byteLength;
    else if (useEstimate && level.width && level.height) n += texelBytes(level.width, level.height, format, type);
  };
  add(image, true);
  if (mipmaps) for (const level of mipmaps) add(level, false);
  return n;
}

/** Colour buffer plus a depth buffer. `samples` is MSAA. `bloom` multiplies extra targets. */
export function renderTargetBytes(width: number, height: number, samples = 1, bloom = 1): number {
  const px = Math.max(1, width) * Math.max(1, height);
  const color = px * 4 * Math.max(1, samples) * Math.max(1, bloom);
  const depth = px * 4;
  return color + depth;
}
