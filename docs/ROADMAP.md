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

## Stage 2 — Little Tokyo Night Market *(first full district; sets the bar)*
**District:** `little-tokyo-market` · **POIs:** `noodle-bar`, `bibis-bar`
* Replace the `street-market` archetype with `little-tokyo-market` (new folder): shophouse façades with real depth (recessed storefronts,
  balconies, AC units, pipes, cables), layered awnings and plastic sheeting, overhead cable nets and paper/LED lanterns.
* Detail modules: stalls with counters, stools, steaming pots (particle steam), crates, vending machines, puddles with neon reflections,
  hanging blade signs at real sizes, umbrellas.
* **First enterable interior:** the noodle-bar counter (the walk camera can step under the awning and sit; simple interior lighting).
* Street-level neon reflections on wet ground: screen-space reflections or a planar/probe approach within budget.
* Signage generator v2: invented brand names in multiple scripts (Latin / katakana-like / hangul-like glyph sets, all original), animated LED panels.
* Acceptance: a street-level walk from the LAPD steps into the market looks dense, wet and alive at 30+ fps on medium.

## Stage 3 — Financial District Megatowers
`financial-megatowers`: real tower silhouettes for the six landmark megatowers (setbacks, crowns, masts, fins), podium plazas, sky
bridges, giant holograms (original animated figures and ads), the high spinner traffic layer with lanes and holding patterns.

## Stage 4 — Downtown Megablocks
`dtla`: top-heavy brutalist megablocks with distinct façade families (ribbed, coffered, panelled), rooftop infrastructure (tanks,
antennae, pads), mid-level walkways, a street layer with cars, steam vents and kiosks.

## Stage 5 — Civic Center and LAPD Headquarters
`civic-center`: LAPD HQ in full detail (landing deck, lobby entrance, police spinner pads with traffic), City Hall restoration,
monumental plazas, the steps where K walks. Optional interior: LAPD lobby.

## Stage 6 — Broadway Neon Canyon
`historic-core` + POIs `bradbury`, `joi-bridge`: heritage façades under new cladding, stacked vertical blade signs, the hologram
footbridge (an original giant pink hologram dancer, not a copy), the Bradbury exterior.

## Stage 7 — Wallace Precinct
`wallace-vernon` + `wallace-pyramid` + satellites: pyramid surface detail (panel lines, lit slits, the sealed monumental entrance),
Wallace factories and tanks, the approach road, amber interior glow at the top. Optional interior: the water-lit atrium (scaled-down).

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
| **X1 Crowds** | instanced pedestrians with umbrellas, GPU-animated walk cycles, density from district data | after Stage 2, so the market can be populated |
| **X2 Ground traffic** | cars and trucks in streets and freeway trenches, traffic lights | |
| **X3 Interiors framework** | portal/door system, interior streaming, interior lighting, the walk camera entering buildings | built with Stage 2's noodle bar, generalised for K's apartment and LAPD |
| **X4 Holograms** | shared hologram system (giant animated figures, ad loops, scanline/flicker shader, light spill) | before Stages 3, 6 and 16 |
| **X5 Audio** | positional sources (market chatter, PA announcements in invented languages, spinner engines, sea-wall surf) mixed with ambience; still no music | |
| **X6 Performance** | worker-side collision service, GPU-driven culling, texture-free interior mapping, a shadow option on high/ultra, iPhone profiling pass | whenever HUD budgets are exceeded |
| **X7 Photo mode** | free camera, depth of field, film grain, screenshot export | |

## Suggested order

2 → X4 → 3 → 4 → 5 → 6 → X1 → 8 → 7 → 10 → X2 → 11 → 12 → 9 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21, with X3/X5/X6/X7 where they unblock the next district.
