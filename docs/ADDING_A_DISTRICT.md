# Adding (or upgrading) a district

Every district is a plug-in. A district stage adds a folder under `src/districts/<district-id>/`, registers its code in two index
files, and points the district's JSON entry at it. The engine (streaming, LOD, collision, materials, cameras) never changes for a
district stage.

```
src/districts/
  fabric-index.ts          ← worker-side: import './<id>/archetype';
  detail-index.ts          ← main-thread: import './<id>/details';
  _shared/                 Stage-1 archetypes + shared helpers (street lamps)
  little-tokyo-market/     example layout for a full district
    archetype.ts           pure: buildings + signs for one block (runs in the chunk worker AND in CityQuery)
    details.ts             main-thread: LOD0 props (instanced meshes) for a 500 m chunk
    README.md              what is here, what was invented, what is left
```

## 1. Read first

* [BIBLE.md](BIBLE.md) §7, your district's row: palette, materials, signage density, typologies, heights, street widths, traffic.
* §10 *Rules for inventing unseen areas* and §11 *Asset & IP policy* (no logos, no copied assets).
* [ARCHITECTURE.md](ARCHITECTURE.md): procedural fabric, LOD rules and the iPhone budget.

## 2. The JSON entry

`src/data/city-layout.json` → `districts[]`:

```json
{
  "id": "little-tokyo-market",
  "name": "Little Tokyo Night Market",
  "loreSector": "Sector 5 - Little Tokyo Shopping District / Bar District",
  "archetype": "little-tokyo-market",
  "priority": 4,
  "grid": { "bearingDeg": 38, "block": [62, 44], "street": 7 },
  "stage": 2,
  "polygon": [[34.052, -118.244], [34.0515, -118.235], [34.046, -118.236], [34.0465, -118.244]]
}
```

* `polygon`: `[lat, lon]` pairs. Where polygons overlap, the higher `priority` wins. Adjust the polygon to real streets.
* `grid.bearingDeg`: compass bearing of the street grid's A axis (downtown 38°). `block` = `[A, B]` metres between street centre lines,
  `street` = street width. Copy real values from a map.
* `archetype`: the id your `registerArchetype()` call uses. Until your code lands, it can point to a Stage-1 archetype.
* After editing, run `npm run map` and check `docs/map.svg`.

## 3. The archetype (buildings and signs)

`archetype.ts` must be **pure**: no DOM, no `three` imports, no `Math.random()`. It runs in the chunk worker and again on the main
thread for collision, and both runs must produce identical results. Use `ctx.rng` for all randomness.

```ts
import { registerArchetype } from '../../world/fabric/registry';
import { Style, SignColor } from '../../world/fabric/types';

registerArchetype('little-tokyo-market', (ctx) => {
  const r = ctx.rng;                       // seeded per block: same block -> same buildings, always
  for (const lot of ctx.lots(7, 22, 0)) {  // split the block into lots 7–22 m wide, no gaps
    const h = r.skew(7, 38, 1.6);
    // box(s, t, sizeAlongB, sizeAlongA, height, opts): block-local metres, s along A, t along B
    ctx.box(lot.s, lot.t, lot.lb, lot.la, h, { style: Style.Market, lit: r.range(0.4, 0.8), tint: r.range(0.7, 1.2) });
    // detail 1 = LOD0–1 only, detail 2 = LOD0 only (small stuff!)
    ctx.box(lot.s, lot.t, 3, 3, 2.5, { style: Style.Industrial, detail: 2, base: h, lit: 0 });
    // sign(s, t, halfB, halfA, face, along, y, w, h, color, kind)  kind: 0 wall, 1 blade, 2 billboard
    ctx.sign(lot.s, lot.t, lot.lb / 2, lot.la / 2, 'a+', 0, 4, 1.2, 6, SignColor.Red, 1);
  }
});
```

Rules of thumb:

* **Boxes are the only fabric geometry.** Each emits 5 quads, so a LOD0 chunk should stay under ~6,000 boxes (~40 k triangles).
  Anything with more shape belongs in `details.ts` (instanced) or in a landmark builder.
* Mark small things `detail: 2` and medium things `detail: 1` so far LODs skip them.
* Choose `style` from `Style` (it selects the window grid and albedo table in `cityMaterial.ts`). If you need a new façade family,
  add a style id and extend the tables in `cityMaterial.ts`; keep the existing ids stable.
* `ctx.box` returns `null` inside reserved corridors (freeways, the river, landmark footprints, ocean), so you don't need to check them.
* Then add the import to `src/districts/fabric-index.ts`.

## 4. Details (LOD0 props)

`details.ts` runs on the main thread when a 500 m chunk reaches LOD0, and its output is disposed when the chunk leaves.

```ts
import { registerDetail } from '../../world/detail/registry';

registerDetail('little-tokyo-stalls', ['little-tokyo-market'], (ctx) => {
  // ctx.blocks: every block owned by this chunk (centre, axes, sizes, street width, district index, seed, ground)
  // return ONE Object3D in WORLD coordinates (usually 1–2 InstancedMesh), or null
});
```

* Use `InstancedMesh` and share geometry/materials across chunks. Set `userData.sharedGeometry = true` on meshes whose geometry is shared,
  so chunk disposal doesn't free it.
* Seed randomness from block seeds (`new Rng(block.seed)`) so props don't change when a chunk reloads.
* Budget: ≤ 2 draw calls and ≤ 20 k instances per chunk on medium. Check `ctx.quality.tier` to scale density.
* Use `_shared/streetLamps.ts` as the reference. If your district wants its own lamps, add the id to its `NO_LAMPS` set.
* Then add the import to `src/districts/detail-index.ts`.

### The street kit (copy this, do not fork it)

Stage 2 put the reusable pieces in `src/districts/_shared/kit/`:

| File | What it is |
|---|---|
| `templates.ts` | Unit meshes: `box`, `awning` (local +Z sticks out of the wall), `canopy`, `cyl` (Y-up), `quadY`, `quadZ`, `stool`. `getTemplate(id)`. |
| `batch.ts` | `KitInstance` + `buildKitMeshes()`. One mesh per pass (`opaque`, `fade`, `add`). Yaw maps local +Z onto the facade normal (`atan2(nx, nz)`). Pitch is applied in local X after yaw, so a cylinder with pitch `π/2` lies along local −Z. |
| `materials.ts` | Shared node materials. Do not clone them per chunk. `getSteamMaterial()` reads `iSteam.x` as a seed. `getPoolMaterial()` reads `iLight` as rgb + intensity and fades with `U.reflMix` when the planar mirror is on. |

A prop is a `KitInstance` plus a `rank`. Rank 0 always draws. Rank 1 needs `quality.detailScale ≥ 0.45` (medium and up). Rank 2 needs `≥ 0.75` (high/ultra). Rank 3 needs `≥ 0.95` (ultra). Give each chunk a hard cap and stride through the list so you do not delete only the last blocks.

Little Tokyo's pure dresser (`src/districts/little-tokyo-market/dress.ts`) is the pattern for "the collision boxes and the props are the same function": the archetype emits `dressBlock().boxes/signs`, and `details.ts` emits `dressBlock().props/steam/pools`. The module must stay free of `three` and DOM. `import type` from the kit is not enough if a value import sneaks in — keep the prop struct in the dresser file, as `MarketProp` does.

Sign copy lives in `src/world/materials/signPhrases.ts` (64 cells). `phraseSeed(i)` is the sign seed that samples cell `i`. Pass it as the optional last argument of `ctx.sign`. Tall signs (`h > w`) turn the cell so the line runs the long way.

Crowds, stools-you-can-sit-on, the market bed and the wet reflector are still app-level. The second dressed district should promote them to a registry instead of editing `App.ts` again.

## 5. Landmarks and POIs

Unique buildings belong in `landmarks[]` (with `reserveRadius` so the fabric leaves room) and get a builder registered with
`registerLandmarkType(type, builder)` from `src/world/landmarks/registry.ts`. Put the registration in your district folder and import
it from `src/districts/landmark-index.ts` (main thread only). A district registration overrides the Stage-1 blockout of the same type,
which `Landmarks.ts` registers with `registerLandmarkDefault`. Points of interest (future interiors, set pieces) go in `pois[]`.
`?at=<id>` jumps the camera to any landmark or POI.

A builder gets `(landmark, env)` and returns `{ object, colliders }`. `env` has the layout, the shared `beacons` and `flares` lists, and
`lods`, the landmark LOD manager. Hand it your levels with `env.lods.add(id, [lod0, lod1, lod2], [d01, d12], x, z, y0, y1, radius)`.
It switches on the distance to the structure's vertical axis minus `radius`, with 8% hysteresis. The tier's `landmarkLod` scales the
distances (0.6 low, 0.8 medium, 1.0 high, 1.35 ultra).

### The megatower kit (Stage 3; reuse it for anything tall)

`src/districts/_shared/megatower/` builds towers, pyramids and skybridges from one **plan** into a **sink**. The plan is plain data
and fully deterministic, so the same plan gives the same parts at every LOD and in every thread. The sink decides what the
pieces turn into:

| File | What it is |
|---|---|
| `sink.ts` | `MassSink`: receives boxes and frustums with a `FaceStyle` (style, lit, tint, seed) and a `KitDetail`. Detail 0 is the mass, 1 secondary, 2 tertiary, 3 hero clutter (rails, louvres, small fins). `CountingSink` counts triangles. |
| `tower.ts` | `buildTower(plan, sink)`. `TowerPlan`: `height`, shaft `w`×`d`, optional `podium`, `form` (`slab`, `stepped`, `cross`, `twin`, `stack`, `blade`), `crown` (`hammer`, `stepped`, `lantern`, `flare`, `blade`, `cage`, `ziggurat`), `mast`, `fins`, `buttress`, `pads`, `holo` (slots wanted), `flames`, `compact`. `buildSkybridge(plan, sink)` makes a deck between two shafts. |
| `pyramid.ts` | `buildPyramid(plan, sink)`: battered terraced tiers, cornice light strips, face slots, `look: 'wallace'` (glowing apex lantern, mast) or `'old'` (penthouse, flame stacks, spire), a monumental entrance on one face. |
| `geoSink.ts` | `GeoSink(maxDetail, frame)`: writes real geometry (one merged mesh in the shared city material) in a `KitFrame {x, z, y, yaw}`. Main thread. |
| `fabricSink.ts` | `FabricSink(ctx, s, t)`: turns kit pieces into `ctx.box` calls inside an archetype. Box-only, drops detail 3 and rotated pieces, approximates frustums. Pure, worker-safe. `signs(parts.signs)` and `holoPanels(parts, palette, seed)` emit the kit's sign and hologram slots as fabric signs. |
| `place.ts` | `buildLevels(name, frame, [3, 1, 0], sink => buildTower(plan, sink))` builds one mesh per LOD. `placeKit(parts, frame, env, {id, designs, colors, seed})` turns the parts into world colliders, beacons, flares, registered holograms and sign meshes. |

All builders return `TowerParts`: colliders, hologram slots (`crown`, `shaft`, `gap`, `podium`, `bridge`), lights
(`red`, `steady`, `strobe`, `pad`, `police`, `warm`), signs, flames, the roof and top heights and the footprint half-extents.

**Two ways to use it:**

* **Hand-placed heroes** (landmarks): write a spec per id (see `financial-megatowers/specs.ts`), then
  `buildLevels` → `placeKit` → `env.lods.add`, as `financial-megatowers/landmarks.ts` does. Signs go only into the LOD0 group.
  Budget: LOD0 ≤ ~10 k triangles per tower, LOD1 ≤ ~2.5 k, the proxy ≤ ~200. Run the plan through `CountingSink` to check.
* **Background towers** (fabric): in your archetype, `new FabricSink(ctx, lot.s, lot.t)` and `buildTower({...compact: true}, sink)`.
  `compact` halves the pier and fin counts. A compact tower is 75–170 boxes, so keep them to a share of the lots, and check
  `ctx.reserved` for the whole footprint before you build (the kit doesn't clip against corridors). Fabric tops out at the
  320 m ceiling; anything taller has to be a landmark.

Hologram slots from `placeKit` register as `${id}-holo-a` (first shaft slot), `-holo-b` (podium), `-holo-crown`, `-holo-gap` and
`-holo-i` for the rest. Crown slots use the `skyline` band, so they stay on out to about half the far radius.

### The megablock kit (Stage 4; reuse it for the residential cores)

`src/districts/_shared/megablock/` is the shorter cousin of the megatower kit. Same frame (kit +Z = block +A, kit +X = block −B), same `MassSink`, so `FabricSink` and the DTLA `MemorySink` both work. One `MegablockPlan` is deterministic.

| Field | Meaning |
|---|---|
| `form` | `cantilever` (small base, shifted upper mass), `slab-podium` (arcade and terrace), `bar`, `courtyard` (four wings, open court). |
| `family` | `ribbed`, `coffered`, `panelled`. These are styles 15–17 plus proud geometry. Do not add a façade shader. |
| `height` | Roof of the main mass. Keep fabric under 320 m. DTLA clamps plans to **90–250 m** so the blocks still read under the 0.5–1 km slabs. |
| `residential` | 0 = downtown plant (tanks, pad, mast). About 0.7–1 = laundry cages and balcony rows. Stages 11, 12 and 20 should pass that and a lower height, not fork the builder. |
| `compact` | `true` skips rails and thins ribs (fabric budgets). DTLA passes `false`. A heaviest mixed chunk in the sample was ~20 k triangles of fabric; a pure DTLA chunk ~10 k. |
| `walkAt` | Deck heights the mass actually covers. Downtown streets share heights from `lineWalkY(i, j, axis, high)` in `grid.ts` — pass the **grid line** index, not the block index. |
| `holo` | 0–2. Comes back as kind-2 signs. Keep them ≥ 16 × 10 m if the hologram field should promote them (140 m²). |

`buildMegablock` returns colliders, signs, the roof and the **base** half-extents. Put kiosks in the overhang (outside `baseHalf*`, inside the lot) so the street stays clear. Masses stay inside the footprint.

The downtown grid (bearing 38°, 205 × 125 m) is shared with the Financial District and Civic Center. `downtownGraph` in `src/vehicles/streetGraph.ts` is the lane graph for low spinners and ground cars. Do not build a second one for Civic Center; add edges by extending the district allow-list if a new grid matches.

A dressed district that wants pedestrians calls `registerCrowdSource(districtId, fn)` from `little-tokyo-market/crowd.ts`. The mesh and the shader stay there. Return loops of `[x, z]` points. Hide nothing at the origin: the field already parks vendor slots that have no cook.

## 6. Holograms

Giant figures and ad loops are not kind-2 signs. Register them with `registerHologram` from `src/world/holograms/api.ts` (see that folder's README). The call is main-thread only. `band: 'street'` culls with the LOD0 radius; `band: 'tower'` culls with the near radius; `band: 'skyline'` (crowns and anything read across the basin) culls at `max(1.35 × near, 0.55 × far)`. `rank: 0` is kept when the tier cap binds. Spill radius `0` skips the wash. Do not add a second hologram shader.

## 7. Verify

```bash
npm run typecheck && npm run build
npm run dev
# fly to it:   http://localhost:5173/?mode=fly&at=<poi-or-landmark>&hud=1
# walk it:     __nla.streetView('<poi-id>') in the console
npm run screenshots   # add your district's shots to scripts/screenshots.mjs first
```

Check on `medium` with the HUD (`H`): draw calls ≤ 250, triangles ≤ 1.5 M, no hitches when crossing chunk borders. Then update BIBLE §5/§7 with
anything you invented, write `src/districts/<id>/README.md`, and open the PR with screenshots.
