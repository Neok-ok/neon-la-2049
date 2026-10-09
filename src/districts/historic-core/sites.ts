// Named Broadway fronts. Positions are the real street (even numbers east, odd west),
// snapped onto the 38° grid. Widths and heights that are published are marked in the comment.
// The rest is storey-count and lot reasoning. No venue name is painted on a sign.
import type { HeritageCrown, HeritageFamily } from '../_shared/heritage/build';

export interface TheatreSite {
  id: string;
  /** East is block j = −3 (face b−). West is j = −4 (face b+). */
  side: 'east' | 'west';
  /** Grid s of the bay centre, metres. */
  s: number;
  width: number;
  depth: number;
  frontH: number;
  height: number;
  family: HeritageFamily;
  wrap: number;
  marquee: boolean;
  door: number;
  crown: HeritageCrown;
  blades: number;
  billboard: boolean;
}

export const SITES: TheatreSite[] = [
  // 304 S Broadway. Romanesque / Chicago front, five storeys. The building itself is the landmark.
  // East, ~518. Marquee house, low wrap so the old bay still owns the sidewalk.
  { id: 'roxie', side: 'east', s: -811, width: 14, depth: 14, frontH: 16, height: 22, family: 'marquee', wrap: 0.25, marquee: true, door: 4.2, crown: 'none', blades: 3, billboard: false },
  // East, ~534. Same block as the one above; centres 32 m apart.
  { id: 'arcade', side: 'east', s: -843, width: 14, depth: 14, frontH: 15, height: 20, family: 'marquee', wrap: 0.2, marquee: true, door: 4, crown: 'none', blades: 3, billboard: false },
  // 307, across from the Bradbury. Twelve storeys read as a baroque base under a later slab.
  { id: 'million', side: 'west', s: -387, width: 30, depth: 16, frontH: 18, height: 48, family: 'baroque', wrap: 0.55, marquee: true, door: 6, crown: 'pediment', blades: 4, billboard: false },
  // East, ~630. Beaux-arts front, partial jacket.
  { id: 'palace', side: 'east', s: -1036, width: 22, depth: 16, frontH: 24, height: 36, family: 'beaux', wrap: 0.45, marquee: true, door: 5, crown: 'pediment', blades: 4, billboard: false },
  // 615. Published pin. French-baroque front, not a tower. Height is the storey read.
  { id: 'la-theatre', side: 'west', s: -1005.9, width: 24, depth: 16, frontH: 26, height: 32, family: 'baroque', wrap: 0.35, marquee: true, door: 5.5, crown: 'pediment', blades: 3, billboard: false },
  // West, ~703.
  { id: 'state', side: 'west', s: -1182, width: 20, depth: 15, frontH: 20, height: 30, family: 'beaux', wrap: 0.5, marquee: true, door: 5, crown: 'none', blades: 3, billboard: false },
  // East, ~744.
  { id: 'globe', side: 'east', s: -1265, width: 16, depth: 14, frontH: 18, height: 24, family: 'marquee', wrap: 0.3, marquee: true, door: 4.2, crown: 'none', blades: 3, billboard: false },
  // 800. Published frontage about 15 × 46 m; the block is only 52 m deep, so depth stops at 16.
  // Height (~8 storeys) is invented. Deco steps.
  { id: 'tower', side: 'east', s: -1379, width: 15, depth: 16, frontH: 26, height: 34, family: 'deco', wrap: 0.2, marquee: true, door: 4.2, crown: 'steps', blades: 4, billboard: false },
  // 842. Published pin. Beaux-arts, jacket climbing past the cornice. Height invented, inside 40–110.
  { id: 'orpheum', side: 'east', s: -1487.8, width: 26, depth: 16, frontH: 32, height: 54, family: 'beaux', wrap: 0.55, marquee: true, door: 6, crown: 'pediment', blades: 4, billboard: true },
  // 849. Real roof 264 ft (80.5 m). Nudged ~27 m south of the raw address line so the bay sits in a block, not in the cross street.
  { id: 'eastern', side: 'east', s: -1572, width: 28, depth: 18, frontH: 64, height: 80.5, family: 'deco', wrap: 0.35, marquee: true, door: 5.2, crown: 'clock', blades: 5, billboard: true },
  // 929. Published pin. Real roof 73.76 m. Gothic shaft, a short spire, heavy side jackets. No house name on the signs.
  { id: 'united', side: 'west', s: -1684.5, width: 22, depth: 16, frontH: 58, height: 74, family: 'gothic', wrap: 0.45, marquee: true, door: 5, crown: 'spire', blades: 4, billboard: true },
];
