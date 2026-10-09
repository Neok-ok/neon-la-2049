# Architecture

How the engine is put together, so any stage can pick it up cold. Read with [BIBLE.md](BIBLE.md) (what to build),
[ROADMAP.md](ROADMAP.md) (in which order) and [ADDING_A_DISTRICT.md](ADDING_A_DISTRICT.md) (how to plug in a district).

## Stack

* **Vite 8 + TypeScript 5.9 (strict)**, ES modules, no framework.
* **three.js r186** through `three/webgpu`: `WebGPURenderer` with **TSL node materials**. The renderer runs on WebGPU where an adapter
  exists (Chrome/Edge, Safari 26+/iOS 26+) and falls back to **WebGL2** automatically. `?webgl=1` forces WebGL2.
* Static site, `base: './'`, deployed to GitHub Pages by `.github/workflows/deploy.yml`.

```
src/
  main.ts                  bootstrap + error screen
  app/App.ts               wires everything; frame loop; quality; URL params; debug API (window.__nla)
  core/                    params (URL), quality tiers + auto-detect, deterministic RNG/hashes
  data/city-layout.json    THE city plan: districts, landmarks, POIs, coast, sea walls, freeways, river, hills
  world/
    geo.ts                 lat/lon <-> metres
    layout.ts              typed, indexed view of city-layout.json (district lookup, ocean, heights, reserved corridors)
    fabric/                procedural city "fabric" (worker-safe): generator, archetype registry, mesher, chunk worker
    streaming/             ChunkStreamer: quadtree LOD streaming + worker pool + uploads
    detail/registry.ts     main-thread LOD0 street-detail modules (lamps, props...)
    materials/             node materials: city fabric, neon signs, ocean, LUT helper
    holograms/             shared projectors: registry, scanline shader, spill, tiered field (see that folder's README)
    interiors/             door volumes, baked interior light, occluded exterior (see that folder's README)
    landmarks/             landmark registry, LOD manager, Stage-1 blockout builders, sea walls, beacons, flares
    CityQuery.ts           collision / ground / "where am I". Frame loop reads a worker-filled LRU; cold calls still generate on the main thread
    query.worker.ts        packs colliders + block records for CityQuery
    queryPack.ts           shared collider filter (worker and main thread)
  districts/
    fabric-index.ts        worker-side registry entry: imports every archetype module
    detail-index.ts        main-thread registry entry: imports every detail module
    landmark-index.ts      main-thread registry entry: imports every landmark builder module
    _shared/               Stage-1 blockout archetypes, shared street lamps, the street kit and the megatower kit
  atmosphere/              uniforms, sky + height fog, day/night, weather state machine, rain/snow
  vehicles/                spinner + transport models, sky lanes, and one ground graph (streets, trenches, signals)
  camera/                  fly / walk / cinematic controllers + CameraSystem (mode switching)
  input/                   keyboard/mouse/pointer-lock + touch joysticks
  audio/                   procedural rain/city/wind ambience (WebAudio, no samples, no music)
  ui/                      toolbar, title card, HUD, letterbox/fade, CSS
scripts/                   gen-map.mjs (docs/map*.svg), screenshots.mjs (headless captures)
```

## Coordinates

Metres; `+X` east, `+Y` up, `+Z` south; origin at 34.0522 N, 118.2437 W. Headings are **compass radians** (0 = north = `−Z`,
`+π/2` = east). A camera with heading `h` and pitch `p` uses `rotation.set(p, −h, 0, 'YXZ')`. A street grid with bearing `b` has
axis A = `(sin b, −cos b)` and axis B = `(cos b, sin b)`. Buildings are yawed by `π − b`.

## The city plan (data)

`src/data/city-layout.json` is the single source of truth. `CityLayout` (`world/layout.ts`) converts it to metres once and answers:

* `districtAt(x,z)`: the highest-`priority` polygon containing the point, else `defaultDistrict` (basin sprawl).
* `isOcean`, `heightAt` (gaussian hills, flattened basin), `inBounds`.
* `isReserved(x,z)`: inside a landmark's `reserveRadius` or a freeway/river/sea-wall corridor, so no fabric is built there.

`layout.ts`, `fabric/*` and `districts/_shared/archetypes.ts` are **pure** (no DOM, no three.js objects), so the same code runs in the
chunk worker and on the main thread (for `CityQuery`).

## Procedural fabric

```
district polygon + grid (bearing, block size, street width)
  └─ generator.enumerateBlocks(chunk)      every grid block whose centre lies in the chunk (a block belongs to exactly one chunk)
       └─ archetype(ctx)                   district code: ctx.lots(), ctx.box(), ctx.sign()
            └─ Box[] + Sign[] + BlockInfo[]
                 └─ mesher.buildChunkArrays(lod)   LOD filter → packed Float32 arrays (+ ground mesh)
```

* **Determinism:** every block's RNG is seeded from `hash2i(i, j, districtIndex)`. The same block always produces the same buildings,
  at every LOD and on every thread. Collision (`CityQuery`) regenerates fabric instead of reading GPU buffers.
* **Boxes** carry `style` (window grid and albedo table), `lit` (fraction of lit windows), `tint`, `seed` and a `detail` level
  (0 = mass, 1 = secondary, 2 = rooftop clutter). The mesher writes per-vertex `facade` (metres along the façade, metres up) and
  `bdata = (seed, style, lit, tint)`. The city material does everything else procedurally (windows, staining, wetness, snow), so chunks need **no textures**.
* **Signs** are packed separately and drawn as one `InstancedMesh` per chunk with the neon sign material (generic glyph blocks,
  animated billboards, flicker). Kind-2 panels of at least 140 m² are also reported to the hologram field, which may draw a figure in front of them.

### LOD rules (`mesher.lodRules`)

| LOD | Used for | Boxes kept | Signs kept | Ground |
|---|---|---|---|---|
| 0 | chunks within `lod0Radius` | all (detail ≤ 2) | all | 25 m heightfield cells |
| 1 | chunks within `nearRadius` | detail ≤ 1 | area ≥ 12 m² | 50 m cells |
| 2 | 2 km superchunks out to `farRadius` | detail 0, taller than 22 m | area ≥ 150 m² | 100 m cells with a **procedural light carpet** standing in for low-rise sprawl |

Far away, the window pattern fades to its mean emission (`fwidth` + distance), so there's no moiré and the night city keeps its glow.

## Streaming (`world/streaming/ChunkStreamer.ts`)

* Two-level quadtree: **superchunks of 2,000 m** (one far LOD2 mesh each) refined into **4×4 chunks of 500 m** (LOD1/LOD0) when within `nearRadius`.
* Distances are 3D to the chunk's AABB (0–260 m), so climbing in a spinner naturally coarsens the city.
* **Focus points:** `update([camera, ...extra])`. The cinematic director passes its *next* shot's position 3 s before the cut, so the target area streams in early.
* **Hole-free swaps:** a slot keeps its old mesh until the replacement arrives. Refined children stay hidden until all 16 are ready,
  then the far mesh is dropped in the same frame.
* **Worker pool** (`fabric/chunk.worker.ts`, 2–4 workers by tier, ≤ 2 jobs per worker). Results are transferred as typed arrays, and at most
  `uploadsPerFrame` meshes are built per frame, nearest first, to avoid upload spikes.
* LOD0 chunks also get **detail modules** (`world/detail/registry.ts`): main-thread builders that return instanced props for the
  chunk's blocks. They are disposed with the chunk. Shared geometry is flagged `userData.sharedGeometry` so it isn't disposed.

## Landmarks (`world/landmarks/`)

Each landmark `type` in the JSON maps to a builder registered with `registerLandmarkType(type, builder)` (`registry.ts`). District
modules register through `src/districts/landmark-index.ts` and override the Stage-1 blockouts, which `Landmarks.ts` registers with
`registerLandmarkDefault`. A builder returns `{ object, colliders }` and may add beacons or flares. Geometry goes through `GeoWriter`
and uses the **same vertex layout and material as the fabric**, so a landmark gets windows, wetness and snow for free.
Sea walls are extruded along their polylines with a terraced profile, and the ocean is a single shape at `SEA_LEVEL_2049 = 6 m`.
Stage 10 keeps that far mesh. Within about a kilometre, `src/districts/coastal-strip/surface.ts` streams one near segment per frame
(formwork, joints, drains, ladders, lamps, parapet, towers). Colliders are stepped slices from `coastal-strip/collision.ts`:
local X runs along the wall and local Z runs seaward. A swell ribbon, spray cards and a wet sheet live in `coastal-strip/waves.ts`
and shut off on the low tier. The finale apron, drowned piers and the coastal fabric are documented in `coastal-strip/README.md`.

* **LODs** (`LandmarkLods.ts`): a builder can hand `env.lods.add(id, levels, dists, x, z, y0, y1, r)` up to three levels. Each frame
  the manager measures the distance to the structure's vertical axis segment minus its footprint radius, scales the switch distances
  by the tier's `landmarkLod` (0.6 / 0.8 / 1.0 / 1.35) and keeps 8% hysteresis. Hero towers switch at 1.9 / 6.5 km, skybridges at
  1.5 / 5 km, the Wallace pyramid at 6 / 18 km and the old pyramids at 3.5 / 11 km. The last level is a mass-only proxy of about
  100–200 triangles: at that range it is a silhouette in the fog and serves as the distant impostor. All levels share the city
  material, so a switch never changes material or draw-call count. `stats().landmarkLods` reports `lod0/lod1/lod2` counts.
  LAPD switches at 520 / 1,900 m and City Hall at 420 / 1,500 m, before that scale.
* **Megatower kit**: heroes and the Wallace pyramid are built by `src/districts/_shared/megatower/` (see ADDING_A_DISTRICT §5).
* **Civic Center** (Stage 5) draws two landmark city-meshes (plus a sign mesh on LOD0 only) and one street-kit batch. It opts out of the shared sodium lamps. Background blocks are compact megablocks. See `src/districts/civic-center/README.md`.
* **Beacons** (`Beacons.ts`): every aviation, pad, police and floodlight point in the city is one merged mesh of camera-facing additive
  quads (one draw). The quad never shrinks below ~3 px (`MIN_ANGLE`); bigger far quads dim to keep the energy roughly constant.
  Kinds: synchronised red flash (0.5 Hz, the whole skyline together), steady red, police red/blue, white double strobe, amber pad
  pulse, warm floodlight. Lights see 30% of the fog optical depth and dim by day, except the strobes.
* **Colliders**: landmark colliders sit in a 120 m bucket grid in `CityQuery` (`insideLandmark`, `landmarkTopAt`), so a few hundred
  kit boxes cost the same per query as the old dozen.

## Atmosphere (`atmosphere/`)

* `uniforms.ts`: one shared set of TSL uniforms (time, day/night, wetness, snow, fog, sky colours, sun, window-lit fraction, sign power, lightning) read by every material.
* `SkyFog.ts`: background node (gradient, drifting cloud noise, sun glow, horizon blend) plus **analytic exponential height fog**.
  The fog integral along the view ray lets tall landmarks rise above the smog. `fogDepth(ro, p)` returns the optical depth: the
  exponential ground fog, a gaussian **inversion layer** (`layerDensity`, `layerY`, `layerW`; integrated with an erf approximation)
  and uniform haze. Beacons and lane lights reuse it at a fraction.
* `Atmosphere.ts`: day/night (30 real minutes per day by default), palette blending (night / dusk / day, smog and snow tints),
  hemisphere + sun lights, exposure, a procedural environment map, lightning.
* `Weather.ts`: a Markov state machine (dry haze, overcast, drizzle, rain, heavy rain, fog, smog, snow, sleet) with timed,
  45 s cross-faded transitions. Wetness and snow cover accumulate and dry with time.
* `Precipitation.ts`: rain streaks and snowflakes are GPU quads in a box that wraps around the camera. All motion happens in the vertex
  shader, wind drift is accumulated on the CPU, and the particle count is set per tier with `drawRange`.

## Sky lanes (`vehicles/skyLanes.ts`, `vehicles/LaneTraffic.ts`)

`buildSkyLanes(query)` derives the high traffic from the landmark JSON: grid-aligned avenues between the heroes, holding loops
over crowns, LAPD and the Wallace apex, and long corridors. Each lane is sampled against the landmark collider grid and moved or
dropped if it would hit a tower. Open lanes carry `altBias` (default 7 m, the height split between directions) and `fade` (default 220 m at each end). LAPD pad approaches set those to 0 and 70 m so a flare sits on the deck. `LaneTraffic` deals `quality.laneTraffic` cars over the lanes (platoons, weighted by length),
moves them on the CPU and writes five instanced meshes: spinner body + lights, transport body + lights, and one glow billboard per
car with a minimum pixel size. That is five draws in total whatever the count. `nearestTo()` feeds the positional flyby voice in
`MarketAudio` (closing speed sets a Doppler pitch, transports are lower and heavier).

## Cameras (`camera/`)

All controllers implement `Controller { enter(pose), exit(), update(dt), pose() }`. `CameraSystem` hands the pose across when switching.

* **Fly** (`FlyController`): spinner with chase and cockpit views (`V`), thrust along the look direction, cruise 75 m/s, boost 260 m/s,
  per-axis collision sliding against fabric and landmarks, landing on roofs/streets, banking.
* **Walk** (`WalkController`): 1.7 m eye, 1.5/4.2 m/s, capsule collision against fabric boxes (`CityQuery.resolveCircle`), 0.45 m step-up,
  gravity, head bob. Entering walk drops you onto the nearest open street, and the spinner stays parked where you left it (`F` re-boards it).
* **Cinematic** (`CinematicDirector`): nine shot types (flyover, landmark orbit, street dolly, crane-up, telephoto, spinner tracking,
  sea-wall run, rooftop pan, freeway-trench run), each with freshly randomised continuous parameters from a crypto-seeded RNG.
  A signature set plus type/anchor history makes repeats effectively impossible: no shot type twice in a row, no anchor within 5 shots.
  It mixes hard cuts and fades and shows a 2.39:1 letterbox.

## Input and UI

* `Input`: keyboard (edge-triggered `wasPressed`), pointer lock (fly/walk) or drag-to-look, plus touch state.
* `TouchControls`: shown on coarse-pointer devices (or `?touch=1`). Left stick moves, right stick looks, ▲ ▼ » buttons in fly mode.
* `UI`: title card (fly / walk / watch), toolbar (modes, next shot, quality, weather, time, sound, HUD, help). On phones the secondary
  controls collapse behind `⋯` and the bar moves to the top.
* `HUD` (`H`): fps and worst frame, backend, tier, draw calls, triangles, streaming stats, position (metres and lat/lon), district and stage,
  time, weather, current shot.

## Quality tiers (`core/quality.ts`)

| Tier | Pixel ratio cap | LOD0 / near / far radius | Rain | Bloom | AI spinners | Lane cars | Landmark LOD scale | Workers |
|---|---|---|---|---|---|---|---|---|
| low | 1.0 | 320 / 900 / 4,500 m | 2.5 k | off | 24 | 60 | 0.6 | 2 |
| medium | 1.5 | 450 / 1,300 / 7,000 m | 6 k | off | 50 | 140 | 0.8 | 2 |
| high | 2.0 | 600 / 1,800 / 10,000 m | 14 k | on | 110 | 240 | 1.0 | 3 |
| ultra | 3.0 | 800 / 2,400 / 14,000 m | 24 k | on | 180 | 380 | 1.35 | 4 |

Ground traffic budgets (street / freeway near vehicles), before the district `traffic` weight: low **0 / 0** (light streaks only), medium **22 / 24**, high **40 / 40**, ultra **64 / 56**. The street count is `round(budget × district.traffic)`.

* **Auto-detect** picks the tier from the UA, the WebGL renderer string and WebGPU availability: software → low; iPhone with WebGPU → medium;
  other mobile → low (medium on 8-core, 8 GB devices); integrated GPU → medium; Apple silicon or discrete GPU → high.
* **Runtime safety net:** in Auto, more than 6 s below 24 fps drops one tier, with a toast. Holograms read that same live tier, so the drop also cuts panel count, shader detail, spill and cull range.
* **Manual override** in the toolbar is saved in `localStorage['nla.quality']`. `?quality=` beats both.

### Holograms (`world/holograms/`)

One instanced draw for every projector, plus one draw for wet-street spill cards. Seven designs share that shader; index 6 is `veil-dancer` (Stage 6). A new design is a branch in `material.ts`, not a second material. Placements come from `registerHologram` (landmarks, the X4 showcase) and from kind-2 signs on chunks that are currently showing. The field re-picks the visible set every frame:

| Tier | Panels | Detail | Spill lights into fabric/kit | Ground cards |
|---|---|---|---|---|
| low | 6 | coarse scan, no flicker budget, no spill | 0 | 0 |
| medium | 18 | scan, flicker, motion | 3 | 6 |
| high | 32 | plus a ghost slice on the nearest 5 | 4 | 12 |
| ultra | 48 | plus a second ghost slice | 4 | 16 |

Street-band panels cull at `lod0Radius * 0.9`. Tower-band panels cull at `nearRadius * 1.35`. Skyline-band panels (megatower crowns) cull at `max(nearRadius * 1.35, farRadius * 0.55)`. Both radii are the streaming radii above, so a tier change moves holograms with the city. Off-screen panels do not spend the cap. Spill is a wrapped falloff on the shared city and kit materials (four fixed slots, no uniform array — those mis-index on WebGL2), not a shadow-casting light. The API for Stage 3 is [`src/world/holograms/README.md`](../src/world/holograms/README.md).

## Interiors

`InteriorSystem` mounts rooms registered with `registerInterior` (see [`src/world/interiors/README.md`](../src/world/interiors/README.md)). A district calls it once from `src/districts/interior-index.ts`. The plan is plain data: an oriented volume, door boxes, and a `build(detail)` that returns boxes, baked lights and portal quads. `buildCorridorRoom` is the corridor-and-room template Stage 8 extends.

Walk mode is the only mode that enters. An exterior door keeps the city visible while the feet are still in that box. Past it, the fabric, holograms, crowds, traffic, rain, haze and every landmark not listed in `keepLandmarks` are hidden, and a procedural card fills the opening. That card is one draw. It is not a second render of the street, so the draw-call counter stays honest. Fly mode treats every interior volume as solid, open roof included.

Interior light is vertex colour plus an emissive attribute on an unlit mesh. It does not follow the night, wet or sign uniforms, and it does not add a scene light. Rain and the city bed go through a low-pass on the ambience master, so market layers muffle too. Open-court rain is a local streak mesh on medium and up.

The Bradbury court (`bradbury-court`) and the service corridor behind it (`bradbury-service`) are the proof. The service corridor is the template. K's megablock is the second caller: `k-lobby`, `k-corridor`, `k-apartment`, `k-head`, and three lift cars, all through `registerInterior`. A ride fades between those cars. It is not a moving mesh and not a portal chain. Colliders are registered once with `CityQuery` and do not change with the tier. A tier change rebuilds the meshes (detail 0 / 1 / 2 / 3).

While a walker is inside, expect the draw count to fall to the kept shell plus a handful of interior meshes. On the street in front of an open door the streamed interior adds about one draw. Both have to stay under 250 draws and 1.5 M triangles.

### iPhone performance budget (target: iPhone 13+ in Safari, medium tier, 30–60 fps)

| Budget | Value |
|---|---|
| Draw calls | ≤ 250 (fabric is 1 mesh + 1 sign batch per chunk; ~60–120 visible chunks) |
| Triangles | ≤ 1.5 M |
| Canvas pixels | ≤ 1.5 × DPR (≈ 2.9 M px on a 390 × 844 pt screen) |
| Chunk upload | ≤ 2 per frame, ~1–3 ms each |
| GPU memory | ≤ 300 MB (chunk geometry ~0.5–2 MB each at LOD0) |
| Particles | ≤ 6 k rain quads |
| Post | none (bloom is high/ultra only) |

New district stages must keep a LOD0 chunk under ~40 k triangles and ~4 draw calls (fabric + signs + ≤ 2 detail batches),
or add their own LOD rules. Little Tokyo is the documented exception: a dressed chunk adds kit opaque, an optional
fade pass, steam and neon pools (about four detail draws). Downtown megablocks are the second: the same kit passes,
plus an optional add pass for stall faces, and a plaza detail group on chunks that contain the MT-1 or MT-5 apron.
Props are capped per tier (DTLA medium is 1,600 street props). A pure DTLA chunk is about 10 k fabric triangles;
the heaviest sampled chunk that included DTLA blocks was about 20 k. The acceptance test is still
the global medium budget, not the two-batch guide.

Ground traffic is one graph (`vehicles/streetGraph.ts`, also exported as `downtownGraph`), not a per-chunk mesh. A district registers a lattice by importing a module from `vehicles/traffic-index.ts` and calling `registerStreetLattice`, and by setting `traffic` (0–1) on the district in `city-layout.json`. That weight scales the street budget. `coastal-strip`, `k-megablock` and `wallace-vernon` are refused even if the weight is raised. Do not add another graph.

The downtown avenues (`lane` 7.2 m), the historic-core lattice (`lane` 3.15 m) and the Lakewood lattice (`lane` 6.2 m, route `lakewood-streets`) are separate registrations. Their nodes are not shared, and none of them shares nodes with a freeway chain. Freeway trenches (`registerFreewayTraffic`) are the 110, the 101 and the 10. The chunk mesher omits ground cells over those three (`trenchQuery.ts`) so the deck is visible; the lips cover the seam. The 405, 5, 105 and 710 are far streaks only. Spinners skip `lane < 5`, every `kind: 'freeway'` edge, and every Lakewood edge. Over historic-core they fly free at 148–260 m instead of 74 / 112 m. Over Lakewood a spawn is 158–210 m or 240–420 m, and a free flier below ground + 155 m is lifted. Avenue sky lanes in the 175–260 m band are ordinary `LaneTraffic` polylines (`dtla-avenue-*`). Downtown and Broadway light streaks keep their own pool; each later street route has its own cap so a large lattice does not thin them. Signal heads submit only within 500 m.

Near vehicles are one instanced draw per class (compact, van, box truck, hauler) on a shared wet material. Headlights and taillights are emissive on that mesh, plus the existing wet-street pool when it is raining. Signals are two more instanced draws (pole and head). Only heads within 500 m are submitted. The trench is one mesh. Streaks are one instanced draw. Low tier draws streaks only. A Broadway LOD0 chunk still adds the same kit / steam / pool draws the market and DTLA already add; a measured fabric chunk there was about 8–9 k triangles.

## URL parameters and debug API

`?mode=fly|walk|cine &at=<landmark|poi id> &x= &y= &z= &yaw=° &pitch=° &time=0–24 &weather=<id> &quality=low|medium|high|ultra
&webgl=1 &hud=1 &ui=0 &freeze=1 &touch=1 &refl=0|1`

`window.__nla` (console and automation): `isIdle()`, `setMode(m)`, `setPose(x,y,z,yaw°,pitch°)`, `streetView(idOrX, z?, along?)`,
`marketView('street'|'interior'|'crowd'|'roof'|'bibi')`, `holoView('street'|'aerial'|'cine')`, `megaView('approach'|'skyline'|'street'|'lanes'|'crown')`, `dtlaView('street'|'walkway'|'roof'|'lanes'|'plaza')`, `civicView('approach'|'steps'|'hall'|'lobby'|'plaza')`, `broadwayView('street'|'bridge'|'bradbury'|'spinner'|'atrium')`, `interiorView('court'|'stair'|'door'|'service')`, `kView('street'|'market'|'lobby'|'corridor'|'apartment'|'roof'|'aerial')`, `lakewoodView('street'|'courtyard'|'market'|'laundry'|'traffic'|'k-edge'|'river'|'aerial'|'shop'|'hub')`, `wallaceView('approach'|'plaza'|'face'|'satellite'|'factories'|'convoy'|'oldpyramids'|'atrium')`, `coastView('crest'|'terraces'|'apron'|'spray'|'piers'|'blocks'|'aerial')`, `trafficView('intersection'|'freeway'|'canyon'|'aerial-night'|'rain')`, `holoSpec(id)`, `setTime(h)`, `setWeather(id)`, `cut()`, `holdShot(on)`, `stats()`,
`geoToLocal(lat,lon)`, `app`. `stats()` includes draw calls, triangles, crowd count, hologram panel count, query-worker counters, lane cars and lanes, ground cars, freeway cars, streak count, the nearest signal (`viewSignal`), queued cars, the traffic bed, landmark LOD levels, the beacon count, and the interior fields (`interior`, `interiorOccluded`, `interiorMuffle`, `interiorTris`, `interiorMeshes`, `interiorMounted`).

Keys: `1/2/3` fly/walk/cinematic, `F` toggle fly↔walk, `V` cockpit, `E` sit / stand at a market stool (walk mode; in fly mode `E` is still up),
`N` next shot, `H` HUD, `M` mute, `[ ]` time −/+ 1 h, `B` next weather. The iPhone joystick has no sit button.

## Testing

* `npm run typecheck`, `npm run build`.
* `npm run dev`, then `npm run screenshots` (Playwright; env `CHROME=/path/to/chrome`, `OUT=dir`, `GPU=1` for a real GPU, `ONLY=<name>`).
  Without a GPU the script uses SwiftShader WebGL2, which is slow (minutes per shot) but deterministic enough for visual checks.
* `npm run map` regenerates `docs/map.svg` and `docs/map-downtown.svg` from the JSON.

## Known technical debts

* Frame-loop collision reads worker cells. A miss that frame does not collide (the cell is queued). `fabricAt`, `findStreetSpot` and cinematic
  solid-checks still call `generateFabric` on the main thread, and a dressed Little Tokyo cell is about 30 ms. Do not call `fabricAt` from the frame loop.
* The crowd walk is a foot slide, not a skeleton. Umbrellas are on or off per person, not a hand-held prop with a grip.
* Fabric windows are procedural. Parallax interior mapping for ordinary windows is not implemented. Enterable rooms use door volumes (`src/world/interiors/`), not a window shader. The doorway card is procedural, not a live view of the street, and an open court shows the sky rather than the skyline.
* No shadows (night-first look). Daytime sun shadows would need cascaded shadow maps on high/ultra.
* The WebGL2 fallback has no reversed-Z (it breaks the MSAA depth blit), so the near plane adapts to altitude instead.
