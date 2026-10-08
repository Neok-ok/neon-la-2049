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
    landmarks/             hand-built landmark generators + sea walls + beacons + flares
    CityQuery.ts           collision / ground / "where am I" queries (regenerates fabric on demand, LRU cached)
  districts/
    fabric-index.ts        worker-side registry entry: imports every archetype module
    detail-index.ts        main-thread registry entry: imports every detail module
    _shared/               Stage-1 blockout archetypes + shared street lamps
  atmosphere/              uniforms, sky + height fog, day/night, weather state machine, rain/snow
  vehicles/                spinner model + AI spinner traffic
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
  animated billboards, flicker).

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

Each landmark `type` in the JSON maps to a builder registered with `registerLandmarkType(type, builder)`. A builder returns
`{ object, colliders }` and may add beacons (instanced, blinking, fog-piercing) or flares. Geometry goes through `GeoWriter` and uses
the **same vertex layout and material as the fabric**, so a landmark gets windows, wetness and snow for free.
Sea walls are extruded along their polylines with a terraced profile, and the ocean is a single shape at `SEA_LEVEL_2049 = 6 m`.

## Atmosphere (`atmosphere/`)

* `uniforms.ts`: one shared set of TSL uniforms (time, day/night, wetness, snow, fog, sky colours, sun, window-lit fraction, sign power, lightning) read by every material.
* `SkyFog.ts`: background node (gradient, drifting cloud noise, sun glow, horizon blend) plus **analytic exponential height fog**.
  The fog integral along the view ray lets tall landmarks rise above the smog.
* `Atmosphere.ts`: day/night (30 real minutes per day by default), palette blending (night / dusk / day, smog and snow tints),
  hemisphere + sun lights, exposure, a procedural environment map, lightning.
* `Weather.ts`: a Markov state machine (dry haze, overcast, drizzle, rain, heavy rain, fog, smog, snow, sleet) with timed,
  45 s cross-faded transitions. Wetness and snow cover accumulate and dry with time.
* `Precipitation.ts`: rain streaks and snowflakes are GPU quads in a box that wraps around the camera. All motion happens in the vertex
  shader, wind drift is accumulated on the CPU, and the particle count is set per tier with `drawRange`.

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

| Tier | Pixel ratio cap | LOD0 / near / far radius | Rain | Bloom | AI spinners | Workers |
|---|---|---|---|---|---|---|
| low | 1.0 | 320 / 900 / 4,500 m | 2.5 k | off | 24 | 2 |
| medium | 1.5 | 450 / 1,300 / 7,000 m | 6 k | off | 50 | 2 |
| high | 2.0 | 600 / 1,800 / 10,000 m | 14 k | on | 110 | 3 |
| ultra | 3.0 | 800 / 2,400 / 14,000 m | 24 k | on | 180 | 4 |

* **Auto-detect** picks the tier from the UA, the WebGL renderer string and WebGPU availability: software → low; iPhone with WebGPU → medium;
  other mobile → low (medium on 8-core, 8 GB devices); integrated GPU → medium; Apple silicon or discrete GPU → high.
* **Runtime safety net:** in Auto, more than 6 s below 24 fps drops one tier, with a toast.
* **Manual override** in the toolbar is saved in `localStorage['nla.quality']`. `?quality=` beats both.

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
or add their own LOD rules.

## URL parameters and debug API

`?mode=fly|walk|cine &at=<landmark|poi id> &x= &y= &z= &yaw=° &pitch=° &time=0–24 &weather=<id> &quality=low|medium|high|ultra
&webgl=1 &hud=1 &ui=0 &freeze=1 &touch=1`

`window.__nla` (console and automation): `isIdle()`, `setMode(m)`, `setPose(x,y,z,yaw°,pitch°)`, `streetView(idOrX, z?, along?)`,
`setTime(h)`, `setWeather(id)`, `cut()`, `holdShot(on)`, `stats()`, `geoToLocal(lat,lon)`, `app`.

Keys: `1/2/3` fly/walk/cinematic, `F` toggle fly↔walk, `V` cockpit, `N` next shot, `H` HUD, `M` mute, `[ ]` time −/+ 1 h, `B` next weather.

## Testing

* `npm run typecheck`, `npm run build`.
* `npm run dev`, then `npm run screenshots` (Playwright; env `CHROME=/path/to/chrome`, `OUT=dir`, `GPU=1` for a real GPU, `ONLY=<name>`).
  Without a GPU the script uses SwiftShader WebGL2, which is slow (minutes per shot) but deterministic enough for visual checks.
* `npm run map` regenerates `docs/map.svg` and `docs/map-downtown.svg` from the JSON.

## Known technical debts

* `CityQuery` regenerates fabric on the main thread (≈ 5–40 ms per 500 m cell, LRU 48 cells). Fast walking/flying into a new cell can hitch.
  A worker-side collision service is a candidate for the performance stage.
* Fabric windows are procedural. Interiors behind windows (parallax interior mapping) are not yet implemented.
* No shadows (night-first look). Daytime sun shadows would need cascaded shadow maps on high/ultra.
* The WebGL2 fallback has no reversed-Z (it breaks the MSAA depth blit), so the near plane adapts to altitude instead.
