# South LA megablocks

The inner ring under Wallace. The polygon is 34.028–33.920 N / 118.340–118.220 W. This folder does not modify Lakewood, K, the coast, or Wallace.

Archetype id: `south-la-megablocks`. `megablock-residential` stays registered and is unused. Lakewood stays on `lakewood-megablocks`.

## Library

`spec.ts` holds the numbers. `archetype.ts` calls `fillResidentialBlock(ctx, SOUTH_LA_PARAMS)`. `details.ts` calls `planResidential` and `dressResidential`. New planner dials are optional. Lakewood omits them, and a check of 198 Lakewood blocks (`scripts/check-residential.mjs`) still matches the Stage 11 snapshot.

| Dial | Value |
|---|---|
| Module | 3.2 m |
| Heights | 45–130 m, snapped. The bias lands near 48–128 m. Walk-ups stay 4–8 storeys and can sit under 45 m. |
| `heightBias` | 0.55 (below 1 leans tall). Lakewood omits this and keeps 1.25. |
| Courtyard | reach 0.94, cap 0.98, bias 0.7. Lakewood keeps 0.72 / 0.78 / 1.15. |
| `residential` | 0.84–1 |
| Lit windows | 0.22–0.40 |
| Tint | 0.46–0.68 |
| Families | bar 0.22, podium 0.26, courtyard 0.30, stepped 0.12, walk-up 0.10 |
| Markets | one side-street block in five, plus every block on a spine. Hub is the cell that contains 34.014 N, 118.288 W. |

Courtyard wings are separate `buildMegablock` bars. The south gap is 8 m and the east gap is 7.5 m. The kit's closed courtyard form is not used.

Spine lines are the integer street index, not the block index. A block touches line L when its index is L or L−1. East-west: MLK −23, Slauson −35, Florence −43, Manchester −51, Century −59. North-south: Crenshaw −67, Western −50, Vermont −37, Figueroa −30, Central −10. Figueroa sits west of the 110. The band facing Wallace gets no markets.

## Wallace face

`face` is the polygon's east edge, from 34.025 N / 118.240 W to 33.920 N / 118.220 W, district on the positive side, band 1,500 m. Slabs already at or above 45 m step down toward 45 m as they approach that edge. Walk-ups under 45 m are left short. Within 190 m the block is a blank bar shifted west, the east stair and drain are dropped, and a fence with amber lamps closes the back. East-facing signs in the band are dropped. Tower C's reserve is still `isReserved`. Wallace's own district is not edited.

Freeway edges (the 110, the 10, the 105) still use the reserved-corridor path: a retaining wall, a fence, lamps, and a slab that snaps near 45–65 m. Those polylines are not moved.

## Street kit

Shared sodium is off for this archetype (`NO_LAMPS`). Cold pylons use the Civic colours: grey `[0.22, 0.23, 0.26]`, emissive `[0.62, 0.74, 0.92]`. They are planted only when `dressResidential` is called with `lamps: 'cold'`, and only after the Lakewood rng calls, on the north and east lot edges. A pole and its head are rank 0. A short curb and a cold pool are rank 1. Alternate posts are bollards.

`busy` (spines and the hub) raises the bin, steam and cable chances and adds a second sidewalk loop. Omit both options and the kit is Lakewood's.

LOD0 caps match K and Lakewood: props 280 / 720 / 1,600 / 2,600, steam 8 / 20 / 36 / 56, pools 16 / 40 / 80 / 120 by tier. Low tier keeps fabric, signs, rank-0 props (awnings and the cold pylons) and traffic streaks. Rank 1 starts at detail scale 0.45. Rank 2 starts at 0.75. A medium chunk is fabric, signs, the opaque kit and one pool batch.

Crowd share is 0.20 on the market mesh (Lakewood 0.12, K 0.32). Spines and the hub contribute an extra loop, so the same share sits heavier there.

## Traffic

`lanes.ts` is imported from `src/vehicles/traffic-index.ts`. One lattice, `south-la-streets`: bearing 0, blocks 200 × 120, nodes i −78…−10 and j −78…22, prefix `sl`, kind `street`, lane **5.6 m**. JSON `traffic` stays 0.18.

The mix is cars and about one van in five. A box truck appears only on a north-south spine edge (axis 0, the node's `j` in `SPINE_B`, length at least 160 m, about one edge in twelve). No haulers. No ramps. Nodes are not shared with the avenues, the Broadway canyon, Lakewood, or a freeway chain.

Spinners do not ride this lattice. Over the district they spawn at 158–210 m or 240–420 m, and a free flier under ground + 155 m is lifted. A lane of 5.6 m would otherwise park them at 74 m and 112 m, inside the slabs.

Low tier draws this route's own streak cap. The route id is `south-la-streets`. Downtown and Broadway keep their own pools. Medium and up draw the cars and hide those street streaks. Signal heads still submit only within 500 m.

## Laundry, ads, air

`south-la-laundry` is one `buildCorridorRoom` (warmth 0.35, no window, no rides, no scene lights) on the north side of the Exposition yard. Five washer pairs are extras. The door faces south into the yard, the same yaw Lakewood's shop uses.

At most four rank-2 street-band ads, existing designs only: `glyph-loop` and `lantern-loop` over the yard, `lease-loop` and `glyph-loop` on two spine stalls.

`U.neonWet` is 0.42 below 46 m, and up to 0.14 more within 1.5 km of the east edge, which is the amber the existing haze already adds. Street fog is 0.34 below 40 m. Rain stays the default. No new audio bus.

Far lights for this archetype are 0.62. Street neon is 0.10.

## Cameras

`__nla.southLaView('street'|'courtyard'|'market'|'spine'|'hub'|'traffic'|'trench'|'wallace'|'aerial'|'seam'|'room')`.

`wallace` stands in the street and looks east at the pyramid and Tower C. `seam` is the aerial with Lakewood in the same frame. `room` stands inside the laundromat.

## Known gaps

Ground above 45 m inside the polygon (Baldwin Hills) is still `hills-sparse`. The 605 and the 91 are not in `city-layout.json`. Wallace's polygon (priority 2) covers the north-east, so the fenced 190 m strip is a thin set of blocks, not a wall along the whole east edge. `src/districts/lakewood-megablocks/README.md` still says South LA stays on the Stage 1 blockout; that folder is left as Stage 11 wrote it.
