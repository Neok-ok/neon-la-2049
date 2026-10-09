# Financial District megatowers

Stage 3. Read [docs/BIBLE.md](../../../docs/BIBLE.md) §5.3 and §7.3 before changing heights or silhouettes. The kit itself is in
[`../_shared/megatower/`](../_shared/megatower/README.md).

## What is in here

| File | Runs where | Job |
|---|---|---|
| `specs.ts` | anywhere (pure) | One `HeroSpec` per hero id: form, crown, podium, mast, fins, buttresses, pads, lit fraction, hologram designs and colours. `heroPlan(id, height, w, d)` turns a spec plus the JSON footprint into a `TowerPlan`. Unknown ids get a seeded generic plan, so a new `megatower-8` in the JSON builds without code. |
| `landmarks.ts` | main thread | Registers `megatower`, `legacy-tower` and `skybridge`. Three LODs per structure through `env.lods`, colliders, beacons, holograms, signs. |
| `archetype.ts` | worker + `CityQuery` | Registers `financial-megatowers`: megablocks on every lot, a compact kit tower on about half of them. |
| `view.ts` | debug / screenshots | `megaCamera()` → `__nla.megaView('approach' \| 'skyline' \| 'street' \| 'lanes' \| 'crown')`. |

The Wallace and old pyramids use the same kit but live in `../wallace-vernon/pyramid.ts`, because that is their district.

## The heroes

| Id | Height | Shaft | Form / crown | Notes |
|---|---|---|---|---|
| `megatower-1` | 1,020 m | 150 × 96 m | slab / hammer | raking buttresses, landing pads, 85 m mast, 200 × 150 m podium. The tallest thing downtown. |
| `megatower-5` | 880 m | 170 × 80 m | twin / blade | two shafts with a gate lintel, figure in the gap |
| `megatower-2` | 760 m | 110 × 110 m | stack / flare | top-heavy: slit-window neck, flared upper third |
| `megatower-3` | 660 m | 130 × 130 m | stepped / stepped | terraces with pads |
| `megatower-4` | 600 m | 120 × 120 m | cross / lantern | warm glass lantern crown |
| `megatower-7` | 560 m | 120 × 70 m | slab / cage | open cage around a lit core, buttressed, above the I-110 trench |
| `megatower-6` | 520 m | 100 × 70 m | blade / stepped | narrow end to the street |
| `legacy-tower-1…3` | 420 / 360 / 310 m | 58–66 m | stepped / ziggurat | 1982-style, flame stacks, dimmer windows |

Skybridges: MT-1 ↔ legacy-1 at 342 m, MT-2 ↔ MT-4 at 436 m, MT-5 ↔ legacy-2 at 336 m, MT-1 ↔ MT-3 at 560 m. In the JSON, a
skybridge's `height` is the deck height, `baseWidth` the deck width and `baseDepth` the deck depth; `from`/`to` name the towers.
The span is trimmed to each shaft's face (`shaftReach`) so the end collars sit just inside the walls.

## LODs and budget

| Level | Switch (× tier `landmarkLod`) | Kit detail | Per tower |
|---|---|---|---|
| 0 | < 1.9 km (bridges 1.5 km) | 3 | 1 k – 8.5 k tris, plus signs |
| 1 | < 6.5 km (bridges 5 km) | 1 | 230 – 1.2 k tris |
| 2 | beyond | 0 | ~100 tris (the impostor-grade silhouette) |

Every level is one mesh in the shared city material, so the ten heroes plus four bridges cost 14 draws whatever their LOD,
plus one sign batch per LOD0 hero. Fabric chunks with kit towers stay at or under ~615 boxes (≤ 8 ms to generate).

## Fabric rules

* Lots 55–125 m. A kit tower only goes on a lot whose whole footprint is clear of reserves (the kit can't be clipped),
  and only if its short side is ≥ 22 m.
* Kit towers are 165–305 m including the mast (fabric ceiling 320 m), `compact: true`, one or two hologram panels that
  become kind-2 billboards.
* Megablocks are 90–155 m: a recessed base, a top-heavy upper mass in Ribbon or Megablock façade, a slit-window service core,
  rooftop plant and shop signs at street level.

## Invented

Everything here. The forms are original; the composition (slabs out of smog, red lights everywhere, holograms on the crowns,
1982-style ziggurats surviving below) is from the film's downtown aerials. The heights are argued in BIBLE §7.3 and rule 7.

## Left for later

* No street-level podium plazas yet (steps, canopies you can walk under, planters-turned-vents). Stage 4 shares the edges.
* Window bands are the city material's procedural grid. Real banding per spec (e.g. dark spandrels every 4 floors) would need a style per hero.
* Holograms sit on flat slots. Wrapped or corner-mounted panels need a new placement shape in the X4 API, not a second shader.
