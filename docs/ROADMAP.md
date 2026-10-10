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

## Stage 5 — Civic Center and LAPD Headquarters ✅
**District:** `civic-center` · **POIs:** `lapd-steps`, `lapd-lobby`, `lapd-deck`, `city-hall-steps`, `civic-plaza`

* **LAPD HQ** (`civic-center/hq.ts`): inverted-pyramid crown, four 22 m pads, a 32-tread stair on the City Hall face, a recessed lobby you can walk into (desk, columns, barriers, a directory). Three LODs; colliders come from the detail-2 build. No insignia. The light band is a glow strip. The words are the atlas phrase SECTOR 5.
* **City Hall** (`hall.ts`, type `heritage-tower`): dark jacket, pale shaft, pyramid, lamp. The ceremonial stair faces LAPD. The year mark is the atlas cell "2049". No seal. This registration replaces the Stage-1 silhouette for every `heritage-tower`; only `city-hall` uses that type.
* **Mall.** `inCivicMall` keeps fabric out of the gap between the reserves. A landmark slab paves it. Crowds use the market mesh on sidewalks and on both forecourts.
* **Pads.** `lapd-pad-a`…`d` and `lapd-pad-circuit` are sky lanes (`lanes.ts`, appended from `skyLanes.ts` after `hold-lapd`). They are the side-spurs off the ~190 m avenue band. Open lanes gained `altBias` (0 on the pads, 7 on the avenues) and `fade` (70 m on the pads, 220 m elsewhere). `hold-lapd` is still the high orbit. Not street-graph edges.
* Fabric reuses the megablock kit, compact, 58–122 m, walkways off, kit shop signs dropped. Mall-adjacent lots are often a 36–52 m colonnade. The shared sodium lamps skip this district; the street kit is cold pylons.
* One hologram, `lapd-shaft-notice` (glyph-loop, existing shader). `__nla.civicView('approach'|'steps'|'hall'|'lobby'|'plaza')`.

What the next stage should know: the lobby is a soffit, the same kind of recess as the noodle bar, not an X3 interior. Pad hover is about 6 m over the deck so the 3.5 m lane clearance stays clear of the crown collider. The street graph and the 74 / 112 m spinner layer already include this polygon. Do not add a second graph.

## Stage 6 — Broadway Neon Canyon ✅
**District:** `historic-core` · **POIs:** `bradbury`, `joi-bridge`

* **Heritage kit** (`src/districts/_shared/heritage/`): one street face. Masonry (style 18) and deco (style 19) in the shared city material. `skin: true` is ornament only, for a landmark that owns the volume. Stage 16 should call `buildHeritage`.
* **Canyon.** Named Broadway fronts at the real addresses, on the 38° grid, plus generic bays so the street reads as signs over signs. Cladding wrap is partial. Atlas copy only. The Bradbury lot is a rectangular hole in the fabric, not a circular reserve, so the lane and the side bays stay.
* **Bradbury** (`bradbury-building`): 38 × 48 × 22.4 m masonry, a 14 m court you can walk into, galleries, columns, an open beam grid, a 27 m jacket on the back and the south side. No wordmark.
* **Footbridge** (`canyon-bridge`): the Stage 1 pin, snapped onto the street one block east of Broadway. Deck at 11.2 m, stairs on both sidewalks. `joi-bridge-dancer` is `veil-dancer` in the existing hologram shader (rank 0, tower band). Veil House is an invented ad house. The figure is not a film character.
* **Traffic.** A second lattice in `downtownGraph`, edge field `lane` (3.15 m here, 7.2 m on the avenues). Nodes are not shared, so a car cannot turn from an avenue onto a canyon street with the wrong offset. Rickshaws are scaled cars. Spinners over the canyon fly at 148–260 m and skip edges with `lane < 5`.
* Crowds reuse the market mesh at about 72% density, both curbs. Sodium lamps are off. Neon wetness 0.88 below 120 m. `__nla.broadwayView('street'|'bridge'|'bradbury'|'spinner'|'atrium')`.

What the next stage should know: the court is an X3 interior (`bradbury-court`), with its own light and a stair. The bridge is still a soffit. Kind-2 promotions still use crane / coil / ribbon, not `veil-dancer`. The two street lattices do not connect. MT-6's reserve still suppresses a few canyon blocks; do not move MT-6 to "fix" that. Do not add a third traffic graph.

## Stage X3 — Interior system ✅

A reusable interior stream, built before K's apartment so Stage 8 does not invent a second door or a second light model.

* **API** (`src/world/interiors/`, [`README`](../src/world/interiors/README.md)). `registerInterior` from `src/districts/interior-index.ts`. Volumes, exterior door boxes, `build(detail)`, optional `links` and `keepLandmarks`. `buildCorridorRoom` is the corridor-and-room template.
* **Walk in, fly stays out.** An exterior door keeps the city on screen through the threshold. Past it, the city hides and a procedural doorway card (one draw, not a second city render) fills the opening. Fly mode treats the volume as solid, open roof included.
* **Inside.** Baked light on an unlit mesh, independent of night and rain. The ambience bus low-passes rain and the city bed. Open-sky rain is a local streak mesh on medium and up.
* **Proof.** `bradbury-court` replaces the Stage 6 soffit: warm lantern, galleries, a masonry switchback (riser about 0.37 m). `bradbury-service` is `buildCorridorRoom` in the carved back wing. That is the template Stage 8 extends. It is not K's apartment.
* **Cameras.** `__nla.interiorView('court'|'stair'|'door'|'service')`. `__nla.broadwayView('atrium')` still stands in the court and is now inside the stream.
* **Budget.** Every tier stays under 250 draws and 1.5 M triangles both inside the court and on the street outside the door.

What Stage 8 should know: call `registerInterior` and start from `buildCorridorRoom`. Do not add scene lights. Do not render the city into a portal target. Do not copy the Bradbury stair. The noodle bar and the LAPD lobby are still soffits. Stage 8 did this: K's lobby, corridor, apartment, roof head-house and three lift cars call `registerInterior`. `sideDoors`, `backDoor`, `window`, `rides` and `hum` are the extensions, in the interiors README.

## Stage 7 — Wallace Precinct ✅

`wallace-vernon` + satellites + the old pyramids' apron. The Stage 3 pyramid mesh and its 6 / 18 km LODs stay.

* **Close range.** A second skin inside ~1.5 km of the hull: board-formed bands, joints, a drain and scupper, a maintenance ledge, dim bronze slits. One face sector per frame. The central slot and the portal mouth stay bare. Warm light stays on the apex and the top two tiers.
* **Plaza.** North face, walkable. A 30 m walled causeway, stone court, eight 0.375 m risers onto the Stage 3 plinth, pylons, a security line, amber puddles, a human door in front of the sealed portal. Colliders for the steps, plinths and pylons. Four ground haulers loop the causeway. The polygon edge cuts the Stage 3 plinth, so the causeway lives in the reserve.
* **Satellites.** `wallace-tower` A/B/C rebuilt with the megatower kit: battered tiers, slots, a warm crown, a mast inside the published height, aviation lights. Three LODs (2.4 / 8 km). Colliders from the detail build. Heights and placements unchanged.
* **Fabric.** Archetype `wallace-vernon` replaces `industrial` on this polygon only. Halls 18–42 m, sawtooth roofs, tanks, pipe racks, conveyors, docks, stacks to 58 m, perimeter walls. No new shader. No word signs. Approach road is the causeway above, not a street-graph edge.
* **Freight.** `wallace-freight-in`, `wallace-dock-ns`, `wallace-dock-ew` appended in `skyLanes.ts`. Transports, platoons of 2–5, `altBias` 0. Amber haze (street fog 0.78 below 110 m) in the polygon and the pyramid reserve. Industrial bed on the ambience bus.
* **Atrium.** `wallace-atrium` via `registerInterior`: a small water-lit room behind the human door. Not a second interior path. The film cathedral is not copied.
* **Old pyramids.** A ring of tanks, pipes and a low wall just outside each reserve, on `southeast-industrial` only. No rename, no Tyrell mark.
* **Cameras.** `__nla.wallaceView('approach'|'plaza'|'face'|'satellite'|'factories'|'convoy'|'oldpyramids'|'atrium')`.

What the next stage should know: Stage 10 has shipped. Sea-wall colliders are stepped slices; do not put the segment length back into `hd`. The coast has no street graph. Next after Stage 10 is X2 Ground traffic. The pyramid is still the tallest thing. Fabric here stays under 60 m. Do not add a street graph on this polygon. Do not put a logo on the stone. The old pyramids' archetype is still the shared `industrial` one; Stage 15 dresses the belt. The atrium is a room, not a ride — do not reuse `rides` here.

## Stage 8 — K's Megablock ✅

`k-megablock` + POI `k-apartment`: the slab, the market at its feet, and an enterable apartment on the X3 stream.

* **Slab.** `registerLandmarkType('megablock-slab')` replaces the Stage-1 blockout. 185 × 230 × 85 m, residential concrete, bands every 13.6 m, slit cores, laundry low on the south face. LOD triangles 1,180 / 740 / 70. Red roof lights. Colliders leave the lobby, the shaft and floor 40 open; the roof cap stays solid.
* **Pad.** Amber 16 m pad, no insignia, a head-house, plant kept off the lanes. `k-pad-ew` and `k-pad-ns`, `altBias` 0, fade 60 m, hover 191 m. No street graph.
* **Market.** Archetype `k-megablock` replaces `megablock-market`. One compact residential block per lot, signs only at the street. The hero market is kit props inside the 140 m reserve: stalls, a walk-up noodle counter (not an interior), vending, tarps, a pipe, a cable pair, sodium pools. Crowd share 0.32.
* **Interiors.** `k-lobby`, `k-lift-lobby`, `k-lift-floor`, `k-lift-roof`, `k-corridor`, `k-apartment`, `k-head`, all `registerInterior`. Halls extend `buildCorridorRoom` (`sideDoors`, `backDoor`, `window: false`). The lift is three static cars and a fade (`rides`). Fly mode hands walk to the head-house door. No projector, no figure.
* **Cameras.** `__nla.kView('street'|'market'|'lobby'|'corridor'|'apartment'|'roof'|'aerial')`.
* **Atmosphere.** Rain and the city bed. Neon wet 0.5 below 48 m, street fog 0.36 below 40 m. One 74 Hz hum while an interior that sets `hum` is occluded.

What the next stage should know: Stage 7 shipped after this one. The doorway card is still procedural, not a live street. Fly mode still cannot enter a volume. The lift does not move a mesh. The LAPD lobby and the noodle bar stay soffits. Do not add a street graph on this polygon. Do not reuse `rides` unless a floor change is actually needed.

## Stage 9 — Arts District Works ✅
`arts-district`: warehouses, foundries, pipe racks, steam and sparks, the LA River edge. Archetype id stays `industrial-dense`. POIs `arts-foundry` and `arts-river`.

* **Fabric.** 10–45 m brick warehouses and steel sheds, three foundry halls, stacks 74–136 m with cooling stacks, pipe racks, yards, containers and slag. Rank-0 brick dados carry the rust. Signs stay on the existing atlas.
* **Steam and sparks.** Instanced cards. Low tier is static plumes. Medium is about half the drifting steam plus a spark cap of 28. The pour door loops a flare.
* **River.** The Stage 1 corridor stays a flat 110 m reserve. Banks, a trickle, outfalls, a service road and a rusted bridge are kit props. The polyline is not moved.
* **Interior.** `arts-foundry` is one `buildCorridorRoom` in the pour hall. No scene lights, no rides.
* **Traffic.** Lattice `arts-streets`, prefix `ad`, lane 6.4 m, JSON weight 0.34, trucks and vans. Spinners skip the district. Freight lane `arts-freight` at ground + 176 m. Crowd share 0.06. Two existing ads on the Little Tokyo edge. Machinery hum reuses `setMachinery`.
* **Cameras.** `__nla.artsView('aerial'|'stacks'|'foundry'|'pipes'|'river'|'street'|'interior')`.

What the next stage should know: Stage 13 (Westside Sprawl) is next. Do not point `arts-district` back at the Stage 1 `industrial-dense` body. The later `registerArchetype` is the dressed district, and only this polygon uses that id. `southeast-industrial` stays on `industrial`. Do not share nodes with `arts-streets`, and do not add a ramp. `arts-streets` already has its own streak cap. A `lane` of 5 m or more still parks spinners at 74 m and 112 m unless `SpinnerTraffic` skips that district. Arts uses the same skip as Lakewood and South LA (spawn 158–210 or 240–420, lift under ground + 155). `arts-freight` flies at ground + 176 m, above the stacks. The LA River polyline is not to be recut. Do not register `coastal-strip`, `k-megablock` or `wallace-vernon`.


## Stage 10 — Grey Coast and the Sepulveda Sea Wall ✅
`coastal-strip` + both sea walls + POI `sea-wall-fight`: wall surface, breakers, the finale apron, drowned piers, coastal blocks.

* **Wall.** The Stage 1 extrusion and the published profile stay (crest 90 m, and 75 m on the harbor wall). Near detail streams one 72 m segment per frame (128 m on the harbor wall), caps 2 / 4 / 7 / 10 by tier, reach 420 / 780 / 1,000 / 1,200 m (harbor × 0.62). Formwork, joints every 40 m, drains, ladders, catwalks, cold lamps, access towers, a crest road and a 1.15 m parapet. Colliders are stepped ~160 m slices. Stage 1 had `hw` and `hd` swapped for `yaw = atan2(nx, nz)`.
* **Water.** Shader swell, foam, and instanced spray share `waveClock` with `Ambience.setSurf`. Low tier draws no swell. A wet sheet rides the apron, or the lowest dry terrace. Sea fog is `U.streetFog`, not a new fog colour. Crest rain uses the existing wind.
* **Apron and coast.** The pin stays inland. The pad is at the toe nearest it, deck 7.05 m, outside the ocean polygon. Stairs rise ≤ 0.40 m. `__nla.coastView('crest'|'terraces'|'apron'|'spray'|'piers'|'blocks'|'aerial')`. Fabric is 15–60 m `Style.Coastal`, not the megablock kit. One hauler, one crest patrol. No hologram, no interior, no street graph. Piers are unbranded and instanced.

What the next stage should know: X2 Ground traffic is next. Do not add a street graph on `coastal-strip`, and do not fill the coast with cars — the hauler and the patrol are the traffic. Harbor cranes and ships are Stage 19; the harbor wall already has the lower-density surface. Crest height stays 90 m. Surf is `setSurf` on the existing bus. Sea fog is `streetFog`.

## Stage 11 — Lakewood / Downey Residential Megablocks ✅
`lakewood-megablocks`: archetype `lakewood-megablocks` on this polygon only. Shared planner `fillResidentialBlock` / `dressResidential` in `src/districts/_shared/residential/`. Five families, courtyards you can walk into, laundry and AC, corner markets one block in eight, a covered yard at 33.853 N / 118.141 W with one `buildCorridorRoom` shop. Sodium lamps, crowd share 0.12. Street lattice `lakewood-streets`, lane 6.2 m, JSON `traffic` 0.15. Spinners stay above the slabs. `__nla.lakewoodView(...)`.

What the next stage should know: Stage 12 (`south-la-megablocks`) should call `fillResidentialBlock(ctx, params)` and `dressResidential(block, plan, layout)` with a new archetype id and its own heights, module, weights and `marketEvery`. It should not copy `plan.ts`, and it should not point this polygon back at `megablock-residential`. Register its own lattice with its own prefix and a `lane` of at least 5 m if it wants cars rather than rickshaws. A lane that wide will also attract 74 m and 112 m spinners unless `SpinnerTraffic` skips that district the way it skips Lakewood. Streaks for a new route id get their own cap; do not reuse `downtown-avenues` or `broadway-canyon`. Do not share nodes, and do not add a ramp. The real 605 / San Gabriel River and the 91 are still absent from `city-layout.json`. Signal Hill (inside this polygon, ground above 45 m) remains `hills-sparse`.

## Stage 12 — South LA Residential Megablocks ✅
`south-la-megablocks`: archetype `south-la-megablocks` on this polygon only. Same library as Stage 11, with its own params (module 3.2 m, taller bias, sootier tint, market spines, a 1,500 m step-down toward Wallace). Covered yard at 34.014 N / 118.288 W with one laundromat. Cold pylons, crowd share 0.20. Street lattice `south-la-streets`, lane 5.6 m, JSON `traffic` 0.18. Spinners stay above the slabs. `__nla.southLaView(...)`. `megablock-residential` stays registered and unused.

What the next stage should know: Stage 9 has shipped on its own polygon. Do not point this polygon back at `megablock-residential`. The library dials `heightBias`, `courtReach`, `courtCap`, `courtBias`, `spines` and `face` are optional and default off; omit them and Lakewood's plan stays the one Stage 11 shipped. `dressResidential` takes an optional fourth argument (`lamps: 'cold'`, `busy`); omit it and the kit is Lakewood's. A `lane` of 5 m or more still parks spinners at 74 m and 112 m unless `SpinnerTraffic` skips that district. South LA uses the same skip as Lakewood (spawn 158–210 or 240–420, lift under ground + 155). A new streak route gets its own cap; `south-la-streets` does not share the downtown or Broadway pool. Do not share nodes, and do not add a ramp. Do not register `coastal-strip`, `k-megablock` or `wallace-vernon`. The 605 and the 91 are still absent from `city-layout.json`. Ground above 45 m inside this polygon stays `hills-sparse`.

## Stage 13 — Westside Sprawl ✅
`westside`: archetype `westside-sprawl` on this polygon only. Shared helper `src/districts/_shared/sprawl/` (`fillSprawlBlock` / `planSprawl` / `dressSprawl`), strips and towers and the yard default off. Ordinary lots 3–12 storeys at 3.4 m, towers to 60 m along Wilshire and in one Century City cluster, rooftop clutter, strip markets on the snapped arterials, a covered yard at 34.0434 N / 118.4215 W with one diner. Crowd share 0.14. Street lattice `westside-streets`, lane 5.4 m, JSON `traffic` 0.22. Spinners stay on the 74 / 112 m park; roofs stay under 66 m. Far-LOD lights copy the old `sprawl-dense` pair (1 / 0.35). `__nla.westsideView(...)`. `sprawl-dense` stays registered for East LA.

What the next stage should know: Stage 14 (Basin Sprawl) is next. Call `fillSprawlBlock` / `dressSprawl` with a new param object. Pass `storeys` for the 6–35 m row; the omitted default is 3–10 (10.2–34 m), not Westside's 12. Strips, towers, the hub, the east rise and the freeway wall default off. Do not point `basin-sprawl` at `westside-sprawl`, and do not point `westside` back at `sprawl-dense`. East LA still uses `sprawl-dense`. Retune the far-LOD carpet on `basin-sprawl` only (`SPRAWL_LIGHTS['basin-sprawl']` is 1, `STREET_NEON['basin-sprawl']` is 0.25). Leave `westside-sprawl` at 1 / 0.35 unless a seam needs it. Do not edit the ground-light shader. Do not add a fog or audio path for the basin. Register the basin lattice with its own prefix. Do not share nodes with `westside-streets`, and do not add a ramp. A `lane` of 5 m or more parks spinners at 74 / 112 m. Westside did not skip them because the roofs stay under 66 m. A later stage that grows past about 70 m needs the Lakewood / South LA / Arts skip (spawn 158–210 or 240–420, lift under ground + 155). A new streak route gets its own cap. Do not register `coastal-strip`, `k-megablock` or `wallace-vernon`. Ground above 45 m stays `hills-sparse`. The LA River polyline is not to be recut.

## Stage 14 — Basin Sprawl (default) ✅
`basin-sprawl` is the default district (no polygon). Archetype `basin-sprawl` calls `fillSprawlBlock` with its own params: 2–10 storeys at 3.4 m (6.8–34 m), cap 35 m, strips on the snapped arterials, towers / hub / rise / freeway wall off. Sparse rooftop clutter comes from the helper. Crowd share 0.07. Street lattice `basin-streets`, prefix `bs`, lane 5.1 m, JSON `traffic` 0.2. Spinners stay on the 74 / 112 m park; roof plus mast stays near 45 m. Far-LOD lights are 0.52 and street neon is 0.16. `westside-sprawl` stays 1 / 0.35. `__nla.basinView(...)`. Ground above 45 m stays `hills-sparse`. Generation stays chunked.

What the next stage should know: Stage 15 (Southeast Refinery Belt) is next. `southeast-industrial` still uses the shared `industrial` archetype, and the old pyramids still use that same id. Give the belt its own body (a new id, or replace `industrial` only if the pyramids are meant to change with it). Do not point the belt at `basin-sprawl` or `westside-sprawl`. Do not point `basin-sprawl` at `westside-sprawl`, and do not point `westside` back at `sprawl-dense`. East LA still uses `sprawl-dense`. Leave `SPRAWL_LIGHTS['basin-sprawl']` at 0.52 and `STREET_NEON['basin-sprawl']` at 0.16, and leave `westside-sprawl` at 1 / 0.35, unless a new seam needs a change. Do not edit the ground-light shader. Do not add a fog or audio path for the basin. Do not share nodes with `basin-streets` (prefix `bs`), and do not add a ramp. A `lane` of 5 m or more parks spinners at 74 / 112 m. Basin did not skip them because the roofs stay near 45 m. A later stage that grows past about 70 m needs the Lakewood / South LA / Arts skip (spawn 158–210 or 240–420, lift under ground + 155). A new streak route gets its own cap; `basin-streets` does not share the downtown or Broadway pool. Signal heads are a 768-slot buffer filled from the 500 m bins. Street queries use those bins. Do not go back to scanning every edge. Do not register `coastal-strip`, `k-megablock` or `wallace-vernon`. Ground above 45 m stays `hills-sparse`. The LA River polyline is not to be recut. The 605 and the 91 are still absent from `city-layout.json`.

## Stage 15 — Southeast Refinery Belt ✅
`southeast-industrial`: archetype `southeast-refinery` on this polygon only. Shared helper `src/districts/_shared/refinery/` (`planRefinery` / `mountRefineryFlames` / `setRefineryFlame`), every flag default off. Tank farms, pipe racks, cracking columns 32–58 m, flare stacks 84–140 m with a city-wide flame sprite (flicker, wind lean, tier gain, visible from downtown and from 1 km). One pump house (`southeast-pump`) on `buildCorridorRoom`. Crowd share 0.04. Street lattice `southeast-streets`, prefix `se`, lane 6.6 m, JSON `traffic` 0.32, mix box trucks and tankers. Spinners skip this district (stacks enter the 74 / 112 m parks). One freight lane `southeast-freight` at ground + 188 m on j = 62. Far-LOD lights 0.9 / street neon 0.18. Basin stays 0.52 / 0.16. Westside stays 1 / 0.35. `industrial` stays 0.35 / 0.1 for South Bay. `__nla.southeastView(...)`. The old pyramids stay landmarks. Ground above 45 m stays `hills-sparse`.

What the next stage should know: Stage 16 (Hollywood Entertainment Strip) is next. Do not retune `southeast-refinery` (0.9 / 0.18), `basin-sprawl` (0.52 / 0.16) or `westside-sprawl` (1 / 0.35). Do not edit the ground-light shader. Do not point Hollywood at `southeast-refinery`, `basin-sprawl` or `westside-sprawl`. East LA still uses `sprawl-dense`. Do not share nodes with `southeast-streets` (prefix `se`) or `basin-streets` (prefix `bs`), and do not add a ramp. Do not add a spinner skip for the basin or for Westside. Basin roofs stay near 45 m. Westside roofs stay under 66 m. A new streak route gets its own cap. Signal heads stay a 768-slot buffer filled from 500 m bins. Do not register `coastal-strip`, `k-megablock` or `wallace-vernon`. Ground above 45 m stays `hills-sparse`. The LA River polyline is not to be recut. The 605 and the 91 are still absent from `city-layout.json`. Stage 18 should call `planRefinery`, `mountRefineryFlames` and `setRefineryFlame` with its own params and its own archetype id. It must not point `south-bay-refineries` at `southeast-refinery`, and it must not replace `industrial` until that polygon has its own id. The El Segundo landmark (`flare-field`) stays. Do not share nodes with `southeast-streets`. A Stage 18 detail module has to rebuild the block seed with `hash2i` (the chunk buffer stores it as float32, and the rounded value changes the yard).

## Stage 18 — South Bay Refineries
`south-bay-refineries`: tank farms, pipe racks, flare stacks with animated flames (the 1982 "Hades" look), and the El Segundo flare field in full. Call the Stage 15 kit (`src/districts/_shared/refinery/`) with a new param object and a new archetype id. Leave `industrial` in place until that id exists. Do not point this polygon at `southeast-refinery`. Rebuild the block seed with `hash2i` before planning details: the chunk buffer stores it as float32, and the rounded value changes the yard.

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
| **X2 Ground traffic** | ✅ Cars, vans, box trucks and haulers on the shared street graph, sunken trenches on the 110, the 101 and the 10, and clocked signals. Low tier is light streaks. | Districts call `registerStreetLattice` from `src/vehicles/traffic-index.ts` and set `traffic` in the JSON. Do not add a graph. |
| **X3 Interiors framework** | ✅ Door volumes, baked light, occluded exterior, muffled rain. API in `src/world/interiors/README.md`. The Bradbury court is the proof; `buildCorridorRoom` is the template. K's apartment, the lobby, the corridor, the roof head-house and three lift cars now call `registerInterior`. The noodle bar and the LAPD lobby stay soffits. | Later rooms call `registerInterior`. A floor change uses `rides` (a fade, not a moving car) |
| **X4 Holograms** | shared hologram system (giant animated figures, ad loops, scanline/flicker shader, light spill) | ✅ API in `src/world/holograms/README.md`. Showcase set is on the market lane, the megatower crowns, shafts and podiums (Stage 3), the financial avenue and two downtown billboards. Kind-2 panels under 140 m² stay the cheap sign. Stages 6/16 only call `registerHologram`. |
| **X5 Audio** | Market bed is in (awning rain, murmur, sizzle, distant spinner), on the ambience bus, equal-power panners. Sea-wall surf is in: a brown-noise wash and a band-passed impact on that same bus (`Ambience.setSurf`), phased with the visible breaker, plus crest wind on the existing wind gain. Still to do: PA in invented languages, per-stall variety, and a bus that districts can register without editing `App.ts`. | no music |
| **X6 Performance** | Frame-loop collision is now a worker with a sync fallback for cinematic queries and street spawn. Still open: GPU culling, interior mapping, shadows on high/ultra, and an iPhone profiling pass on device (the VM only has SwiftShader). | do this if a later district blows the 250-draw / 1.5 M budget |
| **X7 Photo mode** | free camera, depth of field, film grain, screenshot export | |

What the next stage should know: Stage 16 (Hollywood Entertainment Strip) is next. Basin is on `fillSprawlBlock` / `dressSprawl` with archetype `basin-sprawl` and lattice `basin-streets` (prefix `bs`, lane 5.1 m, traffic 0.2). Westside is on `westside-sprawl` and `westside-streets`. South LA is on `fillResidentialBlock` / `dressResidential`. The Arts District is on its own `industrial-dense` body, lattice `arts-streets` and freight lane `arts-freight`. The Southeast Refinery Belt is on `southeast-refinery`, lattice `southeast-streets` (prefix `se`, lane 6.6 m, traffic 0.32) and freight lane `southeast-freight`. `industrial` stays the Stage 1 body for `south-bay-refineries`. The old pyramids are landmarks, not that archetype. Do not add a second graph. Do not register `coastal-strip`, `k-megablock` or `wallace-vernon`. Lattices still do not share nodes, and there are no ramps. A new streak route gets its own cap. `lane` ≥ 5 parks spinners at 74 / 112 m unless that district is skipped the way Lakewood, South LA, the Arts District and the refinery belt are (spawn 158–210 or 240–420, lift under ground + 155). Westside is not skipped; its roofs stay under 66 m. Basin is not skipped; roof plus mast stays near 45 m. The 605 and the 91 are not in the JSON yet. The LA River polyline is not to be recut. Far-LOD `westside-sprawl` stays 1 / 0.35. `basin-sprawl` is 0.52 / 0.16. `southeast-refinery` is 0.9 / 0.18. `industrial` stays 0.35 / 0.1. Do not edit the ground-light shader. Stage 18 reuses `src/districts/_shared/refinery/` with its own params and must not point South Bay at `southeast-refinery`.

## Suggested order

Stages 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, X2, X3 and X4 are done. Next: 16 → 17 → 18 → 19 → 20 → 21, with X1/X5/X6/X7 where they unblock the next district. Later stages add holograms by calling `registerHologram`, not by replacing the field, and interiors by calling `registerInterior`. Build anything taller than 320 m with the megatower kit as a landmark. Civic Center already calls `registerCrowdSource` on the market mesh. Stage 8 consumed X3; it did not add a second interior system. Stage 7 calls `registerInterior` for one room and does not add a street graph. Stage 10 does not add a street graph on the coast. Ground traffic is `registerStreetLattice` plus the district `traffic` weight. Stage 12 registered `south-la-streets` and moved South LA off the Stage 1 blockout. `megablock-residential` stays registered. Stage 9 kept the id `industrial-dense` and replaced its body. Stage 13 registered `westside-streets` and moved Westside off `sprawl-dense`. `sprawl-dense` stays registered for East LA. Stage 14 registered `basin-streets` and moved the default district off the Stage 1 blockout. The shared sprawl helper defaults strips, towers, the hub, the rise and the wall off. The LA River polyline was not recut. Stage 15 registered `southeast-streets` and moved the belt off the Stage 1 blockout onto `southeast-refinery`. The shared `industrial` id stays for `south-bay-refineries`. The old pyramids stay landmarks. The refinery kit defaults every flag off.
