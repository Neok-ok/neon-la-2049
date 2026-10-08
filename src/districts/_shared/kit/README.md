# Street kit

Shared hard-surface pieces for dressed districts. Little Tokyo is the first caller. A later district should add instances of these templates before it adds new meshes.

## Templates (`templates.ts`)

Unit-ish, flat normals, local +Y up, local +Z "out from the wall".

| Id | Local bounds | Use |
|---|---|---|
| `box` | 1×1×1 centred | crates, AC units, curbs, vending bodies, rails |
| `awning` | x −0.5..0.5, z 0..1, drops toward +Z, short valance | shop awnings. Scale x = width, z = projection |
| `canopy` | hex pyramid, radius 0.5, peak up, origin at centre | stall canopies and (visually) umbrella tops when used as a prop |
| `cyl` | radius 0.5, height 1, centred on Y, 6 sides | posts, pots, pipes. Pitch `π/2` lays the long axis along local −Z |
| `quadY` | 1×1, facing +Y | grates |
| `quadZ` | 1×1, facing +Z | shutters, plastic sheets |
| `stool` | feet at y = 0, seat top ≈ 0.75 | noodle-bar stools. No collision; the walk capsule stops at the counter |

`getTemplate(id)` caches the arrays. Do not mutate them.

## Batching (`batch.ts`)

`buildKitMeshes(items, name)` returns one `Mesh` per pass that was used:

* `opaque` — lit standard surface
* `fade` — same, alpha from the vertex, depth-write off (plastic sheet)
* `add` — additive emissive card

Yaw is a Y rotation that maps local +Z to `(sin yaw, cos yaw)`. Pitch is a local-X rotation applied after that. Materials are the shared ones from `materials.ts`. Geometry is unique to the chunk; the streamer disposes it. Do not put `userData.sharedGeometry` on these meshes.

## Materials (`materials.ts`)

One material per pass for the whole city. They read vertex `color`, `emissive`, `metal`, `alpha`, plus the atmosphere uniforms (`U.wetness`, `U.signPower`, `U.night`).

`getSteamMaterial()` is for an `InstancedMesh` of cross cards. `iSteam.x` is the cycle seed. The card rises and fades. Do not share the geometry object across chunks once you have attached `iSteam` — clone the base geometry per chunk.

`getPoolMaterial()` is an additive ground streak. `iLight` is `(r, g, b, intensity)`. It dims when `U.reflMix` is 1 (the planar mirror is drawing) so the street is not lit twice.

## Ranks

Callers attach `rank`. The market uses:

* 0 — always (awnings, lanterns, stools, canopies, pots, ceiling strip)
* 1 — `detailScale ≥ 0.45` (AC, pipes, cables, lamps, crates, vending, curbs, most pools)
* 2 — `detailScale ≥ 0.75` (plastic, bins, bollards, catwalk rails)
* 3 — `detailScale ≥ 0.95` (reserved)

`detailScale` is 0.30 / 0.55 / 0.82 / 1 on low / medium / high / ultra. Cap the merged list and stride through it so a cap does not erase only the last blocks in the chunk.
