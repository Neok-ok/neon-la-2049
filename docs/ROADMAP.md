# Roadmap

Neon LA 2049 is built in **stages**. Each stage is one PR that leaves `main` deployable and can be picked up cold by
someone (human or agent) who has only read this repo. District stages turn one district from Stage-1 blockout into full
detail. Cross-cutting stages add systems. Stage numbers match the `stage` field of every district in
[`src/data/city-layout.json`](../src/data/city-layout.json), and the HUD shows the stage of the district you are standing in.

## How to run any stage

1. Read [BIBLE.md](BIBLE.md) (§5 landmarks, §7 the district's row, §10 invention rules) and [ARCHITECTURE.md](ARCHITECTURE.md).
2. Follow [ADDING_A_DISTRICT.md](ADDING_A_DISTRICT.md) for district stages.
3. Work only inside your district's folder (`src/districts/<id>/`) plus the two index files and the JSON entry, unless the stage says otherwise.
4. Keep the iPhone performance budget (table in [ARCHITECTURE.md](ARCHITECTURE.md), under *Quality tiers*).
5. Definition of done for every stage:
   * `npm run typecheck && npm run build` pass, and there are no console errors.
   * Screenshots of the district (aerial, street level, cinematic) via `npm run screenshots` (add shots for your district), attached to the PR.
   * HUD numbers inside the district on `medium`: draw calls ≤ 250, triangles ≤ 1.5 M.
   * BIBLE updated with any new or invented facts (`confidence: "invented"` where applicable).
   * A short "next stage notes" section in the PR description.

---

## Stage 1 — Foundation ✅ (this PR)

Engine (Vite + three.js WebGPU/WebGL2), lore-scaled city plan for the whole basin, procedural blockout of every district,
LOD streaming with workers, landmarks at true scale (Wallace pyramid 3.5 km, LAPD 216 m, megatowers, sea walls, spinner traffic),
height fog, day/night, auto weather, rain/snow, fly/walk/cinematic cameras, touch controls, quality tiers, HUD, procedural
ambience, Pages deploy, docs and maps.

## Stage 2 — Little Tokyo Night Market ✅
**District:** `little-tokyo-market` · **POIs:** `noodle-bar`, `bibis-bar`

The first fully dressed district, and the kit later districts should copy (`src/districts/_shared/kit/`, `src/districts/little-tokyo-market/`).

* Shophouse arcades (soffit you can walk under), awnings, shutters, stall counters, lanterns, AC units, pipes, cable sags, curbs, bollards, bins, vending machines, a corner tower, and on some blocks a catwalk with a stair.
* Sign atlas v2: invented Latin / kana / hangul / hanzi / devanagari phrases, flicker, a few scrolling panels, vertical blades, hologram billboards left procedural.
* Wet street: additive neon pools on every tier; planar reflector on high/ultra real GPUs (`?refl=`).
* Instanced crowd with umbrellas, lane avoidance, density by tier. Steam cards. Ground haze sheets on high/ultra. Rain streaks pick up neon in the market.
* Enterable noodle bar (counter, stools, cook, steam, menu). `E` sits. Bibi's is a shallower walk-up of the same kit.
* Market bed in the ambience bus: awning rain, murmur, sizzle, distant spinner. No music.
* City queries for the frame loop come from a worker. `fabricAt` / street spawn / cinematic checks still generate on the main thread when they need a correct answer once.

What the next district should not copy blindly: the per-chunk draw-call exception (kit opaque + fade + steam + pools, documented in the district README), and the fact that crowds, seats and the reflector are wired from `App.ts` rather than a generic district hook. Generalise those when the second dressed district needs them.

## Stage 3 — Financial District Megatowers ✅
**District:** `financial-megatowers` · **Landmarks:** `megatower-1…7`, `legacy-tower-1…3`, `skybridge-1…4`, `wallace-pyramid` (hero model), `old-pyramid-north/south`

* **Megatower kit** (`src/districts/_shared/megatower/`): one deterministic plan → sinks for real geometry (`GeoSink`) or fabric boxes (`FabricSink`). Podiums, setbacks, mechanical floors, fins, pilasters, raking buttresses, seven crown types, masts, pads, skybridges, terraced pyramids, hologram and sign slots, aviation lights.
* Ten hand-placed heroes from 310 m to 1,020 m with three LODs each, four skybridges, and kit towers (165–305 m) on half the fabric lots of the district's new archetype.
* The Wallace pyramid as a hero model (21 battered terraces, slot channels, a warm apex lantern, mast, monumental entrance; LODs at 6 / 18 km) and two dormant 1982-style pyramids in the refinery belt.
* Landmark registry + LOD manager, screen-size billboard beacons for every aviation light, a landmark collider grid.
* High sky lanes: avenues, holding patterns, corridors to Wallace and beyond; police, civilian and a new 14 m transport hauler, platoons, blinking lights, Doppler flybys.
* A gaussian smog inversion layer in the fog, tuned per weather.
* Crown, shaft, gap and podium holograms through `registerHologram` (new `skyline` band).
* `__nla.megaView(...)` cameras and the Stage 3 screenshot set.

What the next stages should know: heroes are landmarks, not fabric, so the 320 m fabric ceiling still holds. Hologram slot ids are stable (`${id}-holo-a/-b/-crown/-gap/-i`). The kit's detail 3 only exists on landmark LOD0. Fabric towers are box-only.

## Stage 4 — Downtown Megablocks ✅
**District:** `dtla` · **POIs:** `dtla-canyon`, `mt1-plaza`, `mt5-edge`

* **Megablock kit** (`src/districts/_shared/megablock/`): cantilever, slab-on-podium, bar and courtyard plans; ribbed / coffered / panelled façades (city-material styles 15–17); rooftop tanks, masts and pads; lit ring decks. `residential` is the hook for Stages 11, 12 and 20. Fabric districts call `buildMegablock` into a box sink. DTLA passes `compact: false`; a heavy district can pass `true`.
* Heights stay **90–250 m**. About one wide lot in eight is a compact megatower-kit shaft at **200–300 m** (under the 320 m ceiling).
* Lit crossings at **46 / 68 m**, and **92 / 118 m** on about three streets in five, shared by grid line so the two sides meet. Only the +A and +B block emits a crossing.
* Avenue sky lanes at **188 / 222 / 250 m** on the street centre lines (`dtla-avenue-*`), split around hero colliders. Low `SpinnerTraffic` follows `streetGraph.ts` at 74 and 112 m over DTLA, the Financial District and Civic Center. Ground cars and vans use the same graph.
* Street kit (kiosks, steam, pools, curb vans, bollards), crowds on the shared mesh, and holograms (`dtla-canyon-ribbon`, `dtla-canyon-lantern`, `dtla-mt1-lease`, `dtla-mt5-glyph`). The MT-1 / MT-5 aprons and the ground under skybridges 1 and 3 are dressed from a detail module registered for both polygons.
* `__nla.dtlaView('street'|'walkway'|'roof'|'lanes'|'plaza')`.

What the next stages should know: the financial polygon still wins on top of MT-1 and MT-5, so plaza dressing is detail, not fabric. Walkway decks are flat slabs — there is no stair, and walk mode only stands on one if something places the feet on the deck. Fabric towers are boxes. Ground cars do not enter a landmark reserve, so the aprons stay pedestrian.

## Stage 5 — Civic Center and LAPD Headquarters
`civic-center`: LAPD HQ in full detail (landing deck, lobby entrance, police spinner pads with traffic), City Hall restoration,
monumental plazas, the steps where K walks. Optional interior: LAPD lobby.

The downtown street graph and the 74 / 112 m spinner layer already include this polygon (40 m streets, same 38° grid). Police pads should be lanes or graph side-spurs, not a new traffic mesh. The holding pattern `hold-lapd` is still the high orbit.

## Stage 6 — Broadway Neon Canyon
`historic-core` + POIs `bradbury`, `joi-bridge`: heritage façades under new cladding, stacked vertical blade signs, the hologram
footbridge (an original giant pink hologram dancer, not a copy), the Bradbury exterior.

## Stage 7 — Wallace Precinct
`wallace-vernon` + satellites: the pyramid's hero model and its warm apex lantern already exist (Stage 3, `wallace-vernon/pyramid.ts`).
This stage adds close-range surface detail (panel lines, formwork, drainage, lit slit windows at human scale), a walkable sealed entrance
plaza, the satellites rebuilt with the kit, Wallace factories, tanks and the approach road, freight spinner convoys into the precinct
(extend `skyLanes.ts`), and the dormant old pyramids' surroundings. Optional interior: the water-lit atrium (scaled-down).

## Stage 8 — K's Megablock
`k-megablock` + POI `k-apartment`: the slab, its harsh corridors, the street market at its feet, and **K's apartment interior**
(enterable, with the spinner pad on the roof).

## Stage 9 — Arts District Works
`arts-district`: warehouses, foundries, pipe racks, steam and sparks, the LA River edge.

## Stage 10 — Grey Coast and the Sepulveda Sea Wall
`coastal-strip` + both sea walls + POI `sea-wall-fight`: wall surface detail (formwork lines, drains, ladders, lights), wave and spray
simulation at the toe, the finale apron, the drowned piers, coastal blocks.

## Stages 11–12 — Residential Megablocks
`lakewood-megablocks` (11) and `south-la-megablocks` (12): residential megablock families, courtyards, laundry and AC clutter, low traffic,
small corner markets. Share an archetype library between the two.

## Stage 13 — Westside Sprawl · Stage 14 — Basin Sprawl (default)
`westside` (13) and the default `basin-sprawl` (14): mid/low-rise sprawl with rooftop clutter, strip markets, freeway edges.
Stage 14 also tunes the far-LOD light carpet so the whole basin reads correctly from 1 km up.

## Stage 15 — Southeast Refinery Belt · Stage 18 — South Bay Refineries
`southeast-industrial` (15) and `south-bay-refineries` (18): tank farms, pipe racks, flare stacks with animated flames (the 1982 "Hades" look),
and the El Segundo flare field in full.

## Stage 16 — Hollywood Entertainment Strip
`hollywood`: entertainment towers, arcades, gigantic animated holograms, the hills behind (no famous sign: an original hillside signage idea is fine).

## Stage 17 — LAX Off-World Spaceport
`lax-spaceport`: gantries, hangars, a terminal, occasional off-world launches (light and sound events visible city-wide).

## Stage 19 — Harbor and Container Port · Stage 20 — Long Beach · Stage 21 — East LA
`harbor` (19): cranes, container stacks, ships behind the harbor sea wall. `long-beach` (20): a secondary megablock core.
`east-la` (21): dense sprawl, markets, freeway interchanges.

---

## Cross-cutting stages (schedule between district stages as needed)

| Stage | Adds | Notes |
|---|---|---|
| **X1 Crowds** | The market shipped the first crowd (instanced coats, umbrellas, lane follow, cheap avoidance, tier counts). Generalise it: density from district data, more than two sidewalk loops, and a walk cycle that is more than a foot slide. | the market is the reference scene |
| **X2 Ground traffic** | cars and trucks in streets and freeway trenches, traffic lights | |
| **X3 Interiors framework** | The noodle bar is a recess in the street mesh, not a portal. A real interior stream (separate light, occluded exterior, door volumes) still has to be built before K's apartment and the LAPD lobby. | Stage 2 proved the walk camera can enter a soffit |
| **X4 Holograms** | shared hologram system (giant animated figures, ad loops, scanline/flicker shader, light spill) | ✅ API in `src/world/holograms/README.md`. Showcase set is on the market lane, the megatower crowns, shafts and podiums (Stage 3), the financial avenue and two downtown billboards. Kind-2 panels under 140 m² stay the cheap sign. Stages 6/16 only call `registerHologram`. |
| **X5 Audio** | Market bed is in (awning rain, murmur, sizzle, distant spinner), on the ambience bus, equal-power panners. Still to do: PA in invented languages, sea-wall surf, per-stall variety, and a bus that districts can register without editing `App.ts`. | no music |
| **X6 Performance** | Frame-loop collision is now a worker with a sync fallback for cinematic queries and street spawn. Still open: GPU culling, interior mapping, shadows on high/ultra, and an iPhone profiling pass on device (the VM only has SwiftShader). | do this if a later district blows the 250-draw / 1.5 M budget |
| **X7 Photo mode** | free camera, depth of field, film grain, screenshot export | |

## Suggested order

Stages 2 and 3 and X4 are done. Next: 4 → 5 → 6 → (X1 only if a second district needs a crowd that is not the market's) → 8 → 7 → 10 → X2 → 11 → 12 → 9 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21, with X3/X5/X6/X7 where they unblock the next district. Later stages add holograms by calling `registerHologram`, not by replacing the field, and build anything taller than 320 m with the megatower kit as a landmark.
