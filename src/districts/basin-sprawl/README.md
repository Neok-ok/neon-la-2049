# Basin sprawl

The default district: every land point that is not inside a named polygon. This folder does not add a polygon, and it does not modify Westside, East LA, downtown, or the hills swap.

Archetype id: `basin-sprawl`. The Stage 1 blockout for this id is gone. `sprawl-dense` stays registered because `east-la` still uses it. `westside` stays on `westside-sprawl`.

## Library

`spec.ts` holds the numbers. `archetype.ts` calls `fillSprawlBlock(ctx, BASIN_PARAMS)`. `details.ts` calls `planSprawl` and `dressSprawl`. The helper is `src/districts/_shared/sprawl/`. It does not call `buildMegablock`. Towers, the hub, the rise and the freeway wall are omitted, so they stay off.

| Dial | Value |
|---|---|
| Module | 3.4 m |
| Storeys | 2–10 (6.8–34.0 m) |
| Cap | 35 m. A mast stops so roof + mast stays under 66 m, which on these roofs is about 45 m. |
| Lots | 18–46 m, gap 1.2 m (the helper default) |
| Lit / tint | 0.08–0.22 / 0.42–0.64, `Style.Sprawl` |
| Strips | Ventura i=61, Colorado i=57, Century i=−66, Florence i=−48. Van Nuys j=−199, Sepulveda j=−216, Fair Oaks j=91, Rosemead j=166, La Brea j=−106. |
| Towers, hub, rise, walls | Off. The row does not ask for them. |

Street lines are the integer centreline index. A block touches line L when its index is L or L−1. Indices are snapped to the 180 × 95 m grid. `confidence: invented` — the real arterials were snapped onto that grid, and the names are not painted on the signs.

Generation stays the existing per-chunk path. The basin is never built in one LOD0 pass. Ground above 45 m still swaps to `hills-sparse` before this archetype runs. The planner and the dresser return empty there too.

## Street kit

Shared sodium lamps stay on. This id is not in `NO_LAMPS`. Rank 0 is stall awnings and an amber awning lip. Rank 1 (detail scale ≥ 0.45) is an amber pool and an occasional bin. Rank 2 (≥ 0.75) is a roof cable. Prop caps per 500 m chunk are 160 / 480 / 1,000 / 1,600. Steam is 0 / 4 / 8 / 12 and also about 0.08 of the tier steam budget. There is no yard, so the steam list stays empty. Pools are 8 / 18 / 36 / 56. Low tier keeps fabric, signs, rank-0 props and traffic streaks.

Signs are atlas cells only (`OPEN LATE`, `NIGHT MARKET`, `COUNTER`, `HOT BROTH`, `VENDING`, `EAT HERE`, `2049`, `MARKET`), amber, white or red, kind 0, tops under 6.7 m. No venue names.

Crowd share is 0.07 on the market mesh (Westside is 0.14, Lakewood is 0.12). A strip adds a stall-line loop, so the same share sits heavier there.

## Traffic

`lanes.ts` is imported from `src/vehicles/traffic-index.ts`. One lattice, `basin-streets`: bearing 0, blocks 180 × 95, nodes i −230…68 and j −347…190, prefix `bs`, kind `street`, lane **5.1 m**. JSON `traffic` stays 0.2. That is about 4 / 8 / 13 street cars on medium / high / ultra. Low tier is this route's own streak cap (about 7,000 dashes).

The mix is cars and about one van in eight (chance 0.12). No box trucks and no haulers. No ramps. Nodes are not shared with the avenues, Broadway, Lakewood, South LA, the Arts District, Westside, or a freeway chain. Edges outside this district, in the ocean, or inside a reserve are dropped.

Edge picks, the nearest-edge query and signal reads use 500 m spatial bins. Signal poles and heads are a 768-slot buffer. Only heads within 500 m are submitted.

Spinners are not skipped. A graph park is ground + 74 m or + 112 m, ±11 m off the centreline. The tallest mass is 34 m and a mast stops under 66 m, so the belly stays above the roof.

## Pin

POI `basin-strip` is the snapped crossing of Century Blvd and La Brea Ave (33.944761 N, 118.352882 W). It is a camera pin, not a block centre and not a venue name.

## Air

No new fog, light or audio path. Below the district match, `App.ts` keeps neon wetness 0.22 and street fog 0. Far-LOD `basin-sprawl` is lights **0.52** and street neon **0.16**. `westside-sprawl` stays 1 / 0.35. The ground-light shader is unchanged, so the carpet hue is still `warmC`. Neon reflection fades by about 140–520 m, so a 1 km aerial is the ground-light value. `confidence: invented` — 0.52 is under Westside and just under South LA (0.62), and above the hills (0.15). 0.16 is under Westside's 0.35 and a small step above South LA's 0.10.

Up close the amber is the shared sodium lamps, the darker window lit range, and `Style.Sprawl` warmth 0.8.

## Cameras

`__nla.basinView('aerial'|'street'|'strip'|'roof'|'seam-west'|'seam-south'|'seam-lake'|'seam-arts'|'seam-dtla')`.

`aerial` is about 1 km up over the Century / La Brea pin. The seam cameras match the before shots: eye about 1 km up, looking across the boundary with Westside, South LA, the Lakewood east edge, the Arts District south gap, and downtown's north edge.

## Known gaps

The 405, 5, 105 and 710 are still far streaks, not trenches, and this stage adds no freeway wall. The 605 and the 91 are still absent from `city-layout.json`. Ambient spinners in the 55–90 m band are not lifted. East LA is still the Stage 1 `sprawl-dense` blockout. Valley floor above 45 m stays `hills-sparse`, so those blocks are not this low-rise grid. There is no interior.
