# B3 towers — film critique

12 October 2026. `main` at `1e1dee4`. The geometry is the B3 merge `8d7b7ef` (#66). The night those masses sit in is L1 (#49). Docs only. No game code, no film frames, no logos.

The B1 field critique is [towers-b1-2026-10-12.md](towers-b1-2026-10-12.md). The lantern and buttress critique is [towers-b2-2026-10-12.md](towers-b2-2026-10-12.md). This note does not re-score those families. LAPD, City Hall, and Wallace stay with G1.

**Overall: 4/10** for a read as Blade Runner 2049 mega-towers or a kite obelisk. The kite reserve is an empty group, which keeps a third needle out of the west cluster, and Screen Wall, Flue Bank, and Flare Bed stay in the kit. The mass in the city is Shelf Row: an East LA housing bar at the right height, with a human door, wearing downtown strip windows and a roof that comes apart on high. **Shelf Row as a low-district housing bar: 6/10.**

#66 scored Shelf Row 7/7 on film and 8/9 on scale, on harness stills, and recorded that a later panel scored that same street lower. Screen, flue, and flare stayed under 7 and left the field. The numbers below are a fresh read of the merged city. The stills are not in the repo.

## Scores

| Check | Score | Read |
| --- | ---: | --- |
| Mega-tower / kite-obelisk family | 4 | The west cluster is unchanged. The new silhouette is a 44–58 m bar, one or two galleries, and a penthouse about a quarter of the height. |
| Shelf Row, from the street | 6 | A 2.2 m opening, a 1.80 m person, two piers, and a 3.4 m flight on medium and up. The wall is a 7.7 m strip window. The upper gallery has no rail. |
| Shelf Row, from the fly | 6 | The bar, the cornice, and the roof room hold. The cage is four posts and one beam. High adds crates in the air beside that room. |
| Shelf Row, night rain | 5 | Gallery sticks and the door plate stay under the 32-nit bloom. They read as hard bars. The panel lottery is about one cell in ten, and each lit cell is a hotel slot. |
| Scale against a 1.80 m person | 7 | Opening 2.2 m, housing floor 3.4 m, 20 risers at 0.17 m, rail posts 1.05 m. Street 16 m, driving line ±5.1 m. Heights stay inside the 60 m East LA cap. |
| Top-down honesty | 2 | Silhouette IoU is the mesh against `envelope()` in the audit. The kite envelope calls `kiteProfile`, the same function as the unplaced recipe. No plan view sits beside a reference. |
| Hold, as a skyline decision | 8 | Empty kite, recipes kept, downtown seeds left alone. The right refusal of a 480 m needle and of three families that missed the street. |
| Hold stand-ins in the field | 4 | Hollywood becomes a sheer solid. Arts and the South Bay lose their stacks and gain a crate. The flare stacks and the foundry column stay. |

## How this was looked at

The pass note is [docs/buildings/b3-2026-10-12.html](../buildings/b3-2026-10-12.html). It has the family table, the IoU table, and the critic table. It has no image. The merge touches no png. `tools/building-harness/capture-night.mjs` writes to `/opt/cursor/artifacts/b1/night`, outside the repo and outside `tests/visual`. This environment has no `node_modules`, so nothing was re-rendered. The read is the merged source.

Code on this `main`: `shelfRow`, `screenWall`, `flueBank`, `flareBed`, and `heroObelisk` in `src/world/buildings/recipes.ts`; `fieldTower` in `place.ts`; the empty group in `landmark.ts`; East LA placement in `src/districts/_shared/sprawl/plan.ts`; the Hollywood solid in `src/districts/hollywood/plan.ts` (`emitField`); the Arts solid in `src/districts/arts-district/plan.ts` (`stackYard`); the South Bay solid in `src/districts/_shared/refinery/plan.ts` (`cracker`); the cell tables in `src/world/windows/facade.ts`; the kit glow path in `src/world/materials/cityMaterial.ts`; `buildingDetailCap` in `src/world/buildings/tiers.ts`; `keepBox` in `src/world/fabric/mesher.ts`. `envelope()` is in `tools/building-harness/audit.mjs`.

A worked footprint used below, so the metres can be checked: the placer's cap, 28 m along the street by 22 m deep, height 54.4 m (16 × 3.4), variant 0. East LA towers are 13–17 storeys, 44.2–57.8 m, footprint at most 28 × 22 (`planSprawl`). Shorter variant-0 bars have one gallery. This one has two.

## What the film is asking this batch to do

Published accounts, used as reference. No frames are in this commit. The longer citation is in the B1 critique.

- Dennis Gassner, one word from Denis Villeneuve: brutality. Scale is the power. Sunlight in the film belongs to Wallace. ([IndieWire, 23 Oct 2017](https://www.indiewire.com/awards/industry/blade-runner-2049-dystopia-production-design-denis-villeneuve-1201891427/); [Deadline, 15 Feb 2018](https://deadline.com/2018/02/blade-runner-2049-dennis-gassner-oscars-production-design-interview-1202280798/))
- John Nelson: one packed carpet, then a leap of scales. Brutalist masses, heavy tops, signs restrained. The LAPD approach miniature is about 216 m. ([vfxblog, 26 Oct 2017](https://vfxblog.com/2017/10/26/lets-move-to-la-in-2049/))
- Wētā Workshop: the buildings are lampshades. A few rooms stay lit. Parallax and greebles sit on the face a flyby can enter. ([Wētā Workshop](https://www.wetaworkshop.com/projects/bladerunner-2049))

The kite's job, if it had one, was a shouldered needle in the west financial cluster. MT-4 is already a 600 m cruciform. Caldera Step is already a 640 m taper on a 70 m base in that cluster. A 480 m kite on a 70 × 48 m base (`b1-obelisk` in `src/data/city-layout.json`) would have been a third needle. The reserve stays empty so the lanes still step over it. That is the film call.

Shelf Row's job is the low leap. `docs/BIBLE.md` §7.21 keeps East LA at 10.2–40.8 m for ordinary lots and 44.2–57.8 m for towers, streets 16 m, driving line ±5.1 m, and says nothing here is a megablock. The film's residential picture in this repo is K's slab, dark and punched, with a market at its feet. East LA is the shorter carpet under that. A gallery bar can be that carpet if the skin matches the sprawl lots around it.

Screen Wall, Flue Bank, and Flare Bed are scored here only as decisions and as the solids that replaced them. They are not placed landmarks.

## Shelf Row

`shelfRow` in `recipes.ts`, placed only from `planSprawl` when `params.towers.kind === 'shelf-row'`. East LA sets that kind. `fieldTower` is called from nowhere else. Financial, downtown, and Long Beach stay on `TOWER_KINDS`. Lantern and buttress are still the B2 bodies: the buttress core is still `lit: 0.86`, and the lantern parapet is still 1.35 m. Those four B2 passes stay where the B2 note left them.

### Silhouette and massing

On the worked footprint the bar is 70% of the height, 38.1 m, 27.4 m wide and 19.8 m deep, `Style.Panel`. Galleries step every 5 × 3.4 m (variant 1 uses 4). This bar carries plates at 17 m and 34 m. Each plate is 0.85 m thick and 2.4 m deep, `Style.Solid`, detail 0. A 13-storey variant-0 bar (44.2 m, bar 30.9 m) carries the 17 m plate only. The "row" is one line or two.

The cornice is a 3.2 m solid at the top of the bar, 0.55 m deep, detail 0. That is the lip a fly can count.

The roof room is the rest of the height. Crown 16.3 m, tank 2.6 m, house 13.7 m, about a quarter of the whole building, `Style.Panel`, set in from the edge (`houseW` 9.0 m, `houseD` 9.2 m). On a 50 m bar that penthouse is the skyline. It earns its place. The cage on top of it does not: four 0.65 m posts, 2.4 m tall, and one beam 0.4 m deep along the width only. At the fly distance in `capture-night.mjs` (about 70 m, camera at 0.42 of the height, aim at 0.5) the posts are a nub. The house is the read.

Variant 2 adds a 1.6 m solid belt at 0.46 of the bar. One third of the bars grow a downtown stripe.

`dressRoof` returns immediately for `shelf-row`. The downtown crown is not stacked on the house. The roof problem is the sprawl clutter, below.

### Street approach

`PERSON_M` is 1.80. The opening is 2.2 m square, so the headroom is 0.40 m. `entryFlight` rises `d.storey`. For this kind that storey is `RES_STOREY`, 3.4 m. `planFlight(3.4)` is 20 risers at 0.17 m, tread 0.29 m, run 5.8 m, width 1.15 m. The landing meets the first floor. The B1 miss, a 3.6 m flight on a 3.4 m module, is closed for this family.

The flight is ornament 1. Medium and up build the steps and the glowing nosings. The 1.05 m "rail" is a post every fourth riser, ornament 2, with no cap between the posts. Low has the hole and no steps.

`sidewalkPiers` puts two solid jambs on the door wall, 1.4 × 1.2 m, 6.8 m tall (two housing floors), tint 1.05, detail 0. They sit at t = −4.3 m and t = +8.8 m. The flight occupies about t = 1.5 m to 7.3 m, so the second pier clears the run by about 0.8 m. The harness stands its figure 2.5 m to the side of the opening (`capture-night.mjs`), which is a lateral offset, and that slot stays empty. A sidewalk camera at 10.5 m can see both piers. They survive low.

`fieldTower` passes `phrases: []`. The door has no lease sign. East LA signs stay on the market front (`signOn`). That restraint matches the film notes. The lit plate in the opening is the same porch the downtown families use, detail 0, so every tier keeps it.

The street is 16 m. The driving line is ±5.1 m. A compact car in the bible is 5.06 × 1.78 × 1.47 m. The flight runs along the facade, 1.15 m deep, on the door side of the lot. Spinners over East LA park at 74 m and 112 m. The snapped roof stays at or under 57.8 m, and the posts top out about 0.2 m under that. There is no spinner apron on the bar, and the air lane clears the roof. Leave that.

### Night rain

The skin is `Style.Panel` (index 17) at `spec.lit * 0.55`. `fieldTower` hardcodes shelf `lit` at 0.38, so the wall is 0.209. Night `windowLit` is 1, and the shader keeps 0.45 of that, about 9% of the cells. A panel cell is 9.6 × 3.9 m. The pane is about 7.7 × 0.86 m (`WIN_W` 0.8, `WIN_H` 0.22). Housing floors are 3.4 m. The glass rhythm and the floor rhythm are different modules. The neighbors on the same block are `Style.Sprawl`: a 3.2 m cell and a pane about 1.4 m square, lit from the lot roll 0.24–0.50. The tower is an office chart stood in a punched carpet.

Three glow segments hang off each plate. On this footprint each is 4.2 × 1.15 m, `lit` 0.62, buried 0.63 m so the authored height is the lit height, and the box stays under one 4.5 m glow cell. Glow ignores the window lottery, so every segment is on. Two galleries mean six sticks, plus a house lip 1.25 m tall and about 7.7 m wide. That house lip is wider than one 6 m glow cell, so it splits into two bays.

`glowLevel` at full night is `lit × 1.45`. The shell is `NITS.window`, 18 nits at 2700 K. A shelf stick peaks around 19 nits. The door plate at `lit` 0.9 peaks around 28 nits. Bloom starts at 32 nits (`BLOOM_THRESHOLD_NITS`). The bars stay sharp in the rain. L1 already scored that limit: medium and low have no bloom chain, and ultra's bloom strength does not lift an 18-nit face into the air. Wet East LA (`neonWet` 0.4 below 40 m) has no lease color on this door to carry into the lane. The market signs do that job. Leave them there.

The lampshade read wants a few small rooms. The recipe has the sparse fraction and the wrong pane.

## Scale

| Measure | Metre | Read |
| --- | ---: | --- |
| Person | 1.80 | `PERSON_M` |
| Door | 2.2 × 2.2 | Headroom 0.40 m over that person |
| Housing floor | 3.4 | `RES_STOREY`. Office families stay on 3.6 |
| Flight | 20 × 0.17 m, run 5.8 m | Meets the first floor. Ornament 1 |
| Rail | 1.05 | Posts on the flight at ornament 2. One gallery rail at ornament 1 |
| Tower height | 44.2–57.8 | 13–17 storeys. Under the 60 m cap in §7.21 |
| Footprint | ≤ 28 × 22 | `tw` / `td` caps in `planSprawl` |
| Street / lane | 16 m / ±5.1 m | Cars stay cars |
| Gallery | 0.85 × 1.7–2.4 m | One or two on a real tower |
| Roof room | ~11–15 m | About a quarter of the height |

No toy door and no 180 m East LA slab. The mistake in the other direction is local: the gallery and the piers can leave the tower footprint. On the worked 22 m depth the plate outer face is at −12.3 m and the half-depth is 11 m, so the plate sticks out 1.3 m. On a 10 m depth the overflow is still about 0.7 m, into the 1.2 m lot gap. The 16 m street is outside the block. This is a lot-gap clash, a small one.

The far mesh (`lod` 2) drops any box whose top is under 22 m. The 17 m gallery, the piers, and the door plate go away. The 34 m gallery, the cornice, and the house stay. That distance read is a bar and a penthouse.

## Top-down honesty

The model is not shown against a film plan, and it is not shown against any other plan.

`audit.mjs` paints `envelope()` and scores intersection-over-union against the detail-0 boxes. For `shelf-row` the envelope is a rectangle out to 0.7 of the height and a narrower rectangle above it (`y < 0.7 ? x < 1.02 : x < 0.42`). The galleries, the piers, and the beam are outside that drawing. The published 0.957 is the bar-and-house agreeing with a bar-and-house.

For `hero-obelisk` the envelope calls `recipes.kiteProfile`, and `heroObelisk` builds from `kiteProfile`. The published 0.961 is the mesh against its own profile. The audit footprint for that row is 64 × 40 m at 480 m. The city builds neither the mesh nor that footprint. `landmark.ts` returns an empty group and no colliders when `l.id === 'b1-obelisk'`.

`tools/building-harness/refs/README.md` says the scored silhouettes are those diagrams. Local reference photos, if anyone drops them in `refs/`, are gitignored brutalist pictures. The folder is empty in git. `capture-night.mjs` has street, fly, and sky. The shelf sky pose is the fly again: distance `max(70, height × 1.05)`, camera at 0.42 of the height, aim at 0.5. There is no orthographic top.

A follow-up still wants a real top-down of one East LA roof, shot in the city, beside a plan photograph of a public brutalist roof (the harness already names Habitat 67 and Trellick). That photograph stays out of git. A film frame stays out of git. Another IoU against `envelope()` will not answer the question.

## Stray, protrusion, blind critic

Standing at the door, ultra, rain, asking what does not belong.

The opening, the two piers, and the flight belong. They are the scale. The first gallery, with its rail, can belong. The second gallery is the same plate with three light sticks and no rail, so the one rail looks like a leftover. The penthouse belongs. The beam does not: on the worked footprint it runs through the tank. The beam occupies about s = 1.12–1.52 m and y = 53.4–54.2 m. The tank occupies about s = −0.38–3.02 m and y = 51.8–54.4 m, and it overlaps the beam along the width. Both boxes are detail 0, so low shows the intersection too.

High and ultra add `clutter()` from `planSprawl`, called with `placed.draft.height`. `buildTower` sets that height to the snapped crown, which is the tank lid (54.4 m here), not the house roof (51.8 m) and not the bar roof (38.1 m). The clutter boxes are detail 2: a 3.2 × 2.4 × 2.6 crate, a smaller industrial box, a glow nub at crown + 1.05 m, sometimes another box, sometimes a 0.55 m mast. `clutter` caps the mast with `66 - h`, so it stays under the bible's 66 m. The picture is a crate and a lamp in the air beside the penthouse, 2.6 m above the house roof and about 16 m above the bar roof when the plan misses the house. They do not belong. `shelfRow` already places a tank, four posts, and an ornament-2 plant (1.6 × 1.3 × 1.2 m) on the house roof.

The 0.26 m glow sticks are attached to the plates. They are thin, and they are the practical, once the pane behind them is a room. The 1.3 m gallery overhang is a protrusion past the outline the audit scored. It is still attached.

`dressRoof` does not leak onto this family. The downtown detail-0 crowns added in the same commit sit on the B1 families and are outside this score.

## Lighting

Keep the registry. Shelf Row adds no punctual light. `LIGHT_ADAPTER` stays `'l1'`. Glow colour is the warm/cool mix in `cityMaterial.ts`, driven by tint. Shelf tint is 1.08 on the sticks, so the sticks stay on the amber side of that mix. Window emission stays 18 nits at 2700 K.

What the rain does not do: catch those sticks. A face under 32 nits does not bloom, and the wet-street card has no shelf sign to reflect. The door plate is the brightest authored face on the building, around 28 nits, still under the threshold. Brightening it would be the wrong next move. The B1 porch note still holds.

The house lip at ~7.7 m wide is the one glow box on this family that crosses a 6 m cell. It will show a joint. Shorten it under 6 m when the cage is retouched, or leave it and accept the joint. Do not grow it into a crown. A glow box taller than one 4.5 m cell becomes a window wall. Nothing on the placed shelf does that today. Keep it that way.

## Tier honesty

Metres do not change with the tier. `buildingDetailCap` is 0 on low, 1 on medium, 2 on high and ultra. `keepBox` drops `ornament` above that cap, and the far lod drops detail above 0 plus any box whose top is under 22 m.

| Piece | Low | Medium | High / ultra |
| --- | --- | --- | --- |
| Bar, galleries, cornice, house, posts, beam, tank, piers, door plate | On | On | On |
| Flight, nosings, door jambs, the one gallery rail | Off | On | On |
| Flight posts, roof plant, sprawl clutter and its glow nub | Off | Off | On |

Low keeps the mass, which is the right budget rule, and it keeps the part that misses the film. The panel strips and the six glow sticks are detail 0. Low is a finned strip-window box with a glowing hole and no stair. The 3.4 m proof is the flight, and low deletes it. Medium restores the flight and the single rail. High restores the floating crates.

There is no separate phone budget in this path. Ultra on a small screen is the same metres with the high ornament cap. Do not add a texture, and do not fork the recipe by device.

## What stayed held

These four are not scored as landmarks. The recipes remain callable. The city does not call them, except the kite path, which returns before `placeHero`.

### Kite Obelisk

`registerLandmarkType('b1-hero')` hits `l.id === 'b1-obelisk'` and returns a named empty group with an empty collider list. `dtla/crowd.ts` does not queue a door there. The JSON confidence line still describes a tapered shaft with an ad face. The mesh does not.

`heroObelisk` would have been 24 monolith slices, a 1.55 m glow lip on each, and a 2.4 m glow tip at `lit` 0.92. That tip is a hat. The B1 note already refused the framing: a close crop cut the tip off, a wide crop handed the frame to a neighbour, and a 2.4 m seam cannot carry a 480 m shaft. IoU 0.961 does not reopen it. Leave the reserve empty.

### Screen Wall

`screenWall` is two piers, a dark plate at 0.56 of the height, a gutter at most 7.2 m wide, and 4.6 m pier caps. #66's own table is blind 3/3, film 7/4, scale 4/8. The fly was the miss. Hollywood does not build it.

`emitField` consumes the kind, the variant, and the seed, then pushes one `Style.Solid` at `lit` 0.08, tint 0.72. Strip towers (`towerBehind`) are 40 × 28 m at 86.4–115.2 m (`legacyFloors` of 20–26 × 4.4 m, snapped to 3.6 m). Before the merge those lots were a neon podium 46 × 36 m, a `Style.Ribbon` shaft 22 × 18 m, a glow lip, and a glow mast. South filler lots on the screen hash are a solid from 79.2 m (`legacyFloors` of 18–22). Before the merge those lots were the short neon or panel block plus a ribbon cap. The street blades are still drawn in both paths. The ribbon and the glow hat are gone, which moves the strip toward a dark mass, and the replacement is a sheer crate with no setback. Holding the recipe is right. Restoring the ribbon is the wrong repair. A setback can wait until Shelf Row and the yard stacks are fixed.

The heritage fronts and the lobby mouth are untouched.

### Flue Bank

`flueBank` is three shafts of different heights, short 1.35 m courses, a capital, and a cowl, with no full-width tie. #66's table is blind 7/8, film 3/7, scale 5/9. The street was the miss: the plinth is `Style.Industrial`, which paints a window band across the only face a level camera sees.

Ordinary Arts yards no longer build that bank. `stackYard`, when `force` is false, pushes one `Style.Solid` 18 × 14 m at the old stack height, 74–136 m. The pre-merge yard was a 5.2 m industrial column with rings, a cap, a ladder, a red beacon, and steam. The ladder, the beacon, and the steam still attach to the new box. The additive white cards are off this path and stay on the foundry (`force`), which is a real gain: those cards read as white slabs. The loss is the column. An 18 × 14 crate is a different object from a flue. The foundry path still builds the 5.2 m column. The ordinary yard should too. Do not call `flueBank` until a street frame shows dark shafts rather than one window band.

### Flare Bed

`flareBed` is a plinth, two or three square drums, and a lip at most 1.8 m wide on the tallest, plus a 1.8 m solid head. #66's table is blind 4/8, film 2/3, scale 8/5. Square drums and a dark street. Held for cause.

South Bay `cracker`, when `yard === 'flare-bed'`, still draws three tints and then pushes one `Style.Solid` 36 × 24 m at the column height, 50, 55, or 60 m (module 5). The pre-merge yard was an 8.4 m skirt and three columns 7.2, 5.4, and 4.6 m wide, with bands and ladders. The flare stacks in `flareStack` are untouched: 4.6 m shafts, 100–140 m, flame included. The film-accuracy note already asked to leave the El Segundo field burning. This solid is the other object, the cracking yard, and it is the leak. A 36 m box is wider than the 24 m South Bay street. The columns were the yard. Put them back. Do not call `flareBed`.

Southeast refineries omit `yard`, so they keep the three plain columns. That split is already correct.

## Ranked fixes

A B3b can stop after the first six. All of them are boxes that already exist. No new texture, no punctual light, no edit to `cityMaterial.ts`, `facade.ts`, `tests/visual`, the lighting registry, or the G1 meshes.

1. **Give the bar the sprawl cell.** In `shelfRow`, the skin and the house use `Style.Panel`. Use `Style.Sprawl` so the tower shares the 3.2 m cell of the East LA lots around it (pane about 1.4 m). Keep `lit: spec.lit * 0.55` on the bar and `spec.lit * 0.45` on the house. The sparse fraction stays. `Style.Residential` is the other punched cell if a pass wants a 3.1 m storey; `Style.Sprawl` is the one the district already wears. Leave `facade.ts` and `cityMaterial.ts` alone.

2. **Stop the floating roof.** In `planSprawl`, skip `clutter()` when the shelf branch sets `built`. The tank, the posts, and the ornament-2 plant inside `shelfRow` are the roof. `clutter` anchors every box at `draft.height`, the tank lid, so the crates hang in the air.

3. **Pull the beam out of the tank.** In `shelfRow`, the ring is one box, `la: 0.4`, and on a 28 × 22 × 54.4 m variant-0 tower it occupies the same volume as the tank (s overlap about 1.12–1.52 m inside the tank's −0.38–3.02 m, y overlap 53.4–54.2 m inside 51.8–54.4 m). Delete that beam, or move the tank clear and close a real perimeter. If the posts stay, take them from 0.65 m toward 1.4 m so a 70 m fly can count them. Keep them detail 0, inside the 6 m `crownExtra`. No glow crown.

4. **Rail every gallery.** `rail()` runs only while `firstShelf` is true. Call it for each plate. Ornament stays 1, so low keeps the plates and medium shows a rail on every one. Leave the plate at 0.85 m. A 1.7 m downtown shelf would glue East LA back onto `resStack`.

5. **Keep the plate inside the footprint.** The street face is the −s side. On the worked tower the plate outer face is 1.3 m past `spec.d / 2`. Shift the bar toward +s, or shrink `bd`, until that outer face lands on `−spec.d / 2`. Do the same for the pier depth so the 1.2 m jambs stay inside the lot on a 10 m depth.

6. **Put the South Bay columns back.** In `cracker`, the `yard === 'flare-bed'` branch should build the skirt and the three columns that stood there before the hold (7.2, 5.4, 4.6 m on the 8.4 m plinth), and keep the three `r.range(0.48, 0.66)` draws so later yards keep their seeds. Delete the 36 × 24 solid. Do not call `flareBed`. Leave `flareStack` as it is.

7. **Put the Arts column back.** In `stackYard`, the `!force` branch should build the 5.2 m column, the rings, and the cap that stood there before the hold. Keep the additive `quadZ` cards on `force` only. Delete the 18 × 14 solid. Do not call `flueBank`.

8. **A detail-0 stringer beside the shelf door.** The flight is ornament 1, so low loses the 3.4 m proof. A single solid plate along the run, about 0.2 m thick, rising `RES_STOREY`, detail 0, lives in `shelfRow` and leaves `entryFlight` for the office families. Skip this if the diff is getting wide. Fixes 1–7 are the picture.

Leave `heroObelisk` unbuilt. Leave `emitField` as a solid until a screen wall can show sky between the pier heads and a gutter a fly can count. A Hollywood setback is optional and behind this list. The JSON confidence sentence on `b1-obelisk` still describes a shaft. Correcting it is a one-line data fix, separate from the mesh.

When the stills are reshot, add a plan camera over one East LA shelf. Put a public brutalist roof photograph beside it, outside git. The shelf sky pose in `capture-night.mjs` is a fly.

## Leave closed

- The kite group stays empty. Lanes keep stepping over the 96 m reserve. Wallace stays the tall mass. The opening ray stays empty.
- Fabric stays under the district caps. East LA towers stay at 44.2–57.8 m. A 180 m bar in that district is the wrong leap.
- `screenWall`, `flueBank`, and `flareBed` stay unplaced until a street frame and a fly frame both clear 7 against the film, the way Shelf Row was asked to. Envelope IoU does not count.
- Lantern and buttress stay the B2 bodies. The B2 passes (lot `lit` on the buttress core, buried sills on the cross, a taller parapet and cage, sidewalk piers) are still open in that note. They are not this list.
- The B1 families, their door plate, and the three material passes in the B1 critique stay as written there. Downtown `dressRoof` crowns are outside this score.
- No second exposure, no brighter night sky, no bloom on an 18-nit window, no punctual light per tower.
- No new atlas, no film still, no logo, no edit to `tests/visual`.
- LAPD, City Hall, Wallace, K's megablock, the human rigs, and the smoke field stay as they are.
