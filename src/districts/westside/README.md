# Westside sprawl

Mid-Wilshire through Culver. The polygon is 34.09–33.99 N / 118.48–118.27 W. This folder does not modify East LA, the basin default, downtown, or the hills.

Archetype id: `westside-sprawl`. `sprawl-dense` stays registered because `east-la` still uses it.

## Library

`spec.ts` holds the numbers. `archetype.ts` calls `fillSprawlBlock(ctx, WESTSIDE_PARAMS)`. `details.ts` calls `planSprawl` and `dressSprawl`. The helper is `src/districts/_shared/sprawl/`. It does not call `buildMegablock`. Omitted params stay quiet, so Stage 14 can reuse it without inheriting these strips.

| Dial | Value |
|---|---|
| Module | 3.4 m |
| Ordinary storeys | 3–12 (10.2–40.8 m) |
| Cap | 60 m. Towers are 13–17 storeys (44.2–57.8 m). Masts stop so roof + mast stays under 66 m. |
| Lots | 18–46 m, gap 1.2 m (the helper default) |
| Lit / tint | 0.16–0.38 / 0.58–0.80, `Style.Sprawl` |
| Strips | Santa Monica Blvd (Beverly Hills) i=12, Wilshire i=6, Olympic i=2, Pico i=−3, Venice i=−7. Vermont j=−44, Western j=−60, La Brea j=−93, Fairfax j=−109, La Cienega j=−123. |
| Towers | Wilshire line only, chance 0.16 of one tower. Century City cluster at 34.0586 N, 118.4176 W, radius 380 m, chance 0.85 of one or two. Edge blocks get none. |
| Hub | The block that contains 34.0434 N, 118.4215 W. A former park, not branded. |
| Rise | East edge from (34.08, −118.27) to (34.04, −118.276), district on the positive side, band 780 m, up to +5 storeys toward the cap. |
| Walls | On. Reserved-corridor probe only. |

Street lines are the integer centreline index. A block touches line L when its index is L or L−1. Indices are snapped to the 190 × 100 m grid. `confidence: invented` — the real arterials were snapped onto that grid, and the names are not painted on the signs.

## Street kit

Shared sodium lamps stay on. This id is not in `NO_LAMPS`. Rank 0 is stall awnings and an amber awning lip. Rank 1 (detail scale ≥ 0.45) is an amber pool and an occasional bin. Rank 2 (≥ 0.75) is a roof cable, and steam at the yard. Prop caps are 220 / 640 / 1,400 / 2,200. Steam is 4 / 12 / 24 / 40 and also about 0.15 of the tier steam budget. Pools are 12 / 28 / 56 / 90. Low tier keeps fabric, signs, rank-0 props and traffic streaks.

Signs are atlas cells only (`OPEN LATE`, `NIGHT MARKET`, `COUNTER`, `HOT BROTH`, `VENDING`, `EAT HERE`, `2049`, `MARKET`), amber, white or red, kind 0, tops under 6.7 m. No venue names.

Crowd share is 0.14 on the market mesh (South LA is 0.20, Lakewood is 0.12). A strip adds a stall-line loop and the yard adds a third, so the same share sits heavier there.

## Traffic

`lanes.ts` is imported from `src/vehicles/traffic-index.ts`. One lattice, `westside-streets`: bearing 0, blocks 190 × 100, nodes i −37…22 and j −218…−24, prefix `ws`, kind `street`, lane **5.4 m**. JSON `traffic` stays 0.22. That is about 5 / 9 / 14 street cars on medium / high / ultra. Low tier is this route's own streak cap.

The mix is cars and about one van in five (chance 0.18). No box trucks and no haulers. No ramps. Nodes are not shared with the avenues, Broadway, Lakewood, South LA, the Arts District, or a freeway chain.

Spinners are not skipped. A graph park is ground + 74 m or + 112 m, ±11 m off the centreline. The tallest mass is 57.8 m and a mast stops under 66 m, so the belly (about 74.3 m) stays above the roof even where the offset crosses the building line. The ambient 55–90 m band can still cross a roof the same way it crosses any fabric under 90 m outside the skipped districts.

## Yard and diner

POI `westside-yard` is the pin, not the block centre. The yard is fabric: north wings with a door, a back wall 8.7 m north of the door, east and west halls, a canopy at 4.4 m, tanks and counters. `westside-diner` is one `buildCorridorRoom` (warmth 0.94, no window, no rides, hum 0, muffle 0.82, stream radius 42 m). Extras are a wood counter, an amber grill and four stools. The door faces south into the yard.

## Air

No new fog, light or audio path. Below the district match, `App.ts` keeps neon wetness 0.22 and street fog 0. Far-LOD `westside-sprawl` copies the existing `sprawl-dense` pair (lights 1, neon 0.35) so the amber carpet (`warmC`) does not change. Basin is 0.52 / 0.16. Up close the amber is the shared sodium lamps, the awning lips and `Style.Sprawl` warmth 0.8.

Ground above 45 m (the Baldwin Hills overlap) stays `hills-sparse`. The planner, the dresser and the camera search return empty there.

## Cameras

`__nla.westsideView('aerial'|'street'|'strip'|'roof'|'freeway'|'interior'|'hub'|'towers')`.

`aerial` is about 1.1 km up near 34.05 N, 118.37 W. `freeway` stands on the I-10 lip near the yard. `towers` is the Century City cluster, the heavy street shot. `interior` stands at the counter.

## Known gaps

The 405 along the west edge is far streaks only, not a trench, so the wall there is the reserve probe without a cut. Vermont and Western leave the polygon along the south edge. Ambient spinners in the 55–90 m band are not lifted. East LA is still the Stage 1 `sprawl-dense` blockout.
