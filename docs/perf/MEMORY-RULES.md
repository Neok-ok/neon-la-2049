# Memory rules

The graphics tier (low, medium, high, ultra) changes the picture: resolution, bloom, street props, weather density, landmark switch distances.

The memory budget is separate. It is how many bytes this tab is willing to keep. Ultra on a phone stays selectable. The street in front of the camera stays detailed. The horizon is what shrinks.

Readable copy: [MEMORY-RULES.html](MEMORY-RULES.html).

## What you call

```ts
import { resources } from '../core/memory';

const geo = resources.geometry(() => new BufferGeometry(), {
  label: 'balcony',
  owner: 'towers',
  evictable: true,
});

const pole = resources.sharedGeometry('lamp-pole', () => buildPole());
mesh.userData.sharedGeometry = true; // chunk unload must not dispose this

const tex = resources.texture(() => new CanvasTexture(canvas), {
  label: 'signs',
  owner: 'signs',
});
resources.markStreamed(tex);

const mat = resources.material('neon-sign', () => new MeshBasicNodeMaterial());
const rt = resources.target(() => new RenderTarget(w, h), { label: 'reflect', owner: 'water' });

resources.retain(geo);   // another holder
resources.release(geo);  // last holder calls dispose()
```

`retain` / `release` are the reference count. A shared geometry is never disposed by `release`. Chunk unload calls `release` and, if the resource was never tracked, `dispose`.

Anything built with `new BufferGeometry`, `new Texture` (and subclasses), `new RenderTarget`, or `new Material` is still adopted by the constructor hook in `src/core/memory/install.ts`, which `main.ts` imports first. `?memguard=1` throws instead of adopting. CI runs `npm run memory:check`, which executes the budget logic and fails if a memory-owned file constructs a GPU resource without going through `resources`.

New code uses the helpers. Do not wait for the hook.

## Budgets

`detectBudget` (`src/core/memory/budget.ts`) reads `navigator.deviceMemory`, a WebGL probe (`maxTextureSize`, samples), user-agent client hints, and a 1 MB startup allocation.

| Class | Tab total |
| --- | --- |
| Android ≤2 GB | 600 MB |
| Android ≤3 GB | 680 MB |
| Android ≤4 GB | 750 MB |
| Android ≤6 GB | 820 MB |
| Android larger | 900 MB |
| iOS, older | 640 MB |
| iOS, recent | 760–900 MB |
| Desktop &lt;8 GB | 2048 MB |
| Desktop ≥8 GB | 3072 MB |
| Desktop ≥16 GB | 4096 MB |

The total splits about 46% JS heap and 40% GPU. GPU splits about 62% geometry, 18% textures, 20% render targets. A `maxTextureSize` of 2048 or below caps textures at 32 MB. On a phone the JS cap is also limited by the heap limit.

Overrides: `?budget=android`, `?budget=ios`, `?budget=desktop`, or `?budget=720` (megabytes). `?mem=1` draws the debug overlay. It is not part of the picture.

## Streaming and LOD

`ChunkStreamer` keeps the tier radii when the estimated residency fits `budget.geometryBytes`. The estimate is a disc of LOD0 chunks at 1.6 MB, LOD1 at 0.9 MB, and far superchunks at 1.2 MB.

When it does not fit, radii shrink in this order: horizon, mid ring, then the street radius, which stops at 420 m (high/ultra), 280 m (medium), or 200 m (low). Screen-space error (`src/core/memory/sse.ts`) can refuse a finer LOD. The threshold is 14 / 8 / 5 / 3.5 pixels. A level that is already showing needs an 18% change, and only one step happens per update, so the skyline does not flicker.

Worker results wait in a queue of at most 16, and only the 12 nearest are kept. Finished chunks past the geometry cap are dropped, farthest first, and a horizon cap stops them coming straight back. After about 90 frames under 70% of the cap, the horizon grows back.

Missing 2 km cells, only while the budget is tight, draw up to 48 impostor blocks on the shared city material (`src/world/streaming/hlod.ts`). They leave as soon as the real mesh is resident. A desktop budget that already fits does not show them.

## Textures

Window rooms and the sign atlas are KTX2/Basis (`src/assets/*.ktx2`). On a phone with a compressed-texture format, `prepareAtlases` waits for KTX2 before the first material, and does not keep the uncompressed canvas as well. Software GPUs stay on the procedural atlas so a SwiftShader run is not punished by an RGBA transcode.

`resources.setMipBias` drops the top mip levels of textures passed to `markStreamed`. The governor does this under pressure. On a tight budget the camera does it too: above 280 m one mip, above 900 m two mips. Street level on a desktop keeps the full chain.

Repeated materials go through `resources.material(key, ...)`. One city material, one sign material. Repeated meshes share a geometry (`sharedGeometry`) and draw instanced. A clone that owns instance buffers must clear `userData.sharedGeometry`, or unload will skip it and leak the instance data.

## Pressure

`stepGovernor` watches the worse of JS-heap / JS budget and (GPU counter + render-target estimate) / GPU budget.

- Cross 82% for 1.5 s: step up one level.
- Stay under 62% for 3 s: step down one level.
- A spike shorter than that does nothing.

| Level | What gives |
| --- | --- |
| 1 | Horizon scale 0.72, coarser screen-space error |
| 2 | Mip bias 1, horizon 0.55, wet reflector off |
| 3 | Resolution scale 0.75, mip bias 2, horizon 0.42 |

## Interiors

An interior mesh is built when the camera comes within its stream radius and disposed when the camera leaves. While the player is occluded inside, the exterior listener tells the streamer to drop resident chunks. Leaving rebuilds the street. The exterior is hidden for the frame either way; the dispose is what returns the bytes.

Landmark LOD groups keep the showing level and one neighbour on the GPU. The other level's buffers are disposed and uploaded again on the way back (`LandmarkLods.ts`). The CPU arrays stay on the mesh so the upload does not rebuild the tower.

## Do not

- Size a city-wide buffer at the ultra count on every device when the buffer is large. A draw range does not free the allocation.
- Build a material or a geometry per window, balcony, person, or lamp. Share them.
- Upload a canvas atlas and a KTX2 atlas for the same surface.
- Raise `farRadius` on a phone to match desktop ultra. Fit the budget.
- Dispose a mesh marked `userData.sharedGeometry`.

## Check

```bash
npm run memory:check
```

The route profiler is `node tools/memory/profile.mjs` (`BASE_URL`, `OUT`, `TIERS`, `ROUTE_SEC`, `SAMPLE_SEC`). It emulates a Pixel-class phone, enables precise heap stats, and samples a scripted opening, walk, flight, interior, and photo-mode route.

`window.__nla.memory()`, `__nla.budget()`, and `__nla.pressure()` are the live reads.
