// Shared refinery kit. Every flag defaults off so importing this module builds nothing.
// Stage 15 (southeast-industrial) and Stage 18 (south-bay-refineries) pass their own params.

export interface RefineryParams {
  /** Instanced tank farms with a berm and a catwalk ring. */
  tanks?: boolean;
  /** Pipe racks on the owned north edge, and a denser rack on pipe blocks. */
  racks?: boolean;
  /** Distillation / cracking columns. */
  towers?: boolean;
  /** Flare stacks. The flame sprites are a separate mount; this only places the stack. */
  flares?: boolean;
  /** One control-room shell. The district sets this on a single block. */
  pump?: boolean;
  /**
   * Share of ordinary blocks that are tank farms, when `tanks` is on.
   * Omitted → 0.40.
   */
  tankShare?: number;
  /** Share that are cracking yards, when `towers` is on. Omitted → 0.22. */
  towerShare?: number;
  /** Share that are pipe-rack canyons, when `racks` is on. Omitted → 0.20. */
  pipeShare?: number;
  /** Of the remaining blocks, chance of a north-edge rack. Omitted → 0.62 when `racks` is on. */
  rackOnEdge?: number;
  /** Chance a tank farm or a pipe block also grows a flare, when `flares` is on. */
  flareOnYard?: number;
  /** Flare stack height band, metres. Omitted → 84–140. */
  stack?: [number, number];
  /** Cracking-column height band, metres. Omitted → 32–58. */
  tower?: [number, number];
  /** South face of the pump house, block-local metres along A. Omitted → −58. */
  doorS?: number;
  /** Coastal storage spheres. Omitted → off, and the block roll stays the Stage 15 cuts. */
  spheres?: boolean;
  /** Share of ordinary blocks that are sphere farms, when `spheres` is on. Omitted → 0.18. */
  sphereShare?: number;
  /** Sphere diameter band, metres. Omitted → 16.8–25.2 (4–6 × 4.2 m). */
  sphere?: [number, number];
  /**
   * Short loading pier toward the nearest sea wall.
   * Emitted only when the walk stays in the block's district, out of the ocean,
   * and actually reaches the wall corridor. Omitted → off.
   */
  jetty?: boolean;
  /** Pump-house roof, metres. Omitted → 10.2 (3 × 3.4 m). */
  pumpH?: number;
  /**
   * Snap cracking columns and flare stacks to this many metres.
   * Omitted → 0, and the height stays the continuous range Stage 15 uses.
   */
  module?: number;
  /**
   * Drop a piece whose world point fails this test.
   * Omitted → no extra keep-out. A reserve of 0 does not do this by itself.
   */
  keepOut?: (x: number, z: number) => boolean;
}

export interface ResolvedRefinery {
  tanks: boolean;
  racks: boolean;
  towers: boolean;
  flares: boolean;
  pump: boolean;
  tankShare: number;
  towerShare: number;
  pipeShare: number;
  rackOnEdge: number;
  flareOnYard: number;
  stack: [number, number];
  tower: [number, number];
  doorS: number;
  spheres: boolean;
  sphereShare: number;
  sphere: [number, number];
  jetty: boolean;
  pumpH: number;
  module: number;
  keepOut: ((x: number, z: number) => boolean) | null;
}

export const REFINERY_OFF: ResolvedRefinery = {
  tanks: false,
  racks: false,
  towers: false,
  flares: false,
  pump: false,
  tankShare: 0,
  towerShare: 0,
  pipeShare: 0,
  rackOnEdge: 0,
  flareOnYard: 0,
  stack: [84, 140],
  tower: [32, 58],
  doorS: -58,
  spheres: false,
  sphereShare: 0,
  sphere: [16.8, 25.2],
  jetty: false,
  pumpH: 10.2,
  module: 0,
  keepOut: null,
};

export function resolveRefinery(p: RefineryParams = {}): ResolvedRefinery {
  const tanks = p.tanks === true;
  const racks = p.racks === true;
  const towers = p.towers === true;
  const flares = p.flares === true;
  const spheres = p.spheres === true;
  return {
    tanks,
    racks,
    towers,
    flares,
    pump: p.pump === true,
    tankShare: tanks ? (p.tankShare ?? 0.4) : 0,
    towerShare: towers ? (p.towerShare ?? 0.22) : 0,
    pipeShare: racks ? (p.pipeShare ?? 0.2) : 0,
    rackOnEdge: racks ? (p.rackOnEdge ?? 0.62) : 0,
    flareOnYard: flares ? (p.flareOnYard ?? 0.22) : 0,
    stack: p.stack ?? [84, 140],
    tower: p.tower ?? [32, 58],
    doorS: p.doorS ?? -58,
    spheres,
    sphereShare: spheres ? (p.sphereShare ?? 0.18) : 0,
    sphere: p.sphere ?? [16.8, 25.2],
    jetty: p.jetty === true,
    pumpH: p.pumpH ?? 10.2,
    module: p.module ?? 0,
    keepOut: p.keepOut ?? null,
  };
}

/** True when every feature flag is off. The planner returns an empty block. */
export function refineryDormant(p: ResolvedRefinery): boolean {
  return !p.tanks && !p.racks && !p.towers && !p.flares && !p.pump && !p.spheres && !p.jetty;
}
