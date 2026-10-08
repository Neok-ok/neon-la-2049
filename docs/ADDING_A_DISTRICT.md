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

## 5. Landmarks and POIs

Unique buildings belong in `landmarks[]` (with `reserveRadius` so the fabric leaves room) and get a builder registered with
`registerLandmarkType(type, builder)` (see `src/world/landmarks/Landmarks.ts`). Points of interest (future interiors, set pieces) go in `pois[]`.
`?at=<id>` jumps the camera to any landmark or POI.

## 6. Verify

```bash
npm run typecheck && npm run build
npm run dev
# fly to it:   http://localhost:5173/?mode=fly&at=<poi-or-landmark>&hud=1
# walk it:     __nla.streetView('<poi-id>') in the console
npm run screenshots   # add your district's shots to scripts/screenshots.mjs first
```

Check on `medium` with the HUD (`H`): draw calls ≤ 250, triangles ≤ 1.5 M, no hitches when crossing chunk borders. Then update BIBLE §5/§7 with
anything you invented, write `src/districts/<id>/README.md`, and open the PR with screenshots.
