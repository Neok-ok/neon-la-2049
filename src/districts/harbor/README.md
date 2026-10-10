# Harbor and Container Port

San Pedro and the basin behind the harbor sea wall. District id `harbor`. Archetype id `harbor-port`. The Stage 1 body `port` stays registered and unused.

The polygon, the bearing 0 grid, the 300 × 180 m blocks and the 30 m streets are the Stage 1 entry. Priority stays 2, so this polygon wins where it overlaps `long-beach`. The sea-wall polylines are not moved. Sepulveda stays at a 90 m crest. The harbor wall stays at its published 75 m crest.

## Yards

Cranes, hulls, container stacks, slips and work lights are one city-wide set (`field.ts`, `lights.ts`), not chunk meshes, so they still read from the crest and from LAX after far LOD. The walk steps the harbor wall every 240 m and keeps a berth only when the hull and the crane sit in this district, off the 70 m wall reserve, off the freeway and river reserves, and clear of the 30 m streets. Twenty-five gantries and twenty-five hulls pass. The hero quay is the median berth.

Invented heights, snapped to §4: a container is **12 × 2.4 × 2.6 m** (length 3 × 4.0 m, stall height inside 2.4–3.4 m). Stacks are 2–6 high, so **5.2–15.6 m**. Sheds are **15 / 20 / 25 / 30 m** (3–6 × 5.0 m). The boom rail is **70 m** (14 × 5.0 m). The crane house is **80 m** (16 × 5.0 m), the top of the 10–80 m row. A work-light mast is **25 m** (5 × 5.0 m). A hull is **96 × 20 × 20 m** (24 × 4.0 m, beam 4 × 5.0 m, freeboard 4 × 5.0 m from the basin floor). The control shell is **16 × 14 × 15 m** (3 × 5.0 m). Nothing here is over 320 m, so the megatower kit is not used.

The basin floor is the walk ground at y = 0. The slips are dark quads at y = 0.35, landward of the wall. The ocean surface stays at y = 6 and is not the berth. Hulls sit about 150 m landward of the wall centreline. Cranes sit 52 m further landward so the boom covers the deck. `confidence: invented` — the row asks for cranes, stacks and ships behind the wall, and these modules are the §4 bands that keep an 80 m house inside the row.

Yard signs are existing atlas cells only (hanzi `STEAM`, `BLACK OIL`, `2049`), about one shed in five. No port, carrier or company name. Container colours are rust, teal, sand, blue-grey, oxide and dust, with no marks.

`details.ts` rebuilds the block seed with `hash2i(i + 100000, j + 100000, districtIndex * 7919 + 13)`. The worker ships `seed` as a float32. This district's index is 17. Rank 0 is four bollards. Rank 1 (detail scale ≥ 0.45) adds one sodium spill quad. Caps are 80 / 180 / 320 / 480. Shared sodium stays off (`NO_LAMPS` already includes this id).

Blocks whose centre is reserved, ocean, above 45 m, or within 120 m of a crane or 80 m of a hull return empty. The control block emits the door-gapped shell and nothing else. Ground above 45 m stays `hills-sparse`. Owned blocks in this polygon are at grade.

## Light and sound

Work lights are one additive billboard mesh. A mast, a boom tip and a house lamp per crane. The angular floor is the same idea as a refinery flame, so a spark remains from LAX. No new scene light. Far-LOD ground lights for `harbor-port` are **0.64** and street neon is **0.11**. South Bay stays 0.72 / 0.12. LAX stays 0.46 / 0.08. Hollywood stays 1 / 0.86. The belt stays 0.9 / 0.18. Basin stays 0.52 / 0.16. Westside stays 1 / 0.35. `port` stays 0.4 / 0.1 and unused. The ground-light shader is unchanged.

Trolleys travel the boom on a slow sine. Near hulls swap to a single box past about 1.4 km.

Audio reuses `Ambience.setMachinery`: 0.46 below 110 m inside the polygon, and outside a tail of 0.28 e^(−d / 4200) from the control door, fading by 150 m of altitude, added to the launch rumble and the South Bay hum and clamped to 1. Surf stays the coast call. The harbor wall is already in that nearest-wall search. No new audio node. Street fog is 0.46 below 90 m, scaled by the same tier factors as South Bay (low 0.35, medium 0.6, high 0.85, ultra 1). Neon wetness is 0.14 below 55 m.

## Interior and holograms

`harbor-control` is one `buildCorridorRoom` on the landward side of the hero crane (33.756014 N / 118.196393 W). The door faces north (yaw π). Warmth 0.32, corridor 3.4 × 2.2 × 3.2 m, room 6.4 × 5.4 × 3.6 m, no window, no rides, stream radius 48 m, muffle 0.7, hum 0.24. POI `harbor-control` is that threshold, so `at=harbor-control` lands on it.

`harbor-glyph` is glyph-loop, amber, 12 × 16 m, street band, rank 0. `harbor-courier` is ash-crane, cyan, 14 × 20 m, tower band, rank 1. Both sit just outside the door. The glyphs are noise. The figure is the existing Ash Line courier, not a carrier mark. No new design.

## Traffic

`lanes.ts` registers `harbor-streets` (prefix `hb`, lane 7.5 m, nodes i −123…−94 and j −29…47, no ramps, no shared nodes). The mix is haulers (about 0.74) and box trucks. JSON `traffic` is 0.36, so medium shows about eight vehicles. Edges are 180–300 m, so the short-edge van fallback does not fire. Spinners skip this district on the roof band (spawn 158–210 m or 240–420 m, lift under ground + 155 m) because an 80 m house enters the 74 m park. They do not use the LAX gantry band, and the 460 m floor stays. `harbor-freight` is one open sky lane at ground + 128 m on grid line j = 6 (local x = 1,080), from about z 29,000 to z 35,000. Basin and Westside are not skipped.

## Cameras

`__nla.harborView('aerial'|'wall'|'stacks'|'ship'|'street'|'interior'|'lax')`.

Crowd share is 0.02, loops beside a quay block. The LA River is not recut. The 605 and the 91 are still absent from the JSON. `long-beach` is Stage 20. This stage does not dress `coastal-strip`, `south-bay-refineries` or `lax-spaceport`.
