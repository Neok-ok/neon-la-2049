# South Bay Refineries

El Segundo and the South Bay coast. District id `south-bay-refineries`. Archetype id `south-bay-refinery`. The Stage 1 body `industrial` stays registered and unused. The El Segundo landmark (`el-segundo-refinery`, type `flare-field`) is not this body and was not moved.

The polygon, the bearing 0 grid, the 260 × 170 m blocks and the 24 m streets are the Stage 1 entry. Priority stays 1. `coastal-strip` (priority 2) still owns the land between this polygon and the Sepulveda sea wall.

## Kit

`src/districts/_shared/refinery/` is the shared planner. Every new flag defaults off, so the Southeast belt's roll is unchanged. This district passes `SOUTH_BAY_PARAMS` in `spec.ts`.

Ordinary blocks are tank farms (share 0.36), coastal spheres (0.14), cracking yards (0.20), pipe canyons (0.18), or sheds. West of local x = −11,200 the shares become 0.24 / 0.40 / 0.14 / 0.12, so the owned coast reads as storage spheres. About one tank, sphere or pipe block in three also grows a flare (`flareOnYard` 0.36). Cracking yards always do. Edge racks sit on the owned north edge of other blocks (chance 0.55).

Invented heights, recorded in the Bible: cracking columns 50–60 m snapped to 5.0 m, flare stacks 100–140 m snapped to 5.0 m, spheres 16.8–25.2 m (4–6 × 4.2 m) on the kit's 1.5 m berm, pump house 12.0 m (3 × 4.0 m). Berms, catwalks and pipe decks stay the kit. Yard signs are existing atlas cells only (`BLACK OIL`, hanzi `STEAM`, `2049`, kana `STEAM`), about one block in twelve. No company names.

`jetty: true` asks for a short pier, and the planner emits one only when a walk reaches the sea-wall corridor within 220 m without leaving the district or entering the ocean. The nearest owned block is about 1.4 km from the Sepulveda centreline, so this polygon emits no jetty. The western sphere and tank blocks are the refinery edge. The camera `wall` stands on the east side of the coastal yard nearest the Sepulveda crest and looks west across it. The crest is about 1.4 km away, on `coastal-strip`.

`details.ts` rebuilds the block seed with `hash2i(i + 100000, j + 100000, districtIndex * 7919 + 13)`. The worker ships `seed` as a float32, and past 2^24 the rounded value changes the yard, so the cylinders and spheres would miss the berm. This district's index is 16. Crowd loops use the same rebuild.

Blocks whose centre is reserved (the freeways that already cross the polygon), ocean, or above 45 m return empty. Ground above 45 m stays `hills-sparse`. Pieces whose world point falls in the flare-field rectangle, plus 18 m, are dropped so the two overlapping blocks do not sit on the landmark stacks.

## Flames

`field.ts` mounts one city-wide sprite mesh (`south-bay-flares`). It shares the belt's material, wind and tier gain (`setRefineryFlame`). The landmark `Flares` class stays the hero glow on the published pin. Kit sprites continue the field east of that footprint. The close spill is a rank-0 additive quad in the chunk kit, not a scene light. Far-LOD ground lights for `south-bay-refinery` are 0.72 and street neon is 0.12. The belt stays 0.9 / 0.18. LAX stays 0.46 / 0.08. Hollywood stays 1 / 0.86. Basin stays 0.52 / 0.16. Westside stays 1 / 0.35. `industrial` stays 0.35 / 0.1 and unused. The ground-light shader is unchanged.

## Interior and holograms

`south-bay-control` is one `buildCorridorRoom` on block i = −64, j = −36, south face (33.902364 N / 118.309133 W). Warmth 0.4, corridor 3.4 × 2.2 × 3.2 m, room 7.2 × 5.8 × 3.6 m, no window, no rides, no scene lights, stream radius 42 m, muffle 0.72, hum 0.28. POI `south-bay-control` is that threshold, so `at=south-bay-control` lands on it.

`south-bay-hazard` is glyph-loop, amber, 12 × 16 m, street band, rank 0. `south-bay-share` is lease-loop, cyan, 16 × 10 m, street band, rank 1. Both face south from the door (yaw 0). The glyphs are noise. The wedge is the existing share ad. No refinery name and no new design.

## Traffic

`lanes.ts` registers `south-bay-streets` (prefix `sb`, lane 6.2 m, nodes i −108…−52 and j −87…13, no ramps, no shared nodes). The mix is tankers (about 0.64), box trucks (about 0.24) and vans. JSON `traffic` is 0.30. Spinners skip this district on the same roof band as the belt (spawn 158–210 m or 240–420 m, lift under ground + 155 m). Stacks are at most 140 m, so the LAX gantry band is not used and the 460 m floor stays. `south-bay-freight` is one open sky lane at ground + 196 m on grid line j = −30 (local x = −5,100). Basin and Westside are not skipped.

## Cameras

`__nla.southBayView('aerial'|'lax'|'tanks'|'spheres'|'wall'|'flare'|'street'|'interior'|'downtown')`.

Crowd share is 0.03, loops on the south sidewalk. Shared sodium lamps stay off (`NO_LAMPS` already includes this id). Audio reuses `Ambience.setMachinery`: 0.44 below 120 m inside the polygon, and outside a tail of 0.3 e^(−d / 3800) from the flare-field pin, fading by 160 m of altitude, added to the launch rumble and clamped to 1. No new audio node. Street fog is 0.4 below 80 m, scaled by tier (low 0.35, medium 0.6, high 0.85, ultra 1). Neon wetness is 0.16 below 60 m. The LA River is not recut. The 605 and the 91 are still absent from the JSON.
