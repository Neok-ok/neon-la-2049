# Critique: Story and world — 2026-10-10

Judge the city as a place people inhabit in 2049, not as a skyline. This pass does not change game code. A later agent should be able to take one of the four briefs at the end and stay inside the iPhone medium budget (250 draws, 1.5 M triangles, no new post).

## How it was judged

Read `docs/BIBLE.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, the district rows, and the sign, crowd, interior, and audio modules. Built the site (`npm run build`) and drove the preview with Playwright on SwiftShader WebGL2, across all 21 districts: street, and a roof or aerial where the view helper leaves the ground, night rain, plus dusk, smog, medium, ultra, and a 390×844 iPhone viewport. The registered interiors were opened through the existing `__nla` cameras, except K's lobby, the three lift cars, and the head house, which were read in `src/districts/k-megablock/rooms.ts` and not framed. The corridor and the apartment were framed. Deep links use `at=` plus `marketView`, `megaView`, `dtlaView`, `civicView`, `broadwayView`, `kView`, `lakewoodView`, `southLaView`, `westsideView`, `basinView`, `eastLaView`, `hollywoodView`, `artsView`, `southeastView`, `southBayView`, `harborView`, `longBeachView`, `coastView`, `wallaceView`, `interiorView`.

Frames on this VM are 2–6 seconds, so the fps column is not a phone measurement. Draw calls and triangles are. Crowd counts below are the live medium-tier instance count at that camera, not the share written in the bible.

No film frames, logos, or audio were used. Invented names already in the repo (Kasai, Midori, Red Lantern, Veil House, Ash Line, Caldera Passage, Ninth Ring) are fair game. Wallace and Tyrell wordmarks are not.

## What already holds

Do not sand these down to fix the gaps below.

* **Little Tokyo** is a market. Night rain, umbrellas, a cook, a counter, and the words NOODLES and COUNTER are doing the job. Medium street: 176 draws, 693 k triangles, 160 people. The noodle recess is a soffit, not an interior, and it still reads.
* **K's megablock** is the one home. The market at the slab's feet has people and no cars (the polygon correctly has no street graph). The corridor is a cold hall of repeated doors. One door carries colored blocks that are not words. The apartment has a bench, empty shelves, and rain in the window. Medium market: 98 draws, 51 people.
* **Broadway and the Veil House bridge** are a canyon. Rain, blades, a pink figure, people. The figure is original. Keep it.
* **The financial skyline** is the 2049 aerial: slabs, red beacons, a skybridge, a smog sea. The failure is the word on the podium, not the massing.
* **South LA already looks at the pyramid.** From the Exposition side the stepped mass sits in the haze over the slabs. That relationship is the district. It only needs a mark.
* **The sea wall, the flare horizon, and the harbor crane** are real infrastructure. The coast crest is a parapet, a lamp, rain, and the city glow. The southeast yard is tanks and fire. The harbor shot is a hull under a crane. The forms are right. They are unstaffed, and some of them are mislabeled.
* **LAPD is a monument.** Stairs, a white SECTOR 5 over the door, a second SECTOR 5 inside, red and blue lamps. Sector 5 is the right name here.
* **Interiors that are not the desk template** should stay: Bradbury court, Wallace water room, K's rooms, the foundry pour, the South LA laundry, the Westside diner, the East LA counter.
* **District audio** already separates a market, a canyon, a refinery, and a harbor horn. This critique does not ask for new sound.

## Ranked findings

Impact times how cheap the fix is. S is a phrase list, a crowd share, or a handful of existing props. M is a district-sized dressing pass that stays on kits already in the repo. L is new collision or a new system, and is listed so it is not smuggled into an S pass.

### 1. The whole city speaks noodle-bar

**What's wrong.** One 8×8 atlas (`src/world/materials/signPhrases.ts`) is every written word. About fifty of the sixty-four cells are food. The few that are not — SECTOR 5, BLACK OIL, 2049, VENDING, OPEN LATE, NIGHT MARKET, RED LANTERN, KASAI, MIDORI — are then pasted onto districts that are not Sector 5 and are not markets. A financial podium, a theatre canyon, a spaceport, a sea-wall block, and a secondary downtown all order broth.

`phraseSeed` folds the index with `% 64` and stores `(n + 0.5) / 64` (`src/world/materials/signPhrases.ts`). The shader reads it back with `floor(seed * (64 − 0.001))` (`src/world/materials/signMaterial.ts`). An index past 63 never reaches the shader; it is already a food cell. The refinery list is `[67, 65, 80, 10]` (`src/districts/_shared/refinery/plan.ts`, and the same claim in `docs/BIBLE.md` §7.15, which says BLACK OIL, STEAM, 2049, STEAM). After the fold that is cells 3, 1, 16, 10: STEAM BAR, HOT BROTH, SOUP, STEAM. Harbor's list `[47, 49, 62]` is the one that actually says STEAM, BLACK OIL, 2049.

Financial street signs pass no seed (`src/districts/financial-megatowers/archetype.ts`). The generator fills that with `rng.next()` (`src/world/fabric/generator.ts`), so a megatower podium is a random food cell.

**Where.**

| Place | Deep link | Words on the wall |
|---|---|---|
| Financial podium | `?mode=walk&at=megatower-1` then `megaView('street')` | UDON, under a kilometre slab |
| Broadway | `?mode=walk&at=bradbury` | BLACK OIL, RICE BOWL, NIGHT MARKET, SECTOR 5, RED LANTERN |
| Hollywood boulevard | `?mode=walk&at=hollywood-lobby` | BLACK OIL, 2049, the same food blades. Sector 1 is labeled Sector 5 |
| Hillside wordmark | `veil-mark`, `src/districts/hollywood/sign.ts` | KASAI, MIDORI, OPEN LATE, NIGHT MARKET, 2049 |
| LAX terminal | `?mode=walk&at=lax-concourse` | SECTOR 5, and a noise glyph the bible calls Caldera Passage |
| Grey coast | `coastal-strip` phrase list | OPEN LATE, SECTOR 5, SALT BOWL, VENDING, 2049 |
| Long Beach | `?mode=walk&at=long-beach-concourse` | OPEN LATE, plus NIGHT MARKET and SECTOR 5 in the list |
| Basin strip | `?mode=walk&at=basin-strip` | COUNTER |
| Westside strip | `?mode=walk&at=westside-yard` | OPEN LATE |
| Arts District yards | `arts-district` phrase list | OPEN LATE, SECTOR 5, VENDING, next to STEAM and BLACK OIL |
| Southeast and South Bay yards | refinery `PHRASES` | STEAM BAR, HOT BROTH, SOUP, STEAM |

Lists, for the agent who edits them: Hollywood blades `[2, 4, 48, 51, 53, 58, 62, 39]`, Long Beach `[2, 4, 39, 49, 50, 58, 62]`, DTLA `[2, 4, 19, 25, 39, 49, 58, 62]`, heritage (Broadway) in `src/districts/_shared/heritage/build.ts`, sprawl `[2, 4, 7, 1, 56, 57, 60, 11]`, residential `[2, 56, 60, 37, 7, 4, 57]`, LAX `WAY = [39, 62, 2, 58]`, coast `[2, 39, 50, 58, 62]`.

**Evidence.** `financial-podium-says-udon.png`, `broadway-black-oil-and-rice-bowl.png`, `hollywood-strip-says-black-oil.png`, `lax-says-sector-5.png`, `long-beach-says-open-late.png`, `basin-says-counter.png`. Medium, night, rain.

**Fix.** Grow the atlas from 8×8 to 8×16 and raise `SIGN_ATLAS_ROWS` in the same change as `phraseSeed` and the shader multiply. Seeds are computed at runtime, so cells 0–63 stay put if those cells do not move and both sides use the new count. `phraseSeed` must stop folding 67, 65, and 80 back into the food band; those indices are rewritten below, not left to land on whatever cell 67 becomes. Add a second band and point each district at it. Do not spend Little Tokyo's food cells. Do not add WALLACE, TYRELL, or a real brand.

Suggested band, all invented: SECTOR 1, SECTOR 4, SECTOR 9, SECTOR 12, CURFEW, PAPER ONLY, GRID DOWN, BASELINE, CLOSED, RATION, PROTEIN, WATER, BERTH, DEPART, CALDERA, NINTH RING, SEA GATE, HAUL, WASH, COLD.

Then: financial signs get an explicit seed from the lease/off-world band; refinery indices become 49, 47, 62, 10 (the words the bible already claims); LAX `WAY` becomes SECTOR 12, DEPART, CALDERA, 2049; coast drops SECTOR 5 and SALT BOWL for SEA GATE and WATER; Hollywood drops BLACK OIL, NIGHT MARKET, VENDING, and SECTOR 5 and keeps KASAI, MIDORI, RED LANTERN, OPEN LATE, 2049; the hillside NIGHT MARKET panel becomes KASAI or MIDORI; Broadway keeps RED LANTERN and loses BLACK OIL; Long Beach loses SECTOR 5 and NIGHT MARKET.

**Size.** S.

**iPhone.** None. One canvas, the same sign batch, no new draw. Little Tokyo is already the heavy street (231 draws in the noodle recess, 824 k triangles). Do not add a mesh there to "explain" the signs.

### 2. The workplaces have no crew

**What's wrong.** The places that justify the map — off-world departure, the company that ended the famine, the wall, the port, the flares — are empty at eye height. Trucks are there. People are not. Medium, night rain:

| Camera | People | Cars | Draws | Triangles |
|---|---|---|---|---|
| LAX terminal (`laxView('terminal')`) | 0 | 6 | 69 | 194 k |
| Wallace plaza / approach / factories | 0 | 4 / 28 / 0 | 55 / 78 / 79 | 193 k / 200 k / 246 k |
| Coast blocks / crest / apron | 0 | 0 | 99 / 58 / 134 | 208 k / 200 k / 277 k |
| Harbor street / ship | 0 / 3 | 8 | 62 / 122 | 188 k / 210 k |
| South Bay street | 5 | 7 | 103 | 231 k |
| Southeast street | 6 | 7 | 91 | 327 k |
| Arts District street | 10 | 7 | 120 | 275 k |
| Basin strip | 11 | 4 | 83 | 387 k |
| East LA freeway deck | 0 | 30 | 112 | 442 k |

LAX is empty for a mechanical reason the bible already states (§7.17): the curb is about 180 m from the block centre, and the crowd radius is 64 m on medium and 88 m on ultra (`src/core/quality.ts`), so a loop on that grid never spawns. Wallace, the coast, and LAX are not in `registerCrowdSource` at all (`docs/ARCHITECTURE.md`). Ultra at the same terminal door is still 0 people (103 draws, 280 k triangles, 18 cars) while the market street at ultra is 680. Harbor's share is 0.02, which measured as three people at the hull and zero at the control door.

A working gate with nobody at it reads as a model, not a shift.

**Where.** `src/districts/lax-spaceport/` (no crowd module), `src/districts/harbor/crowd.ts`, coast and Wallace district folders, `src/districts/little-tokyo-market/crowd.ts` (the only mesh). Deep links: `at=lax-concourse`, `at=harbor-control`, `at=sea-wall-fight`, `at=wallace-plaza`, `at=southeast-pump`.

**Evidence.** `lax-says-sector-5.png` (terminal face, no one on the apron), `wallace-gate-empty.png` (plaza, 0 people), `coast-blocks-empty.png`, `coast-crest-empty.png`, `refinery-tanks-no-crew.png`, `harbor-hull-no-crew.png`.

**Fix.** Do not raise the counts in `src/core/quality.ts` (56 / 160 / 340 / 680). Share is a fraction of that pool and costs no draw.

* LAX: one sidewalk loop on the terminal door, inside 64 m, share about 0.10. Service vans stay.
* Wallace causeway: share 0.06, a shift on the paving that already exists. Not a market.
* Coast crest road: share 0.05. The patrol spinner stays the only vehicle.
* Harbor quay: share 0.08, loops that already exist beside the quay blocks.
* Leave the market at 1. Leave K at 0.32.

Optional, same pass: bias the existing coat table by district. Today `coatOf` is index-only (`crowd.ts`): about 4% pale, 3% pale plastic, the rest black, grey, olive, rust, in every sector. A dock crew and a Wallace gate crew should not wear the market's mix. No new mesh.

**Size.** S.

**iPhone.** None if the loops sit inside the medium radius (64 m) and the counts stay. A loop the radius cannot see is how LAX got to zero. Test the terminal door on a 390×844 medium viewport and confirm `stats().crowd` is above 0 without a draw-call change (the crowd is one mesh).

### 3. Seven holograms are doing the wrong jobs

**What's wrong.** The field has seven programs (`src/world/holograms/README.md`). Two of them are carrying every institution:

* LAPD's only shaft message, `lapd-shaft-notice`, is `glyph-loop` — scrolling noise — on the face over the steps. The door already says SECTOR 5. The hologram does not say police, curfew, or baseline.
* LAX `lax-glyph` is the same noise. The bible calls it the departure board for Caldera Passage. The blocks are not letters, so the name exists only in §7.17.
* South Bay `south-bay-hazard` is glyph noise and `south-bay-share` is `lease-loop`, a spinner-share ad, on a tank farm.
* Long Beach puts `lease-loop` on the secondary core. The street sign under it says OPEN LATE.

The programs that are in the right place should stay: Coil Vendor and the noodle lane, Veil Dancer on the Spring-side bridge and the Hollywood skyline, Ash Crane in the financial gap and on the harbor as a courier, Lantern at Bibi's and Red Lantern.

**Where.** `src/districts/civic-center/` (`lapd-shaft-notice`), `src/districts/lax-spaceport/holos.ts`, `src/districts/south-bay-refineries/holos.ts`, `src/districts/long-beach/holos.ts`.

**Evidence.** `lax-says-sector-5.png` (white noise column over a SECTOR 5 plate), `long-beach-says-open-late.png` (cyan barcode billboard over OPEN LATE), `broadway-veil-dancer.png` (the one figure that is doing its job).

**Fix.** Do not add an eighth shader. Remove the shaft hologram and let a kind-0 sign say BASELINE or CURFEW. Remove `south-bay-share`. Keep `lax-glyph` only if a kind-0 sign beside it says DEPART and CALDERA; the glyph can stay abstract. Long Beach's lease panel can stay only after the street words are no longer a night market (finding 6). Medium shows 18 panels. Dropping two mismatched ones gives the real figures room. It does not add a draw.

**Size.** S.

**iPhone.** None. The medium cap is 18 panels, 3 spill lights, 6 ground cards. This pass only deletes or retargets.

### 4. Food, power, water, and waste are not a system you can see

**What's wrong.** The timeline in `docs/BIBLE.md` §2 is the city's plot: an EMP in 2022, famine ended by synthetic farming, the Pacific behind a wall, waste toward the San Diego mesa. On the ground the industry you can see is the 1982 flare landscape. That landscape is worth keeping. It is power, and it should say so. It is not the thing that feeds anyone.

* **Food.** Markets sell noodles in Little Tokyo, at K's feet, in East LA, on the Westside, in Lakewood and South LA. Nothing connects them to a plant. Wallace's windowless halls (`wallace-vernon`, 18–42 m, tanks, conveyors) are the right buildings and carry no ration mark. The bible forbids a Wallace wordmark, which is correct. It does not forbid the word RATION.
* **Power.** Flares and cracking towers read from the yard (`southeastView('tanks')`). The stencil on that yard currently wraps to HOT BROTH (finding 1). There is no dead grid anywhere, so the blackout never happened.
* **Water.** The wall is the water story, and the crest is empty (finding 2). The blocks behind it are dark slabs with no cistern and, in the phrase list, a SALT BOWL. The LA River at `arts-river` did not read in the survey frame (the camera sat on a blank concrete face), so this critique does not claim the trickle is missing. It does claim a walker never sees where drinking water comes from.
* **Waste.** `trash-mesa-gate` is a pin at 33.74 N, 118.06 W, out of bounds, with no berm in front of it. The smog frame from that pin is a carpet of flat roofs fading out (71 draws, 264 k triangles, basin audio, 11 people somewhere in the 64 m radius and none of them a gate crew). Hills above 45 m are `hills-sparse`: a 5–11 m box on about a quarter of the lots, no roof tarp, no one there (`hollywoodView('hills')` measured crowd 0).

**Where.** `src/districts/wallace-vernon/`, `src/districts/_shared/refinery/`, `src/districts/coastal-strip/`, `src/districts/east-la/` (the 5/10 deck), `src/districts/_shared/archetypes.ts` (`hills-sparse`), POI `trash-mesa-gate`.

**Evidence.** `refinery-tanks-no-crew.png`, `coast-crest-empty.png`, `coast-blocks-empty.png`, `south-la-under-the-pyramid.png` (the pyramid is the food company's shadow, and the street under it has no ration line).

**Fix.** Use kits that already exist. No new shader, no new city-wide mesh, no recut of the river or either sea wall.

* One Wallace yard: the tanks it already builds, plus a RATION / PROTEIN stencil from the new band. No logo. The water room stays the only interior.
* East LA deck (30 cars, 0 people): one GRID DOWN plate on the wall the district already builds along the trench.
* One coast access tower: two tanks from the refinery kit, a SEA GATE sign, and the crest crew from finding 2. Stay inside the coast prop cap (36 / 80 / 140 / 200 by tier).
* South bound: a low row of the box prop already used as clutter, inside the playable edge, so a flight toward `trash-mesa-gate` sees a mesa starting rather than a fade. Not a new district.
* Hills: a tarp on some of the existing 5–11 m boxes near that south edge and under the veil-mark slope. Do not add buildings. Ground above 45 m stays `hills-sparse`.

**Size.** M.

**iPhone.** Low if the props join existing kit batches and stay inside the caps above. The crest is 58 draws and the blocks street is 99, about 200–208 k triangles, so two cisterns fit there. The apron is already 134 draws and 277 k; the cisterns have to join a batch that camera already pays for. Do not add a second flame mesh or a trash shader. The far berm should be ordinary boxes so LOD2 can drop it to a silhouette. The trash-mesa frame is 71 draws, which is the headroom for that berm.

### 5. Blackout 2022 left no paper

**What's wrong.** §2 says the EMP left a patched, analogue city. The only paper-like marks are the unlabeled glyphs in K's corridor. Everywhere else the newest technology is also the only technology: holograms work, signs work, nothing is dead, nothing is posted over. Civic Center is the place this should show, and the lobby is a single glowing SECTOR 5 with rain falling through it, because the lobby is still a soffit (`interior` stayed empty in `stats()`). That soffit is a known engine choice. The missing story is a notice a clerk would tape up when the screens died.

**Where.** `src/districts/civic-center/` (steps and lobby), K corridor `src/districts/k-megablock/rooms.ts`, one basin shutter, the East LA plate from finding 4.

**Evidence.** `lapd-only-says-sector-5.png` (door and lobby). K corridor is the counter-example and should be the model: repeated doors, a cold tube, marks that are not ads.

**Fix.** Three kind-0 signs from the new band: PAPER ONLY beside the LAPD directory, CURFEW on one Broadway shutter, GRID DOWN on the East LA wall. Do not convert the LAPD lobby into an `registerInterior` room in this pass. The roadmap left it a soffit on purpose, and a new interior path is not what the notice needs.

**Size.** S. It rides along with finding 1's atlas. Called out separately because a phrase list that only renames ads will miss it.

**iPhone.** None.

### 6. Long Beach is downtown, moved south, and Broadway is not a retirement row

**What's wrong.** Two districts are named for a life they do not show.

Long Beach is `residential: 0`, so the roof plant is downtown tanks and pads, not laundry (`docs/BIBLE.md` §7.20). The street says OPEN LATE. A cyan lease billboard hangs over the canyon. Harbor priority already wins the overlap, and the harbor has three people. The secondary core never becomes the place dockworkers sleep. Medium canyon: 92 draws, 290 k triangles, 26 people, 7 cars.

Broadway's table row says Sector 9 Retirement Row. The build is a heritage neon canyon, which is the right *look*, and the words are a market plus BLACK OIL. There is no closed house, no SECTOR 9, no sense that anyone was retired here. The Veil dancer is an ad, which is correct, and it is the only story on the street.

**Where.** `src/districts/long-beach/plan.ts` (`residential` 0, `PHRASES`), `src/districts/_shared/heritage/build.ts`, `?mode=walk&at=long-beach-concourse`, `?mode=walk&at=bradbury`, `?mode=walk&at=joi-bridge`.

**Evidence.** `long-beach-says-open-late.png`, `broadway-black-oil-and-rice-bowl.png`, `broadway-veil-dancer.png`.

**Fix.**

* Long Beach: pass `residential` high enough that the megablock kit emits the laundry cages and balcony rows Lakewood already uses. Point signs at WASH, BERTH, OPEN, 2049. Drop SECTOR 5, NIGHT MARKET, BLACK OIL, SALT BOWL. One BERTH plate on the face toward the harbor overlap.
* Broadway: one bay with the shutters already in the heritage kit, a CLOSED blade, and SECTOR 9. Leave the rest of the neon. Do not build a blade-runner office and do not put a department name on it.

**Size.** M for Long Beach (a kit flag plus the phrase list). S for the Broadway bay.

**iPhone.** Low. Long Beach measured 92 draws. Lakewood, which already runs that residential kit, measured 135 draws and 526 k triangles on a street. Stay under both caps. Do not add a hologram. Broadway is tighter (208 draws, 590 k). The closed bay must be a different phrase on geometry the block already emits, not a new prop batch.

### 7. The workplace rooms are one desk

**What's wrong.** These interiors are `buildCorridorRoom` plus a counter and a glow strip (`roomProps` in each file): LAX concourse, harbor control, southeast pump, South Bay control, Hollywood lobby, Long Beach concourse. Warmth changes (0.16 to 0.78). A box or two changes with it: LAX already has two low cubes, the pump house has a tall column, Hollywood has two posts. From the doorway they still read as one counter, one strip, and a ceiling tube. None of them show a word, because interior boxes do not sample the sign atlas. Measured medium, inside: 13–21 draws and about 34–37 k triangles. The city outside is hidden, so the room is the whole story, and the story is "desk."

The rooms that escape this are the ones to copy from, not to restyle: the foundry has a pour, South LA has washers, Westside is a diner, East LA has a counter and stools, K has a shower and a rain window, Bradbury has a stair, Wallace has water.

**Where.** `src/districts/lax-spaceport/interior.ts`, `harbor/interior.ts`, `southeast-industrial/interior.ts`, `south-bay-refineries/interior.ts`, `hollywood/interior.ts`, `long-beach/interior.ts`. Deep links: `at=lax-concourse`, `at=harbor-control`, `at=southeast-pump`, `at=south-bay-control`, `at=hollywood-lobby`, `at=long-beach-concourse`.

**Evidence.** The exterior shots are the indictment (the door is where the lie is). Inside, the draw count is the budget: there is room for a prop and no room for a second lighting model.

**Fix.** Do not give interiors their own atlas in this pass. Put the sentence on the door (finding 1): DEPART / CALDERA, BERTH, BLACK OIL, KASAI, WASH. Inside, edit the box the camera already sees, still detail-gated, still no scene light. At LAX, lengthen the two cubes into a waiting row along a side wall. At the pump houses, turn the tall column into a short stack so it reads as gauges rather than another counter. At the Hollywood lobby, turn the two posts into a ledge under the colored panel. Leave the counter. Leave the foundry, the laundry, the diner, the East LA counter, K, Bradbury, and the water room alone.

**Size.** S, once the atlas exists. M if someone rebuilds the rooms instead of editing `roomProps`.

**iPhone.** None. These rooms are under 25 draws. Adding a scene light or a second interior material would be the risk, and the interiors README already forbids the light.

### 8. The quiet districts are the same night, except where the pyramid shows

**What's wrong.** Westside, East LA, the basin, Lakewood, and South LA share a sprawl or residential helper and the same food list (finding 1). They are not the same place, and the camera can already tell two of them apart:

* East LA's market has umbrellas and a stall (`eastLaView('market')`, 29 people). That is a neighborhood. Keep it.
* South LA's street looks at the pyramid in the smog (`southLaView('wallace')`, 32 people, 108 draws). That is the inner ring. Keep the view.
* The basin strip is a dark slab and the word COUNTER (11 people, 4 cars). It is the default district, and it feels like leftover grid.
* Lakewood's street is a good megablock composition and an empty sidewalk in the frame (19 people, 0 standing, 3 cars).
* The Westside strip is people under umbrellas and OPEN LATE. Fine as a diner street. It should not also be a night market.

**Where.** `src/districts/_shared/sprawl/plan.ts` (`PHRASE`), `src/districts/_shared/residential/plan.ts` (`PHRASE`), `?mode=walk&at=basin-strip`, `?mode=walk&at=lakewood-market`, `?mode=walk&at=south-la-hub`, `?mode=walk&at=westside-yard`, `?mode=walk&at=east-la-market`.

**Evidence.** `basin-says-counter.png`, `south-la-under-the-pyramid.png`, `k-market-under-the-slab.png` (the residential model the others should not all copy).

**Fix.** Split the phrase lists (finding 1) so a side street in Lakewood says WASH or nothing, a South LA spine can say RATION, and the basin strip says OPEN or PAPER ONLY rather than COUNTER. Add one cold pylon in South LA aimed at the pyramid, with SECTOR 4, not a logo. Under the I-10 in the basin, a few of the tarps already used at K's market. Do not add towers to the basin. Do not retune far-LOD carpets. East LA does not need a rebuild.

**Size.** M for the tarps and the pylon, S for the lists.

**iPhone.** Low. Basin street was 83 draws and 387 k triangles. A tarp is an existing kit instance. South LA was 95 draws. One pylon is inside that.

### 9. Police and replicants are a single tower

**What's wrong.** LAPD Headquarters is the only police presence a walker meets. The steps were empty in frame; the 35 people are on the sidewalk, which is what the stage asked for, and it leaves the stair as a set. There is no second precinct, no baseline room, and no street plate that tells you the department walks anywhere else. The coast patrol is one spinner on the crest and it was not in the crest frame. Replicant life is the pyramid, two dormant old pyramids inside a live flare belt, and a retirement row that retired nothing (finding 6). K's apartment is a home, not an institution.

**Where.** `?mode=walk&at=lapd-steps`, `?mode=walk&at=lapd-lobby`, `old-pyramid-north` in the southeast belt, Broadway.

**Evidence.** `lapd-only-says-sector-5.png`.

**Fix.** Do not build a second headquarters. A kind-0 BASELINE line in the lobby (finding 5) and the CLOSED bay on Broadway (finding 6) are the whole pass. The old pyramids stay unnamed. If their ring still flares, leave the flames: they read as a 2019 relic inside a 2049 yard, which is the right tension once the yard stencil stops saying HOT BROTH. Do not add a Tyrell mark to make the relic clearer.

**Size.** S.

**iPhone.** None.

### 10. Downtown's upper city is a picture

**What's wrong.** DTLA at street level is inhabited: people, a truck, rain, a lantern figure (173 draws, 64 people, 46 cars). The roof camera at about 162 m still has those 64 people on the ground. The lit decks at 46 / 68 / 92 / 118 m have no stair. Walk mode only stands on one if something places the feet there. The layered city is the film's downtown, and a walker cannot live in it.

**Where.** `src/districts/dtla/`, `?mode=walk&at=dtla-canyon`, roadmap note in Stage 4.

**Evidence.** Street and roof cameras in the survey. This is real, and it is not one of the four passes. A stair is collision, a new walk surface, and a budget risk on a street that is already at 173–211 draws.

**Fix.** Leave it for a later collision pass. Do not "solve" it with a hologram of a stair.

**Size.** L.

**iPhone.** High if it adds geometry to every downtown street. Out of scope here.

### 11. K's corridor is the model, and it is one mark short

**What's wrong.** Almost nothing. The market, the lift, the cold hall, and the rain window are the best sequence in the city. The glyphs on the doors are not words, by design. A visitor cannot tell which door is lived in, and the apartment shelves do not hold a ration or a scrap of paper. That is a small miss on top of a district that works.

**Where.** `?mode=walk&at=k-apartment`, `kView('corridor')`, `kView('market')`. `src/districts/k-megablock/rooms.ts`.

**Evidence.** `k-market-under-the-slab.png`. Interior measured 17 draws and 35 k triangles.

**Fix.** One digit or WASH / RATION mark on the corridor door, in the same glyph-block language the room already uses, and one small box on the apartment shelf. No figure, no projector, no film prop.

**Size.** S.

**iPhone.** None.

## Per district

One concrete addition each. If a row says "keep," the pass should not restyle it.

| District | Why it exists | What a walker should gain |
|---|---|---|
| Little Tokyo | Sector 5's mouth. Food, steam, the crowd. | Keep the food cells. One CURFEW slip on a shutter the block already has. No new prop batch. |
| Financial megatowers | The lease and the courier. The slabs over the smog. | Stop the random food seed. One NINTH RING plate under the Ash Crane. UDON comes off the podium. |
| DTLA | The canyon people actually walk. | Keep the street. Phrase list loses NIGHT MARKET and BLACK OIL. No stairs in this round. |
| Civic Center | Sector 5's police and the old hall. | PAPER ONLY and BASELINE as kind-0 signs. The glyph hologram comes off the shaft. Lobby stays a soffit. |
| Broadway / historic core | A neon canyon, and the table's Retirement Row. | One CLOSED bay and SECTOR 9. BLACK OIL leaves. The dancer stays. |
| Wallace Vernon | The farm and the factory, windowless, no logo. | A RATION stencil on one existing yard. A thin crew on the causeway. The water room stays small. |
| K's megablock | A home, and the market that feeds that home. | A door mark and a shelf box. The market copy stays food. |
| Arts District | The works. Steel, a pour, the river. | Phrase list drops SECTOR 5, OPEN LATE, and VENDING. Keep STEAM and BLACK OIL. Crowd of about 10 is a night shift; leave it. |
| Grey coast | The wall holding the sea. | SEA GATE, WATER, two cisterns at one tower, a few people on the crest. SALT BOWL and SECTOR 5 go. |
| Lakewood | Housing in K's sector. | Side streets say WASH or stay quiet. The corner market may keep food. The shop interior stays. |
| South LA | The ring under the pyramid. | Keep the view. One SECTOR 4 pylon facing the haze. Spines may say RATION. Not SKEWERS. |
| Westside | The calmer diner street. | OPEN LATE may stay on the strip. NIGHT MARKET and HOT BROTH should not. |
| Basin | Everything that is not a sector. | The strip says PAPER ONLY or OPEN, not COUNTER. A few tarps under the 10. No towers. |
| Southeast belt | Power. The Hades horizon. | Fix the wrapped indices so the stencil is BLACK OIL and STEAM. The flames stay. |
| Hollywood | Sector 1. Houses, not a market. | Blades keep KASAI, MIDORI, RED LANTERN. Lose BLACK OIL, NIGHT MARKET, VENDING, SECTOR 5. The hillside NIGHT MARKET panel changes. |
| LAX | Sector 12. Off-world departure. | SECTOR 12, DEPART, CALDERA on the terminal. A door loop so the concourse has people. The gantries and the launch stay. |
| South Bay | The coastal flare field. | Same stencil fix as the belt. The lease hologram leaves the yard. |
| Harbor | The docks. Boxes in, a horn at night. | BERTH on the shed. Share 0.08 so the crane has a crew. Ash Crane stays. Do not name a carrier. |
| Long Beach | Where the dock crew sleeps. | Residential kit on. WASH and BERTH. OPEN LATE and the night-market list go. |
| East LA | An ordinary eastern neighborhood, plus the interchange. | Keep the hall and the umbrellas. One GRID DOWN plate at the 5/10. Do not retune the carpet. |
| Hills | What the basin gave up. | Tarps on some of the boxes that already spawn. No new lots. The veil-mark stays the only bright thing on that slope. |

## Bible addition

Paste this into `docs/BIBLE.md` as §14 when the street-language pass lands. Until then it lives here so the passes do not invent four different Sector 5s.

### 14. Street language and the four flows

`confidence: invented`, except the sector numbers already in §7.

The atlas has two bands. The first is the market (food, the house names Kasai, Midori, Red Lantern, the year 2049). The second is notices and work. A district uses the band that matches its row. A sign does not wander because a seed was left empty.

| Register | Who may use it | Cells |
|---|---|---|
| Market | Little Tokyo, K's market, East LA hall, Westside diner strip, corner markets | Food cells, RED LANTERN, OPEN LATE |
| Houses | Hollywood boulevard and the hillside wordmark | KASAI, MIDORI, RED LANTERN, 2049. Not SECTOR 5. Not BLACK OIL. |
| Lease | Financial district, and a single panel in DTLA | NINTH RING, DEPART, 2049 |
| Civic | Civic Center only | SECTOR 5, 2049, BASELINE, CURFEW, PAPER ONLY |
| Retirement | One Broadway bay | CLOSED, SECTOR 9. The rest of Broadway may stay market and houses. |
| Ration | Wallace yard, South LA spines | RATION, PROTEIN. No corporate wordmark. |
| Power | Both refinery belts, the Arts District yards | BLACK OIL, STEAM, COLD, 2049 |
| Port | Harbor sheds, Long Beach street faces toward the harbor | BERTH, HAUL, WASH |
| Water | The sea wall and its blocks | SEA GATE, WATER. Not SECTOR 5. |
| Paper | Civic, the basin, the East LA trench | PAPER ONLY, GRID DOWN, CURFEW |

Sector numbers are not decoration. Sector 1 is Hollywood. Sector 4 is the industrial south and the ring under the pyramid. Sector 5 is the civic and market core. Sector 9 is the old canyon. Sector 12 is the spaceport and the docks. A plate that says SECTOR 5 outside Sector 5 is a bug.

The four flows have to be visible somewhere, each in one place, not in every district:

1. **Food** moves from a Wallace yard (RATION) to the markets. The yard is not a logo.
2. **Power** is the flare belts. A dead patch (GRID DOWN) sits at the East LA interchange, which is the blackout scar.
3. **Water** is the sea wall. A cistern at one access tower is the drinking-water tell. The river is not recut.
4. **Waste** leaves south. The playable edge toward `trash-mesa-gate` shows a berm. The mesa itself stays out of bounds.

Blackout 2022 is paper posted on a working city, not a second lighting mode. Holograms may keep running beside a paper notice. They may not be the notice.

Crowds follow the work. A gate, a quay, a crest, and a terminal have a crew. The counts in the quality table do not grow; the share does. Coats may bias by district. They stay the same mesh.

When a later pass invents a name, it goes in this table and in the atlas in the same change. A name that exists only in a comment (Caldera, Ninth Ring) is not yet in the world.

## Proposed passes

Four jobs. Each one is a single agent. Each one stays on the medium iPhone budget. Do not start pass 2 until pass 1's atlas exists, or the new plates have nothing to say. Passes 3 and 4 can follow 1 in either order. None of them add a shader, a second crowd mesh, a music bed, a logo, a sea-wall recut, or a stair.

### Pass A — Street language

The city is literate in one dialect, and it is broth. Grow the sign atlas to 8×16 without moving the first 64 cells. Add the notice band in §14. Point every district phrase list at the register in that table. Fix refinery indices 67, 65, and 80 so they stop wrapping to STEAM BAR, HOT BROTH, and SOUP. Pass an explicit seed into financial signs so a podium cannot roll UDON. Replace LAX wayfinding (SECTOR 5, OPEN LATE, VENDING) with SECTOR 12, DEPART, CALDERA, 2049. Take SECTOR 5 and SALT BOWL off the coast. Take BLACK OIL, NIGHT MARKET, and SECTOR 5 off Hollywood, including the hillside NIGHT MARKET panel. Take the lease hologram off the South Bay yard and the glyph hologram off the LAPD shaft, and put BASELINE or CURFEW on a kind-0 sign instead. Do not add a hologram design. Do not add a draw. Little Tokyo's food list stays. Update §7 and add §14 in the same change, `confidence: invented`.

Check: `at=megatower-1` street, `at=bradbury`, `at=hollywood-lobby`, `at=lax-concourse`, `at=lapd-steps`, `at=basin-strip`, medium, night rain. The words in the table match the wall. Medium draws do not rise. A 390×844 medium frame of the LAX door and the Broadway canyon still sits under 250 draws and 1.5 M triangles.

### Pass B — Crews at the gates

LAX, Wallace, the coast, and the harbor are machines with no shift. Register a crowd source where there is none, and raise only the shares named here: LAX about 0.10 with the loop on the terminal door inside the 64 m medium radius; Wallace causeway 0.06; coast crest 0.05; harbor quay 0.08. Do not edit the counts in `quality.ts`. Do not add a second mesh, an umbrella variant, or a prop for people to queue at unless the stall already exists. A coat bias by district is allowed inside `coatOf`'s existing colors. Spinners, trucks, the foghorn, and the launch stay as they are.

Check: `stats().crowd` above 0 at `at=lax-concourse`, `at=wallace-plaza`, `at=sea-wall-fight` on the crest, and `at=harbor-control`, medium. Draw calls unchanged from the table in the appendix. The market is still the densest sidewalk.

### Pass C — The four flows

Make food, power, water, and waste visible once each, with kits already in the repo. A Wallace yard gets a RATION stencil and keeps its tanks. The East LA 5/10 wall gets GRID DOWN. One sea-wall access tower gets two cisterns and a SEA GATE sign, inside the coast prop cap. The south playable edge toward `trash-mesa-gate` gets a low berm of existing boxes, not a district. Some `hills-sparse` boxes near that edge get a tarp. PAPER ONLY goes on one civic pylon and one basin shutter. Do not recut the river, either sea wall, or a freeway. Do not add a flame mesh, a trash shader, or a far-LOD carpet change. Do not put a Wallace wordmark on the stone.

Check: from `southLaView('wallace')` the pyramid is still the skyline and a pylon or a yard mark is the only new accent. From `coastView('crest')` a cistern reads without a new draw batch. From a fly toward `trash-mesa-gate` the berm is a silhouette, not a landfill simulation. Crest stays near 58 draws and the blocks street near 99. The apron is already 134 draws, so the two cisterns must not open a batch that pushes any coast camera toward 200. East LA deck stays under 150.

### Pass D — A reason for the districts that don't have one

Long Beach turns the residential kit on (laundry, balconies) and its signs become WASH and BERTH, not OPEN LATE and SECTOR 5. One Broadway bay shutters and says CLOSED and SECTOR 9; the dancer and the rest of the neon stay. South LA keeps the pyramid view and gains one SECTOR 4 pylon facing it. The six desk interiors each change the one box the doorway already sees (a waiting row at LAX, a gauge stack in the pump houses, a ledge in the Hollywood lobby) and do not gain a light or an atlas of their own; the door sign from pass A is the sentence. K's corridor gets one readable door mark and the apartment shelf gets one box. No DTLA stairs. No second police tower. No rename of the old pyramids.

Check: `at=long-beach-concourse` reads as housing beside the port, under 150 draws. `at=bradbury` still reads as a canyon, with one dark bay. `at=lax-concourse` inside is still under 40 draws. `at=k-apartment` is still the same room.

## Appendix — medium survey

Preview build, SwiftShader, 1280×720, `quality=medium`, night rain unless the camera name says otherwise. Draws and triangles are `stats()` after the view settled. Crowd is the instance count, including anyone the interior has hidden. The iPhone rows are the same cameras at 390×844, device scale 1, `touch=1`.

Tight streets, where a new batch would hurt: Little Tokyo noodle recess 231 draws / 824 k, Broadway 208 / 590 k, DTLA roof 211 / 620 k, civic steps 188 / 666 k. Sign-only changes are safe there. New props are not.

Loose streets, where a kit prop fits: coast crest 58 / 200 k, harbor street 62 / 188 k, Hollywood street 66 / 213 k, LAX terminal 69 / 194 k, East LA street 77 / 288 k, basin strip 83 / 387 k, Long Beach canyon 92 / 290 k, South LA 95 / 305 k, K market 98 / 264 k. Coast apron, in downpour, was already 134 / 277 k with nobody on it. Wallace plaza 55 / 193 k, approach 78 / 200 k (28 cars, still 0 people), factories 79 / 246 k. The old pyramids, shot from the flare belt, were 54 / 294 k and crowd 0.

Every interior sat between 13 and 22 draws and about 34–40 k triangles. LAX concourse is 13 / 34 k. Bradbury service is the high end at 22 / 40 k. The workplace rooms and K's rooms share that budget. The difference is the props, not the cap.

Ultra, same night rain, 1280×720: market street 160 draws / 722 k / 680 people (medium on that street was 176 / 693 k / 160); southeast yard 210 / 333 k / 27 people (medium street 91 / 327 k / 6); LAX terminal 103 / 280 k / 0 people / 18 cars. The extra market crowd fits the one crowd mesh, and that street's draw count did not rise. The southeast yard at ultra is the tight sample, still under 250 draws, and it is the wrong place to add a batch. LAX stays empty when the cap is 680.

Dusk and smog that actually left the ground: Hollywood aerial at 18.4 in drizzle, camera y≈1006, 80 draws / 235 k, crowd 0 because that camera is outside the 64 m radius. South LA toward the pyramid at 18.2 in smog is `south-la-under-the-pyramid.png`. Wallace approach at 17.8 in drizzle is 78 draws and 0 people. The trash-mesa pin in smog, camera y≈261, is the roof carpet described in finding 4.

Two `setPose` shots aimed at y=420 over downtown stayed at y=2. Walk mode kept the feet on the street, so those frames are a DTLA block, not an aerial. The dusk one says NIGHT MARKET (179 draws, 419 k, 64 people), which is finding 1 again. The roofs that did leave the ground are the view helpers: DTLA roof y≈162, the financial crown y≈961, basin and Long Beach and LAX aerials near y=1000, the coast aerial y≈260.

390×844, device scale 1, `touch=1`, medium, night rain. Draws fall versus 1280×720 because the narrower view culls, and the empty gates stay empty:

| Phone camera | People | Draws | Triangles |
|---|---|---|---|
| Market street | 160 | 136 | 571 k |
| Broadway | 115 | 141 | 454 k |
| Wallace plaza | 0 | 102 | 209 k |
| K market | 51 | 64 | 263 k |
| Coast blocks | 0 | 88 | 208 k |
| LAX terminal | 0 | 63 | 193 k |
| Basin strip | 11 | 66 | 285 k |

All seven sit under 250 draws and 1.5 M triangles. Broadway on the phone still says BLACK OIL, RICE BOWL, VENDING, NIGHT MARKET, SECTOR 5, and RED LANTERN, with the touch sticks up. If a later phone frame of LAX, the coast, or the Wallace plaza shows a crew, pass B worked. The desktop numbers above stay the ones to protect, because they are the tighter cull.

## What this critique did not do

It did not retune carpets, fog, audio, or the sea-wall profile. It did not ask for film likeness beyond the structure the bible already claims. It did not treat a SwiftShader fps number as a phone result. A visual and structural critic is a separate pass; the pink panel the noodle camera can clip, and the blank frame at `arts-river`, are camera and mesh notes, not story notes, except where a missing word or a missing person is the thing the frame cannot show.
