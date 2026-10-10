# Southeast Refinery Belt

Sector 4 industrial flats east of the old pyramids. District id `southeast-industrial`. Archetype id `southeast-refinery`. The Stage 1 body `industrial` stays registered and unused. South Bay is `south-bay-refinery`. The pyramid meshes are landmarks of type `old-pyramid`, not this archetype.

The polygon, the bearing 0 grid, the 260 × 170 m blocks and the 26 m streets are the Stage 1 entry.

## Kit

`src/districts/_shared/refinery/` is the shared planner. Every flag defaults off. This district passes `SOUTHEAST_PARAMS` in `spec.ts`. Stage 18 calls `planRefinery` and `mountRefineryFlames` with `SOUTH_BAY_PARAMS` and archetype `south-bay-refinery`. It does not point `south-bay-refineries` at `southeast-refinery`. `industrial` stays registered and unused.

The Arts District keeps its own pipe racks. This kit does not edit that plan.

`details.ts` rebuilds the block seed. The worker ships it as a float32, and the rounded value changes the yard kind, so the cylinders would not sit on the berm. Stage 18's detail module recomputes the same `hash2i` before it calls the kit.

A block is a tank farm (share 0.40), a cracking yard (0.22), a pipe canyon (0.20), or a shed. About one tank farm or pipe block in five also grows a flare. Cracking yards always do. Edge racks sit on the owned north edge of other blocks (chance 0.62).

Invented heights, recorded in the Bible: flare stacks 84–140 m, cracking columns 32–58 m, tanks 14–22 m across and 12–20 m tall, a catwalk ring at 0.78 of the tank height, a 1.5 m berm, pipe decks at 7.4 m with extra tiers 0.62 m apart. The pump house is 10.2 m, three storeys of the 3.4 m module. Yard signs are existing atlas cells only (`BLACK OIL`, hanzi `STEAM`, `2049`, kana `STEAM`), about one block in twelve. No company names.

## Flames

`field.ts` mounts one city-wide sprite mesh (`southeast-flares`). It flickers, shears with the weather wind, and grows with distance so a stack still reads from downtown and from a kilometre up. `setRefineryFlame` writes the tier gain and the wind. The close spill is a rank-0 additive quad in the chunk kit, not a scene light. Far-LOD ground lights for `southeast-refinery` are 0.9 and street neon is 0.18. Basin stays 0.52 / 0.16. Westside stays 1 / 0.35. `industrial` stays 0.35 / 0.1 and unused. South Bay is 0.72 / 0.12.

## Interior

`southeast-pump` is one `buildCorridorRoom` on the block that contains 34.010527 N / 118.172738 W (i = −18, j = 38). Warmth 0.46, no window, no rides, no scene lights. The door faces south. POI `southeast-pump` is that threshold, so `at=southeast-pump` lands on it.

## Traffic

`lanes.ts` registers `southeast-streets` (prefix `se`, lane 6.6 m, no ramps, no shared nodes). The mix is box trucks and tankers. JSON `traffic` is 0.32. Spinners skip this district the way they skip the Arts District: a 6.6 m lane would park them at 74 m and 112 m, inside the stacks. `southeast-freight` is one open sky lane at ground + 188 m on grid line j = 62, east of both pyramid reserves. Basin is not skipped.

## Cameras

`__nla.southeastView('aerial'|'flare'|'tanks'|'pipes'|'street'|'interior'|'downtown')`.

Crowd share is 0.04, loops on the south sidewalk. Shared sodium lamps stay on. Audio reuses `Ambience.setMachinery` at 0.5 below 110 m. Ground above 45 m stays `hills-sparse`. The LA River is not recut.
