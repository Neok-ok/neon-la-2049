# East LA sprawl

The eastern sectors. The polygon is 34.080–34.020 N / 118.229–118.130 W. This folder does not modify Westside, the basin, Long Beach, the Arts District, or the river polyline.

Archetype id: `east-la-sprawl`. `sprawl-dense` stays registered and unused. Westside stays on `westside-sprawl`. The basin stays on `basin-sprawl`.

## Library

`spec.ts` holds the numbers. `archetype.ts` calls `fillSprawlBlock(ctx, EAST_LA_PARAMS)`. `details.ts` and `crowd.ts` call `planSprawl` and `dressSprawl`. The helper is `src/districts/_shared/sprawl/`. Omitted params stay quiet, so Westside and the basin do not inherit these strips.

| Dial | Value |
|---|---|
| Module | 3.4 m |
| Ordinary storeys | 3–12 (10.2–40.8 m) |
| Cap | 60 m. Towers are 13–17 storeys (44.2–57.8 m). Masts stop so roof + mast stays under 66 m. |
| Lots | 18–46 m, gap 1.2 m (the helper default) |
| Lit / tint | 0.24–0.50 / 0.64–0.90, `Style.Sprawl` |
| Strips | Whittier i=−19, a mid arterial i=−10, Cesar Chavez i=−4. Soto j=23, Indiana j=50, Atlantic j=82. |
| Towers | Those same lines, chance 0.2 of one tower. Hall cluster, radius 280 m, chance 0.85 of one or two. Edge blocks get none. |
| Hub | Block i=−5, j=49. Door 34.045743 N, 118.192714 W. |
| Rise | West edge from (34.08, −118.228) to (34.03, −118.229), district on the negative side of that segment, band 640 m, up to +5 storeys toward the cap. |
| Walls | On. Reserved-corridor probe only. |

Street lines are the integer centreline index. A block touches line L when its index is L or L−1. Indices are snapped to the 170 × 95 m grid. `confidence: invented` — the real arterials were snapped onto that grid, and the names are not painted on the signs.

## Street kit

Shared sodium lamps stay on. This id is not in `NO_LAMPS`. Rank 0 is stall awnings and an amber awning lip. Rank 1 (detail scale ≥ 0.45) is an amber pool. Rank 2 (≥ 0.75) is a roof cable, and steam at the hall. Prop caps are 200 / 560 / 1,100 / 1,700. Steam is 2 / 8 / 16 / 28 and also about 0.12 of the tier steam budget. Pools are 10 / 24 / 48 / 72. The detail module rebuilds `seed` with `hash2i`. The worker buffer stores that seed as float32. This district's index is 19.

Signs are atlas cells only, amber, white or red, kind 0, tops under 6.7 m. No venue names.

Crowd share is 0.18 on the market mesh (Westside is 0.14, Hollywood is 0.22). A strip adds a stall-line loop and the yard adds a third, so the same share sits heavier there.

## Hall

POI `east-la-market` is the door, so `at=` lands on the threshold. The yard is fabric: north wings, a back wall, east and west halls, a canopy, tanks and counters. `east-la-counter` is one `buildCorridorRoom` (warmth 0.96, no window, no rides, hum 0, muffle 0.8, stream radius 42 m). Extras are a tile counter, a steel top, an amber pot and four stools. The door faces south into the yard.

`east-la-coil` (coil-vendor, 8 × 12 m, amber) and `east-la-glyph` (glyph-loop, 9 × 11 m, amber) sit south of the door. Both are `registerHologram`. No new design.

## Traffic

`lanes.ts` is imported from `src/vehicles/traffic-index.ts`. One lattice, `east-la-streets`: bearing 0, blocks 170 × 95, nodes i −22…20 and j 13…112, prefix `el`, kind `street`, lane **5.1 m**. JSON `traffic` stays 0.26. That is about 6 / 10 / 17 street cars on medium / high / ultra (`round(22 × 0.26)`, `round(40 × 0.26)`, `round(64 × 0.26)`). The weight was already the light band, so it was left alone. Low tier is this route's own streak cap.

The mix is cars and about one van in five (chance 0.2). A market spine (east-west edge whose node `i` is a strip line, or north-south edge whose node `j` is, length at least 80 m) also rolls a box truck at chance 0.1. No tankers and no haulers. Edges are 95–170 m, so the short-edge van fallback does not fire. No ramps. Nodes are not shared with the basin, Long Beach, the Arts District, or a freeway chain.

Spinners are not skipped. A graph park is ground + 74 m or + 112 m, ±11 m off the centreline. The tallest mass is 57.8 m and a mast stops under 66 m, so the belly stays above the roof. The ambient 55–90 m band can still cross a roof the same way it crosses any fabric under 90 m outside the skipped districts. The LAX floor is unchanged.

## Interchanges

`interchange.ts` builds one city-wide group, `east-la-interchange`, where the 5 and the 710 cross the sunk 10 inside this polygon. Two draws: a wet concrete mesh and an additive lamp mesh. Slab top is grade + 0.22 m, thickness 0.58 m, width 16 m, length 108 m. Connector ribbons use a 46 m radius and stay inside the 32 m ground cut. Columns stand in the I-10 trench. The 5 and the 710 stay on-grade streaks at grade + 0.28 m, just above the slab. They were not sunk. No landmark reserve was added on the centreline, because that gaps the trench. Nothing was added to the traffic graph. `confidence: invented` — the deck height and the ribbon radius are not in the row.

## Air

Neon wetness is 0.4 below 40 m. Street fog stays 0. Far-LOD `east-la-sprawl` is lights 0.78 and neon 0.38. Basin stays 0.52 / 0.16. Westside stays 1 / 0.35. Hollywood stays 1 / 0.86. `sprawl-dense` stays 1 / 0.35 and is unused. The ground-light shader is unchanged. A kilometre aerial is the ground-light carpet (`warmC`).

The street uses `Ambience.setTraffic`. The crossings add a tail on `Ambience.setMachinery` (up to 0.36, 320 m falloff, gone above 80 m). Within 48 m of the hall and below 28 m, the existing market murmur pans to the yard. No new audio node.

Ground above 45 m (the Montebello overlap on the east edge) stays `hills-sparse`. The planner, the dresser and the camera search return empty there.

## Cameras

`__nla.eastLaView('aerial'|'interchange'|'market'|'river'|'interior'|'street'|'deck')`.

`aerial` is about 1 km up over the 10/710. `interchange` stands on the nearest open street node. `deck` is a low fly over the same junction. `market` stands at a stall. `river` looks west toward downtown from the east bank. `interior` stands at the counter.

## Known gaps

The 5 and the 710 stay on-grade streaks. The decks are static and there is no traffic-graph ramp. The 60, the 605 and the 91 are still absent. The US-101 trench was not recut. The LA River polyline was not recut. Wallace priority 2 still owns the southern overlap. Arts priority 3 still owns the river overlap. Ambient spinners in the 55–90 m band are not lifted. The Montebello ground above 45 m stays `hills-sparse`.
