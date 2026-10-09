# Megatower kit

Pure, worker-safe builders for tall structures: towers, skybridges and terraced pyramids. Stage 3 uses it for the Financial District
heroes, the fabric kit towers, the Wallace pyramid and the old pyramids. Later stages should build anything taller than the 320 m fabric
ceiling with it. Usage and budgets are in [docs/ADDING_A_DISTRICT.md](../../../../docs/ADDING_A_DISTRICT.md) §5.

| File | Runs where | Job |
|---|---|---|
| `sink.ts` | anywhere | `MassSink` interface, `FaceStyle`, `KitDetail`, `kitBox`, `CountingSink` (triangle counts for budgets). |
| `tower.ts` | anywhere | `buildTower(plan, sink)`, `buildSkybridge(plan, sink)`, `faceNormal`. All the parts types. |
| `pyramid.ts` | anywhere | `buildPyramid(plan, sink)`: `look: 'wallace'` or `'old'`. |
| `geoSink.ts` | main thread | Real geometry through `GeoWriter` (shared city material) in a `KitFrame`. |
| `fabricSink.ts` | worker + `CityQuery` | Kit pieces as `ctx.box` / `ctx.sign` inside an archetype. Box-only. |
| `place.ts` | main thread | `buildLevels` (one mesh per LOD), `placeKit` (colliders, beacons, flares, holograms, signs), `levelGroup`. |

## Frame and faces

Tower frame: origin at the base centre on the ground, `+Y` up, local X = width `w`, local Z = depth `d`. Faces: 0 = `+Z` (front, the
entrance), 1 = `+X`, 2 = `−Z`, 3 = `−X`. A `KitFrame {x, z, y, yaw}` places it in the world with
`world = (x + lx·cos yaw + lz·sin yaw, z − lx·sin yaw + lz·cos yaw)`, the same convention as `GeoWriter` and the collider transform
in `CityQuery`. In a fabric block the kit's (lx, lz) map to (s + lz, t − lx).

## Detail levels

| Detail | What | Built at |
|---|---|---|
| 0 | the masses: podium, shaft segments, crown body (proxy LOD = one piece per tier) | every level |
| 1 | setbacks, mechanical floors, buttresses, crown structure, masts | landmark LOD0/LOD1, fabric LOD0–1 |
| 2 | fins, pilasters, glow strips, pads, slots | landmark LOD0, fabric LOD0 |
| 3 | hero clutter: rails, louvres, small fins, antennas | landmark LOD0 only |

Plans are deterministic (`seed` drives an `Rng`), so colliders, lights and hologram slots come from the LOD0 build and match every level.

## Measured cost (CountingSink)

| Structure | LOD0 | LOD1 | Proxy |
|---|---|---|---|
| Hero tower (MT-1…7, legacy) | 1 k – 8.5 k tris | 230 – 1.2 k | ~100 |
| Skybridge (150–330 m span) | 370 – 630 | 90 | 40 |
| Wallace pyramid | 6.8 k | 2.1 k | 150 |
| Old pyramid | 9.6 k | 2.1 k | 130 |
| Compact fabric tower | 76 – 168 boxes | | |

## Not yet

* No curved forms (the curves belong to Wallace; when Stage 7 wants them, add a lathe piece to the sink rather than faking with boxes).
* Fabric towers can't use rotated pieces or frustums (the sink approximates them with boxes).
* No interiors: lobbies are glow bands, not spaces.
