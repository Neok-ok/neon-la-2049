// Pure module (worker-safe). Data types produced by the procedural city fabric.
import type { District, CityLayout } from '../layout';
import type { Rng } from '../../core/rng';

/** Facade style ids. Index into the per-style tables in src/world/materials/cityMaterial.ts. */
export const Style = {
  Ground: 0,
  Megablock: 1,
  Office: 2,
  Industrial: 3,
  Market: 4,
  Coastal: 5,
  Residential: 6,
  Civic: 7,
  Sprawl: 8,
  Neon: 9,
  /** Flat stained wall, no windows. Interiors, counters, shutters. */
  Solid: 10,
} as const;
export type StyleId = (typeof Style)[keyof typeof Style];

/** Detail tier: 0 = main mass (every LOD), 1 = secondary (LOD0-1), 2 = clutter (LOD0 only). */
export type Detail = 0 | 1 | 2;

export interface Box {
  x: number;
  z: number;
  /** size along the block's B axis (box local X) */
  w: number;
  /** size along the block's A axis (box local Z) */
  d: number;
  h: number;
  yaw: number;
  y0: number;
  style: StyleId;
  seed: number;
  detail: Detail;
  /** fraction of windows lit at night, 0..1 */
  lit: number;
  /** albedo multiplier, ~0.6..1.4 */
  tint: number;
}

/** Sign palette ids. Must match SIGN_PALETTE in src/world/materials/signMaterial.ts. */
export const SignColor = {
  Pink: 0,
  Cyan: 1,
  Amber: 2,
  Red: 3,
  Teal: 4,
  Violet: 5,
  White: 6,
  Yellow: 7,
} as const;

/** 0 = flat wall sign, 1 = vertical blade sign (perpendicular to facade), 2 = giant billboard/hologram panel */
export type SignKind = 0 | 1 | 2;

export interface Sign {
  x: number;
  y: number;
  z: number;
  yaw: number;
  w: number;
  h: number;
  color: number;
  seed: number;
  kind: SignKind;
}

export interface BlockInfo {
  district: District;
  archetype: string;
  i: number;
  j: number;
  cx: number;
  cz: number;
  /** unit vector of grid axis A (along bearing) */
  ax: number;
  az: number;
  /** unit vector of grid axis B (bearing + 90) */
  bx: number;
  bz: number;
  /** usable block length along A / B (block minus street) */
  la: number;
  lb: number;
  street: number;
  yaw: number;
  seed: number;
  ground: number;
}

export interface LotRect {
  s: number; // center along A
  t: number; // center along B
  la: number;
  lb: number;
}

export type FaceDir = 'a+' | 'a-' | 'b+' | 'b-';

export interface BoxOpts {
  style: StyleId;
  detail?: Detail;
  lit?: number;
  tint?: number;
  /** base height above block ground */
  base?: number;
}

/** API handed to archetype functions. Coordinates (s, t) are block-local meters along A/B from the block center. */
export interface FabricCtx {
  readonly layout: CityLayout;
  readonly block: BlockInfo;
  readonly rng: Rng;
  toWorld(s: number, t: number): [number, number];
  /** Recursively split the block into lots. */
  lots(minLot: number, maxLot: number, gap: number): LotRect[];
  /** Emits a box centered at (s, t); lb = size along B, la = size along A. Returns the box or null if reserved. */
  box(s: number, t: number, lb: number, la: number, h: number, opts: BoxOpts): Box | null;
  /** Sign mounted on a face of a box-shaped volume centered at (s,t) with half sizes (hb, ha). */
  sign(
    s: number,
    t: number,
    hb: number,
    ha: number,
    face: FaceDir,
    along: number,
    y: number,
    w: number,
    h: number,
    color: number,
    kind: SignKind,
    /** Overrides the random seed so a sign can target a known atlas cell. */
    seed?: number,
  ): void;
}

export type ArchetypeFn = (ctx: FabricCtx) => void;

export interface FabricOutput {
  boxes: Box[];
  signs: Sign[];
  blocks: BlockInfo[];
}
