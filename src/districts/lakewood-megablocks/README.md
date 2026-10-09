# Lakewood / Downey megablocks

Residential sector K flies home over. The polygon is 33.92–33.80 N / 118.22–118.07 W. K's megablock sits inside it and is a different district. This folder does not modify that code.

Archetype id: `lakewood-megablocks`. South LA stays on `megablock-residential`.

## Library

`spec.ts` holds the numbers. `archetype.ts` calls `fillResidentialBlock(ctx, LAKEWOOD_PARAMS)`. `details.ts` calls `planResidential` and `dressResidential`. See `src/districts/_shared/residential/README.md` for the Stage 12 contract.

| Dial | Value |
|---|---|
| Module | 3.4 m |
| Heights | 45–130 m, snapped (47.6–129.2 on the module). Walk-ups 4–8 storeys. |
| `residential` | 0.74–1 |
| Lit windows | 0.15–0.35. Within 1,450 m of K's tower: 0.15–0.24, and only bars and podiums. |
| Families | bar 0.30, podium 0.18, courtyard 0.24, stepped 0.14, walk-up 0.14 |
| Markets | one block in eight. Hub is the cell that contains 33.853 N, 118.141 W. |

Courtyard wings are separate `buildMegablock` bars. The south gap is 8 m and the east gap is 7.5 m, so a walker can enter. The kit's closed courtyard form is not used.

## Street kit

Sodium, not a cold pylon. K's streets are already sodium, and the seam should be the same lamp. The shared `streetLamps` module plants them. This district does not add a second row.

LOD0 props: bollards, bins, a utility box, one cable, stall awnings, court puddles, occasional steam. Caps match K: props 280 / 720 / 1,600 / 2,600, steam 8 / 20 / 36 / 56, pools 16 / 40 / 80 / 120 by tier. Rank 0 (awnings) is the only kit on low. Rank 1 starts at detail scale 0.45 (medium). Rank 2 starts at 0.75 (high). A medium chunk is fabric, signs, the opaque kit and, where a court or the hub is in view, one puddle batch.

Crowd share is 0.12 on the market mesh (K is 0.32). Loops are the sidewalk, a few stalls, and an 8 m square in a court.

## Traffic

`lanes.ts` is imported from `src/vehicles/traffic-index.ts`. One lattice, `lakewood-streets`: bearing 0, blocks 210 × 130, nodes i −136…−66 and j 14…126, prefix `lw`, kind `street`, lane **6.2 m**. That sits in a 26 m street (about 4 m of sidewalk, then the driving line) and stays at or above 5 m, so the cars are cars. The mix is cars and about one van in six. No trucks. JSON `traffic` stays 0.15.

Edges inside K, a freeway reserve, or the river are dropped by the graph. Spinners do not ride this lattice. Over the district they spawn at 158–210 m or 240–420 m, and a free flier under ground + 155 m is lifted, which clears a 130 m roof plus a 14 m mast. K's 185 m slab is the other district and is unchanged.

Low tier draws a light streak dusting from this route's own cap (about 7,000 dashes, a few hundred metres apart). Downtown and Broadway keep the pool they had before this lattice existed. Medium and up draw the cars and hide those street streaks.

## Shop, ads, air

`lakewood-shop` is one `buildCorridorRoom` (warmth 0.75, no window, no rides, no scene lights) on the north side of the hub yard. Two rank-2 holograms, `glyph-loop` and `lease-loop`, hang over the yard. Wetness is 0.38 below 46 m. Street fog is 0.30 below 40 m. No new audio bus.

Far lights for this archetype are 0.5. Street neon is 0.08, under the Stage 1 residential default, so rain reads as a dark street with a little colour.

## Budgets

A sampled 500 m chunk around the hub was about 1,200 boxes, about 14 k triangles, under the 40 k LOD0 guide. The heaviest single block was a courtyard at about 220 boxes.

## Cameras

`__nla.lakewoodView('street'|'courtyard'|'market'|'laundry'|'traffic'|'k-edge'|'river'|'aerial'|'shop'|'hub')`.

## Known gaps

Signal Hill (33.805 N, 118.165 W) is inside the polygon. Ground above 45 m still becomes `hills-sparse`. The 605 and the 91 are not in `city-layout.json`.
