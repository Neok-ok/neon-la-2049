# Long Beach Secondary Core

A dimmer southern echo of downtown. District id `long-beach`. Archetype id `long-beach-core`. `megablock-downtown` stays DTLA's body and is not retuned.

The polygon, the bearing 0 grid, the 190 × 120 m blocks and the 30 m streets are the Stage 1 entry. Priority stays 1. Where this polygon overlaps `harbor`, harbor's priority 2 still wins. The sea-wall polylines are not moved. Sepulveda stays at a 90 m crest. The harbor wall stays at its published 75 m crest. The LA River is not recut. The 605 and the 91 are still absent.

## Massing

One concrete megablock per owned block, from the shared megablock kit. `residential` is 0 (downtown plant: tanks, pad, mast) and `compact` is true. Omitted kit fields stay at their old defaults, so DTLA's plan is unchanged. Heights are an office module of **5.0 m** (inside the §4 4.0–5.5 m band), from **60 m** to **150 m**, with a rare **155 m** (31 × 5.0 m) when the roll is already at 145 m. Two heroes break the field: a **180 m** slab-podium (36 × 5.0 m) on block i = −163, j = 95, and a **165 m** bar (33 × 5.0 m) on block i = −161, j = 99. A compact mast can stand about 24 m over a roof, so a 180 m solid can read near **204 m**. Nothing here is over 320 m, so the megatower kit is not used.

Forms are slab-podium (about 0.42), bar (0.32), courtyard (0.14) and cantilever (0.12). Families are coffered (0.44), panelled (0.36) and ribbed (0.20). Ordinary windows are lit 0.07–0.18 with tint 0.50–0.70, under DTLA's 0.22–0.48. A billboard is placed only when the roof is at least 115 m and the chance hits (about 0.14), plus both heroes. Walk decks sit at **40 m** and **70 m** (8 × 5.0 m and 14 × 5.0 m) when the roof is at least 90 m. `confidence: invented` — the row asks for 60–180 m concrete megablocks, dimmer than downtown, and 5.0 m is the office module that lands inside that band. 155 m is the one step past 150 that still snaps to the module.

The hero slab is shifted north (footprint 78 × 118 m, centre 10 m north of the block) so its south face stays near s = −49. The concourse shell occupies s = −78…−66. The shell is **14 × 12 × 15 m** (15 m is 3 × 5.0 m). The door gap is 2.6 m wide with a lintel clear of 2.8 m. Signs on that face are atlas cells only (`OPEN LATE`, `2049`). No agency, carrier or building name.

Blocks whose centre is reserved, ocean, above 45 m, or not this district return empty. The southwest overlap with the harbor is harbor. Ground above 45 m stays `hills-sparse`. Owned blocks in this polygon are at grade.

## Light and sound

Shared sodium poles stay on. This district is not in `NO_LAMPS`. The LOD0 kit adds bollards and additive sodium and neon quads (rank 0 on the north edge, rank 1 on the east edge and on the hero's south sidewalk). Rank 1 needs detail scale ≥ 0.45. Caps are 160 / 420 / 800 / 1,200. The detail module rebuilds `seed` with `hash2i`. This district's index is 18. Those quads are extra draws on top of the shared lamp batch, the same way DTLA adds a street kit.

Far-LOD ground lights for `long-beach-core` are **0.55** and street neon is **0.28**. Downtown stays the implicit carpet 0.6 and neon 0.72. Harbor stays 0.64 / 0.11. South Bay stays 0.72 / 0.12. LAX stays 0.46 / 0.08. Hollywood stays 1 / 0.86. The belt stays 0.9 / 0.18. Basin stays 0.52 / 0.16. Westside stays 1 / 0.35. Lakewood stays 0.5 / 0.08. The ground-light shader is unchanged. A 1 km aerial is LOD1, so the dimmer read there is the lower lit fraction and the shorter roofs, not the carpet.

Neon wetness is 0.46 below 72 m, under the downtown canyon (0.62) and above Lakewood (0.38). Street fog is 0.22 below 70 m, fading with altitude, times the South Bay tier scale (low 0.35, medium 0.6, high 0.85, ultra 1). Audio is the existing traffic bed (`setTraffic`). The harbor machinery tail may carry in from the south. No new audio node and no `setMachinery` term for this polygon.

## Interior and holograms

`long-beach-concourse` is one `buildCorridorRoom` on the south face of the core slab (33.772270 N / 118.119448 W). The door faces south (yaw 0). Warmth 0.48, corridor 3.6 × 2.6 × 3.2 m, room 6.8 × 6.2 × 3.6 m, no window, no rides, stream radius 46 m, muffle 0.75, hum 0.12. POI `long-beach-concourse` is that threshold, so `at=long-beach-concourse` lands on it.

`long-beach-glyph` is glyph-loop, amber, 12 × 16 m, street band, rank 0, spill 14 m. `long-beach-lease` is lease-loop, cyan, 16 × 12 m, tower band, rank 1, spill 16 m. Both sit just outside the door. The glyphs are noise. The wedge is the existing share ad. No new design. Kind-2 kit billboards at or over 140 m² can still be promoted by the field.

## Traffic

`lanes.ts` registers `long-beach-streets` (prefix `lb`, lane 6.8 m, nodes i −179…−147 and j 72…118, no ramps, no shared nodes). The mix is cars (about 0.70), vans (about 0.22) and box trucks (about 0.08). JSON `traffic` is 0.34 (the Stage 1 placeholder was 0.2), so medium shows about seven vehicles, high about fourteen, ultra about twenty-two. Edges are 120–190 m, so the short-edge van fallback does not fire. Low tier is streaks only. The route id is its own streak cap.

Spinners do not use the 158–210 / 240–420 m roof band. A 180 m roof, and a mast near 204 m, would sit inside it. Over this district a spawn is **232–290 m** or **340–480 m**, and a free flier under **ground + 220 m** is lifted. `long-beach-freight` is one open sky lane at ground + 200 m on grid line i = −163 (local z = 30,970), j = 82…108 step 2 (local x about 9,840…12,960). Transports only, platoon 2–4, separation 11 m, `altBias` 0, fade 90 m, weight 1.15. It sits above the roofs and under the 220 m floor, on the street centreline so the roof plant on the block is missed. The LAX floor stays 460 m. Basin and Westside are not skipped. The South Bay roof-band skip is unchanged.

## Cameras

`__nla.longBeachView('aerial'|'wall'|'canyon'|'lakewood'|'interior'|'lanes')`.

Crowd share is 0.16, sidewalk loops on the block corners. Under DTLA's 0.4 and above Lakewood's 0.12. `coastal-strip`, `south-bay-refineries`, `lax-spaceport`, `lakewood-megablocks`, `basin-sprawl` and `east-la` are not dressed by this stage.
