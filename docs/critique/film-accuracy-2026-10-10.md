# Film accuracy — 2026-10-10

Judged against *Blade Runner 2049*, with *Blade Runner* (1982) and the 2022 / 2036 / 2048 shorts where a landmark comes from them. No film clips, frames, audio, logos, or likenesses were used. The build was `npm run build` and `npm run preview` on this tree, driven headless in WebGL2 (`?webgl=1`) across all 21 districts, every registered interior, and the deep links in `src/data/city-layout.json`. Tiers were medium and ultra. Viewports were 1280×720 and a 390×844 phone. Night rain, clear day, dusk, smog, and snow were all set by the debug API.

This file is the only change. Game code is untouched.

Findings are ordered by how far the frame sits from the films, divided by the size of the fix. Impact 5 is a scene a viewer would name. Size is S / M / L for one agent. The iPhone column is the medium budget in `docs/ARCHITECTURE.md`: ≤250 draws, ≤1.5 M triangles, pixel-ratio cap 1.5, ≤6 k rain, no bloom, no shadows. SwiftShader frame times on this machine are not a phone measurement. Draw and triangle counts are.

## What already holds

Leave these alone. A later pass that "improves" them will move the city away from the films.

- The Wallace pyramid is a 3,500 m dark stepped mass, base 3,200 m, at 34.005 N, 118.200 W (`wallace-pyramid`). From the west at night it is the skyline. That silhouette is the right one.
- LAPD headquarters is 216 m with the inverted crown, on the real downtown site (`lapd-hq`). The roof pads are a landing deck. The phone approach camera sits on that deck.
- K's slab is 185 × 230 × 85 m at the Lakewood pin, floor 40 at 136 m, among other dark slabs. From the street and from the air the envelope reads as a residential megablock with a market at its feet.
- The Sepulveda crest is 90 m and the harbor crest is 75 m, with terraces. The height is the published number. The picture, not the height, is the problem (finding 9).
- Little Tokyo has rain, stalls, steam, umbrellas, and a crowd (medium street: 160 people, 18 hologram panels, 166 draws). Hollywood's canyon is the densest sign street in the city.
- El Segundo's flare field is a fair 1982 Hades homage. Do not put those stacks out.
- The harbor has containers, a crane, and a night foghorn. That is an invented port, and it is enough.
- Audio is procedural babble (four formant recipes, no words) plus district beds. That is the right legal shape. It will never sound like a multilingual PA. Do not add a score.
- No trademark wordmarks. Keep that rule. The atlas is thin (finding 6), and the fix is still invented copy.
- Every registered interior hides the city. K's apartment was 17 draws / 35 k triangles. The Wallace atrium was 14 draws / 34 k. That is the safe place to spend triangles.
- Unseen basin, westside, and east-LA fabric stays lower than downtown. That matches the films' aerials once the three exits in finding 4 exist.

## Findings

| # | What the frame gets wrong | Size | iPhone risk |
| --- | --- | --- | --- |
| 1 | Daytime LA is warm beige | S | none |
| 2 | K's apartment is a bright motel room | S | none (city hidden) |
| 3 | Wallace's water room is a teal closet | M | none if it stays one occluded mesh |
| 4 | Trash mesa, Las Vegas, and the protein farm are missing | M | low if they stay far landmarks |
| 5 | The giant companion figure is a glyph on a footbridge | M | low (one existing panel) |
| 6 | Signs are English food words and stroke marks | M | none (same atlas) |
| 7 | Wet streets are saturated color sheets | M | none (same uniform) |
| 8 | Satellites and a lit entrance break the single dark pyramid | M | none or cheaper |
| 9 | The sea wall vanishes in brown fog, and the apron has neon rings | M | none if no new meshes |
| 10 | The old pyramids are labeled dormant and drawn on fire | S | none (lights come off) |
| 11 | A hillside letter row sits on a neon-painted slope | S | none (a landmark comes off) |
| 12 | LAPD's street face is a lightbox; the high office is missing | M | low (one interior) |
| 13 | Canyon spinners fly above the signs, and every hull has a police bar | S | none if the car count stays put |
| 14 | The Bradbury court is a tan stair well | M | low (interior) |
| 15 | Snow is a particle swap on the same brown night | S | none |
| 16 | LAX is three masts, and the confidence line overclaims | S | none |

Later shop, laundry, pump, concourse, and lobby interiors are corridor boxes. The films never showed those rooms. Leave them.

### 1. Daytime Los Angeles is warm beige

**Impact 5 · size S.** The films' daytime city is cold grey-blue, even when the air is thick. Orange belongs to dusk, to the smog weather, and to Las Vegas.

`DAY` in `src/atmosphere/Atmosphere.ts` is already warm: zenith `(0.33, 0.35, 0.37)`, horizon `(0.58, 0.55, 0.49)`, fog `(0.50, 0.48, 0.43)`. `clear` in `src/atmosphere/Weather.ts` is labeled "Dry smog haze" and sets `smogTint` to `0.5`. `update()` lerps 60% of that tint toward `SMOG_TINT` `(0.85, 0.55, 0.3)`, so a clear day is about 30% orange-brown before overcast flattens the zenith into the horizon.

**Where.** Every outdoor daytime frame. Deep link: `megaView('skyline')` at time 14, weather `clear`. Camera `[-3810, 501, -2387]`, district `westside`.

**Evidence.** `daytime-skyline.png`. Medium clear day: 86 draws, 247 k triangles. The same camera at ultra (`ultra-day`) is the same beige, 117 draws. The 390×844 clear-day frame is the same beige, with the touch sticks over the basin. `day-smog-wallace` (time 15, weather `smog`) is a deeper orange, which is the right direction for the smog weather and the wrong starting point for `clear`.

**Fix.** Shift the three `DAY` colours toward steel blue and drop the red channel until a clear 14:00 skyline reads grey-blue. Cut `clear.smogTint` to a small fraction so dry haze is grey. Keep `DUSK` and the `smog` weather on the orange they already have. Keep the night horizon sodium.

**iPhone.** No new draw, no new pass. The night skyline at this camera is already 359 draws (finding 8's evidence). A palette change does not add to that.

### 2. K's apartment is a bright motel room

**Impact 5 · size S.** The film room is small, dark, and close to the next slab. Rain covers a large window. A ceiling emitter throws a column. There is an amber practical. The floor plan here is already small. The light and the window are the miss.

**Where.** District `k-megablock`. Deep link `at=k-apartment`, and `kView('apartment')`. Files: `src/districts/k-megablock/interior.ts`, `rooms.ts`. The README states the intent in one line: warm lamp, cool shell, rain on the window, no projector and no figure.

**Evidence.** `k-apartment-bright-room.png` (ultra, interior `k-apartment`, occluded, 29 draws, 35 k triangles, camera y ≈ 138). The shell is beige. A white ceiling tube is the key light even after `interior.ts` pulls that tube to intensity `0.65` and range `2.6`. The amber practical does not win the frame. Blinds cover a template window of about 1.15 × 0.7 m (`rooms.ts`, `winW` / `winH`). The rain hole is a separate `openSky` of 0.56 × 1.24 m in plan and 0.9 m tall (`hw` 0.28, `hd` 0.62, `y0` 1.05, `y1` 1.95). The baked city behind the blinds is the right trick, and it occupies a small rectangle. The 390×844 apartment frame is the same beige shell, 17 draws / 35 k triangles, with the sticks over the bench.

**Fix.** Darken the template shell. Take the ceiling tube near zero and let `apartmentLamp` carry the room. Enlarge the template window and the `openSky` hole together so rain and the baked neighbor fill one wall. Add one original ceiling disc that can throw a faint column. No figure, no likeness. Do not grow the floor plan. The volume is already a small room (`-2.05..2.0` by `-6.5..0.55`, height to 2.6 m).

**iPhone.** The city is hidden. Stay under 40 draws and 80 k triangles. Measured medium on the phone was 17 draws.

### 3. Wallace's water room is a teal closet

**Impact 5 · size M.** The film hall is a vast black volume, ankle-deep water that reads gold, and a single shaft of warm light. A person is small in it.

**Where.** District `wallace-vernon`. Deep link `at=wallace-atrium`. File `src/districts/wallace-vernon/interior.ts`, `buildAtrium()`.

**Evidence.** `wallace-atrium-teal-room.png`. Interior `wallace-atrium`, occluded, 14 draws, 34 k triangles, camera `[4031, 5, 3617]`. Two yellow tubes, a teal floor, and the far wall a few metres away. The volume is `placeVolume(frame, 0, -4.25, 3.6, 4.2, -0.25, 4.5)`: about 7.2 × 8.4 × 4.75 m. Water emissive `CAUSTIC` is `(0.28, 0.55, 0.46)`.

**Fix.** One larger unlit hall, still a single mesh. Ankle-deep water in warm gold. One overhead shaft. Drop the teal. Keep the sealed-door approach from the plaza. A baked shaft is enough. Do not portal the live city.

**iPhone.** Occluded interiors are the cheap place to spend triangles. Stay under 40 draws and 80 k triangles. The current room is 14 draws. A bigger box of the same material does not threaten the 250-draw street cap.

### 4. The trash mesa, Las Vegas, and the protein farm are missing

**Impact 5 · size M as vistas, L as districts.** Three exits from the film are places a player can look toward. The build has one pin and two empty headings.

**Where.**

- `trash-mesa-gate`, 33.7400 N, 118.0600 W, kind `edge`, stage 99. The pin is the right San Diego direction. Nothing is built there. The orphanage, a dark shed in the garbage, is absent with it.
- Las Vegas lies northeast of downtown (about 51° from the origin). There is no gate.
- Sapper's protein farm is a grey flat outside the city, with one dead tree. There is no farm.

**Evidence.** Fly, medium, night rain.

- Trash gate: district `basin-sprawl`, camera `[16943, 221, 34521]`, 64 draws. `trash-mesa-gate-empty.png` is low-rise sprawl to a beige horizon. No dunes, no shed.
- Northeast: camera `[11409, 521, -10814]`, still `basin-sprawl`. The same carpet. No orange dust, no ruined silhouette.
- North edge: camera `[-9804, 181, -11367]`, sprawl to a flat line, one spinner, no farmhouse, no tree.

**Fix.** Three vistas, not three districts. At the south pin: garbage dunes and one dark shed, outside the playable streets. Looking northeast from the hills: orange dust and a few ruined silhouettes, far enough that downtown lod0 never includes them. On a north edge: one grey farmhouse and one dead tree on flat ground. Landmark LODs and impostors only. The bible can keep them `confidence: invented` and out of bounds.

**iPhone.** The medium night skyline is already 359 draws at `[-3810, 501, -2387]`, over the 250 cap. These vistas have to sit outside that view and outside street lod0. A landmark with a cheap far mesh is safe. A new fabric district is not.

### 5. The giant companion figure is a glyph on a footbridge

**Impact 5 · size M.** The film figure is enormous, pink, broken by rain, with its feet in an intersection. People are small beside it.

**Where.** District `historic-core`. Deep link `at=joi-bridge`. Landmark `canyon-bridge`. Hologram `joi-bridge-dancer` in `src/districts/historic-core/bridge.ts`. Design `veil-dancer`.

**Evidence.** `joi-bridge-small-glyph.png`. Medium walk, 153 draws, 556 k triangles, crowd 115, hologram panels 18, camera `[-534, 2, 461]`. A white oval glyph sits high in a flat magenta slot, over a thin deck. The panel is 14 × 46 m (`DANCER_W`, `DANCER_H`). Its feet are on the deck at 11.2 m (`DECK`), one block east of Broadway. The confidence string already says the figure is an original Veil House dancer, which is the right legal choice. The scale and the site are the miss. Ultra is the same glyph with heavier rain (`ultra-bridge`, 265 draws, 48 hologram panels). On the 390×844 frame the vertical crop makes the glyph taller, and it is still a symbol above a bridge.

**Fix.** Move this one projector from the deck into a wider intersection. Scale it toward the canyon height so the feet read at street level. Keep it an original figure. Let the existing rain scanlines break it. Do not add a second design or a likeness.

**iPhone.** Medium allows 18 hologram panels. This is one panel that already exists. Moving it does not add a draw. Historic-core street was 153 draws on desktop medium, under the cap.

### 6. Signs are English food words and stroke marks

**Impact 4 · size M.** The films' streets mix Japanese, Korean, Chinese, Hindi, Russian, and some Spanish, plus giant product ads. The legal stand-in for a soft drink, an electronics maker, or a car marque is a generic wordmark. Food stalls are one layer of that, not the whole wall.

**Where.** `src/world/materials/signPhrases.ts` (8×8, 64 cells) and `signAtlas.ts`. Every district that uses the atlas, which is all of them. The Hollywood canyon (`hollywoodView('street')`) and Little Tokyo (`marketView('street')`) show it most clearly.

**Evidence.** `hollywood-wet-street.png`. Readable Latin is `BLACK OIL`, `2049`, `HOT`, `RICE`, and the same menu elsewhere: `COUNTER`, `UDON`, `SALT BOWL`, `NIGHT MARKET`, `KASAI`, `SECTOR 5`. `signAtlas.ts` draws Latin as real text and the other scripts as original stroke segments. On the street those strokes read as a repeated mark, a barcode, or one character stacked. `SignScript` is `latin | kana | hangul | hanzi | devanagari`. There is no Cyrillic and no Spanish. LAX's two off-world panels (`src/districts/lax-spaceport/holos.ts`, `lax-glyph` and `lax-lease`) are a glyph loop and a lease loop, with no colony line.

**Fix.** Keep the 8×8 atlas and the ban on real brands. Replace a slice of the 64 cells with stroke groups that read as several different kana, hangul, hanzi, and devanagari words, and add a Cyrillic stroke group. Add a few non-food lines in original wording: an off-world colony sentence, a drink script, a car-marque script. Do not copy the 1982 slogan. Latin stays real text. Swapping phrases is the small half. Redrawing the stroke sets so they stop reading as one character is the rest of the job.

**iPhone.** Same texture, same draws. Hollywood street was 45 draws. Little Tokyo street was 166.

### 7. Wet streets are saturated color sheets

**Impact 4 · size M.** Film rain sits on black asphalt. Neon shows up as streaks and pools. K's sector, in the bible's own row, is grey and sodium.

**Where.** `U.neonWet` in `src/app/App.ts`. Market below 140 m is `0.92`. Historic core below 120 m is `0.88`. K below 48 m is `0.5`. Hollywood is absent from that chain, so the slope uses the far-LOD pair: `hollywood/README.md` sets `hollywood-strip` street neon to `0.86`, and the hills-sparse slope under the sign inherits it.

**Evidence.** `hollywood-wet-street.png` is a magenta road under an otherwise strong canyon (45 draws, camera `[-10722, 7, -5273]`). `k-market` is a magenta sheet at the foot of a dark slab that is otherwise right (97 draws, camera `[10998, 2, 21483]`). `hw-hills` is a cyan / magenta blotch under the letter row (72 draws). The phone market frame is a pale grey-green floor with the same signs.

**Fix.** Lower those three weights until the asphalt stays black and the color stays in the streaks. A market near `0.45` and a historic core near `0.4` is the range to judge by eye on `marketView('street')` and `broadwayView('bridge')`. Point the Hollywood hillside carpet at the hills value, not the strip's `0.86`. K's street should go sodium and grey, which is what its bible row already asks for. Do not add a second wet pass.

**iPhone.** The uniform already exists. No extra draw. Watch the night skyline, which is over the draw cap for other reasons (finding 8). This change does not add one.

### 8. Satellites and a lit entrance break the single dark pyramid

**Impact 4 · size M.** The film horizon is one black pyramid with a warm apex. Towers around it stay clearly smaller. Bible rule 7 says the pyramid stays at least 3× the tallest tower. The same paragraph lists satellites at 1.1–1.4 km. 3,500 / 1,400 = 2.5. The picture follows the satellites, and it breaks the 3× sentence.

**Where.** `wallace-satellite-a/b/c` in `src/data/city-layout.json`: 1,400 m, 1,250 m, 1,100 m, placed so the downtown approach looks between them. Obstruction lights: `src/districts/_shared/megatower/pyramid.ts`, a light on every tier corner. The entrance uses `Style.Glow`.

**Evidence.** `wallace-approach-satellites.png` (`megaView('approach')`, night rain). Two spires flank the pyramid, a chase spinner sits in the middle, and white dots trace every terrace. `fin-skyline` at `[-3810, 501, -2387]` is the same mass as a dotted tree: 359 draws, 978 k triangles, over the 250-draw cap. Ultra at that camera is 499 draws and 1.12 M triangles. The street approach (`wallaceView('approach')`, camera `[4031, 8, 2937]`, and the phone plaza frame) is a bright window grid set in the dark face. The monolith only reads from the air, and even then the dots and the flanking towers compete with it.

**Fix.** Shorten the three satellites to ≤1,000 m, or slide them off the downtown approach azimuth, until 3,500 / tallest ≥ 3. Then one sentence in `docs/BIBLE.md` so rule 7 and the satellite row agree. Limit warm light on the Wallace pyramid to the apex and the top two tiers. Keep a sparse set of red obstruction lights. Dim the entrance grid so the gate is a dark slot, not an office facade. Do not lower the 3,500 m pyramid.

**iPhone.** Shorter towers and fewer lights are neutral or cheaper. Do not add a face sector. The 359-draw night skyline is the budget to protect. This pass should not add a mesh to that view.

### 9. The sea wall vanishes in brown fog, and the apron has neon rings

**Impact 4 · size M.** The films' wall is grey concrete and black water. A spinner is small against it. The crest heights in the data are the right numbers.

**Where.** District `coastal-strip`. Deep link `at=sea-wall-fight` (33.956 N, 118.447 W). `seaWalls` in `city-layout.json`: Sepulveda crest 90 m, harbor crest 75 m. Apron dressing lives under `src/districts/coastal-strip/`.

**Evidence.** `sea-wall-lost-in-fog.png`. `coastView('aerial')`, camera `[-19153, 260, 10259]`, 70 draws, 206 k triangles, `coastSegments` 4. Brown fog, a faint line, a string of lights. `coast-apron` at y = 12 is the terraces up close (101 draws) with concentric cyan, orange, and purple rings on the water. Snow on that apron (`snow-coast`) keeps the rings and the brown. The phone apron crop looks up the dark terraces and is closer. The rings and the aerial loss are the miss. Bible coastal row already says the coast is not a neon district, and `App.ts` sets coast `neonWet` to `0.06`. The rings are a separate decal.

**Fix.** Cool the concrete one step toward grey. Delete the concentric rings on the water and the apron. Keep the spray that already exists. Do not change 90 m or 75 m. Do not add a new water shader.

**iPhone.** Recolor and a removed decal. Aerial was 70 draws. Stay there.

### 10. The old pyramids are labeled dormant and drawn on fire

**Impact 3 · size S.** The 2049 opening says Wallace bought the remains of the first film's maker. `docs/BIBLE.md` keeps two unnamed pyramids, calls them dormant, and also asks for a lit penthouse and flame stacks. The picture follows the flames.

**Where.** `old-pyramid-north` (1,000 m) and `old-pyramid-south` (860 m) in the southeast belt. `src/districts/_shared/megatower/pyramid.ts`, the `else` branch: a lit penthouse (`Style.Glow`) and two flame stacks, `size: 16`, at `height + 46`.

**Evidence.** `wal-old`, `wallaceView('oldpyramids')`, district `southeast-industrial`, camera `[7758, 121, 7781]`, 54 draws. Window grids and live flames between the two masses. That is a working 1982 headquarters. The El Segundo field (`se-flare`, landmark `el-segundo-refinery`) is a different object and a successful homage. Leave those stacks lit.

**Fix.** On the `old-pyramid` branch only: darken the penthouse and omit the two flame stacks, so "dormant" is true. Or keep the flames and change the JSON confidence plus the bible sentence so they are an active homage with a name. Do not do both. Do not touch the El Segundo flare field.

**iPhone.** Turning two flame sprites off saves a little. No new draw.

### 11. A hillside letter row sits on a neon-painted slope

**Impact 3 · size S.** The films do not use a hillside wordmark. The landmark's own confidence string says "No famous hillside sign" and then builds five panels that read as one.

**Where.** Landmark `veil-mark`, 34.109356 N, 118.369091 W, Hollywood. Five atlas panels (`KASAI`, kana `MIDORI`, `OPEN LATE`, `NIGHT MARKET`, `2049`) on 50 m pylons.

**Evidence.** `hw-hills`, camera `[-11525, 178, -6100]`, 72 draws. The panels read as a letter row. The slope under them is the cyan / magenta carpet from finding 7.

**Fix.** Remove the landmark, or turn the five panels into a street-facing blade in the canyon below, using the same atlas. Do not invent a famous sign by another name. The hillside carpet fix is finding 7.

**iPhone.** Removing a landmark saves a draw. A street blade reuses panels that already exist.

### 12. LAPD's street face is a lightbox, and the high office is missing

**Impact 3 · size M.** The film arrival is a roof landing, then a high cool office with the city in the glass. The massing and the pads are already right.

**Where.** District `civic-center`. Deep links `at=lapd-steps`, `at=lapd-lobby`, `at=lapd-deck`. Street dressing in `src/districts/civic-center/`. The lobby is a soffit, not a `registerInterior` room.

**Evidence.** `civic-steps`: a stair, a `SECTOR 5` lightbox, a red orb and a blue orb, and bright white bands. 223 draws, camera `[-21, 2, -27]`. `civic-lobby` is a dark soffit still in the rain, with the same lightbox. The phone approach (`civicView('approach')`, camera `[-39, 232, -119]`) is the roof deck, a spinner, and rain. That deck is the film arrival. The office above it is missing.

**Fix.** Keep the pads as the arrival camera. Dim the street lightbox bands so the concrete reads first. Add one high room, occluded, with a baked city-light window. Interiors cannot show the live city. Cold grey, one desk, no extra crowd.

**iPhone.** One occluded interior. The street shot is 223 draws, close to the cap, so the office must hide the city the way K's room does. Do not add a second crowd mesh on the steps.

### 13. Canyon spinners fly above the signs, and every hull has a police bar

**Impact 3 · size S.** Film traffic crosses the slot between the signs. Police bars are for police hulls. The bible already says the 18 m historic-core streets are too tight to fly, which is fair. The avenues are not that alley.

**Where.** `src/vehicles/SpinnerTraffic.ts`: historic-core free band `ground + 148..260` m, above roofs of 40–110 m. Downtown graph parks at 74 m and 112 m. `car.police` is `chance(0.18)` and only tints the glow. `src/vehicles/spinnerModel.ts` puts a red box and a blue box at y = 1.47 on the shared lights geometry of every spinner, including the player hull.

**Evidence.** `wallace-approach-satellites.png` shows the blocky chase spinner in front of the pyramid, light bar included. `fin-lanes` over DTLA is 342 draws with the avenue lanes at altitude. The historic-core street frames (`bdwy-bridge`, `hw-street`) have an empty slot at sign height.

**Fix.** Instance the roof bar only when `car.police` is set, or drive the existing `isBar` test from a per-instance flag so civilian hulls stay dark. Same draw. On the wide historic-core avenues, reuse the downtown 74 / 112 m pattern where the roofs allow it. Leave the 18 m alleys empty. Update the historic-core sentence in the bible so the next pass does not put the band back at 148 m. Do not raise the medium vehicle budget.

**iPhone.** A second instanced draw for a "civilian" mesh would cost a draw on every street. Prefer one mesh and a flag. Car count stays at the current medium budget.

### 14. The Bradbury court is a tan stair well

**Impact 3 · size M.** This is the 1982 iron-and-glass court, kept on purpose. The file says so: "Masonry galleries and one switchback stair. Not the real iron atrium."

**Where.** District `historic-core`. Interiors `bradbury-court` and `bradbury-service`. `src/districts/historic-core/courtPlan.ts`. Deep link `at=bradbury`.

**Evidence.** `room-bradbury-court`: 19 draws, 37 k triangles, occluded, camera `[-384, 2, 184]`. Beige galleries, a block stair, a black slot. `STONE` is `(0.62, 0.52, 0.42)`, `PLASTER` is `(0.70, 0.60, 0.48)`. `openSky` exists (`hw` 5.4, `hd` 6.2, up to y = 20) and the stair camera still reads as a covered mall well. `IRON` is declared and does not win the frame.

**Fix.** Shift the gallery color toward dark iron and brick. Add one glass plane on the existing `openSky` so the well is skylit. Keep the stair and the plan. Do not import the real building's ornament.

**iPhone.** Interior, 19 draws today. One extra plane stays far under the cap.

### 15. Snow is a particle swap on the same brown night

**Impact 2 · size S.** The films' snow is a cold white fall, mostly the late coastal sequence, quiet against grey concrete. It is a different picture from the rain.

**Where.** Weather id `snow` in `Weather.ts` (`smogTint` 0, `snow` 0.85). `SNOW_TINT` `(0.85, 0.90, 1.0)` in `Atmosphere.ts`, lerped by `w.snow`.

**Evidence.** `snow-market` at the Little Tokyo street goes pale, with square flakes, and the signs stay warm (76 draws). `snow-coast` on the apron stays dark brown, flakes read as rain streaks, and the neon rings from finding 9 are still on the water (84 draws).

**Fix.** Belongs to the palette pass. When snow is high, the cold tint has to win on the coast as well as the market, and the apron rings stay off. Do not add a second particle system. Do not make snow the default LA weather. Rain remains the city.

**iPhone.** Existing uniforms. No new draw.

### 16. LAX is three masts, and the confidence line overclaims

**Impact 2 · size S.** An off-world field at the airport is a fair inference. The structures are invented. The JSON confidence says "Luv heads to LAX," which these films do not show.

**Where.** Landmark `lax-spaceport-towers`, height 420 m, `src/data/city-layout.json`. Ads in `src/districts/lax-spaceport/holos.ts`.

**Evidence.** `lax-aerial`, camera `[-14970, 1001, 13417]`, 72 draws, 2 hologram panels. Three thin masts and a field of lights. From a kilometre up they do not read as a terminal. The concourse interior is a corridor box (finding, leave it).

**Fix.** Rewrite the confidence string so the port is inferred and the gantries are invented. A readable colony line belongs to the atlas pass (finding 6), on the existing `lax-lease` panel. Do not build a cathedral, and do not add gantries.

**iPhone.** A JSON sentence is free. A new terminal mesh would land in a view that is already a light field. Skip it.

## Proposed passes

Five jobs. Each one is a single agent, inside the medium budget. Shared rules for every pass:

- No film assets, no likeness, no copied slogan, no real brand.
- No bloom, no shadows, no second crowd mesh, no second hologram material.
- No new district and no new fabric chunk.
- The night skyline at `[-3810, 501, -2387]` is already 359 draws on medium. Anything you add there has to replace a mesh.
- Interior work hides the city. That is where extra triangles are safe.
- Do not put out the El Segundo flares. Do not change the 3,500 m pyramid, the 216 m LAPD crown, the 185 m slab, or the 90 / 75 m sea-wall crests.

### Pass A — Cold day, black wet streets, a grey wall

One agent, no new draws. In `src/atmosphere/Atmosphere.ts`, shift `DAY` zenith, horizon, and fog toward steel grey-blue and drop the red channel until `megaView('skyline')` at time 14, weather `clear`, reads cold. In `src/atmosphere/Weather.ts`, cut `clear.smogTint` from `0.5` so a dry day is not a 30% lerp toward `SMOG_TINT`. Leave `DUSK` and the `smog` weather orange, and leave the night horizon sodium. In `src/app/App.ts`, lower `U.neonWet` for the market (`0.92`), the historic core (`0.88`), and K (`0.5`) until rainy asphalt stays black with colored streaks. Judge it on `marketView('street')` and `broadwayView('bridge')`. Point the Hollywood far-LOD street neon off the strip's `0.86` for the hills-sparse slope. On the coastal apron, remove the concentric neon rings and lift the concrete one step toward cool grey. When weather is `snow`, let `SNOW_TINT` win on the coast as well as the market, and keep the rings off. Rain cap stays 6 k on medium. Done when the clear-day skyline is grey-blue, a rainy Hollywood street is black, and `coastView('apron')` is grey concrete and black water.

### Pass B — K's room and Wallace's hall

One agent, interiors only. In `src/districts/k-megablock/interior.ts` and `rooms.ts`, darken the shell, take the ceiling tube near zero, and let the amber practical light the room. Enlarge the template window (about 1.15 × 0.7 m) and the `openSky` rain hole (0.56 × 1.24 m in plan, 0.9 m tall) together so rain and a baked neighboring slab fill one wall. Add one original ceiling disc that can throw a faint column. No figure, no likeness, and do not grow the floor plan. In `src/districts/wallace-vernon/interior.ts`, replace the teal closet (`CAUSTIC` `(0.28, 0.55, 0.46)`, about 7.2 × 8.4 × 4.75 m) with one larger unlit hall, still a single mesh, ankle-deep gold water, and one overhead shaft. Both rooms stay occluded. Medium today is 17 draws / 35 k triangles (K) and 14 draws / 34 k (Wallace). Stay under 40 draws and 80 k triangles each. If both rooms are done inside that cap, shift `courtPlan.ts` `STONE` / `PLASTER` toward dark iron and add one glass plane on the existing Bradbury `openSky`. Drop the court rather than bust the cap.

### Pass C — One pyramid, and three exits

One agent, landmark LODs only. Shorten `wallace-satellite-a/b/c` to ≤1,000 m or move them off the downtown approach azimuth so 3,500 / tallest ≥ 3, and correct the one sentence in `docs/BIBLE.md` rule 7 that still lists them at 1.1–1.4 km. On the Wallace pyramid, keep warm light to the apex and the top two tiers, thin the per-tier obstruction lights, and dim the entrance grid to a dark slot. On the `old-pyramid` branch in `pyramid.ts` only, drop the lit penthouse and the two flame stacks so the "dormant" label is true. Leave `el-segundo-refinery` burning. Remove `veil-mark`, or retarget those five panels as a street blade in the Hollywood canyon. Add three far vistas and nothing else: garbage dunes plus one dark shed at `trash-mesa-gate`; orange dust and a few ruined silhouettes on the northeast heading; one grey farmhouse and one dead tree on the north edge. They stay outside street lod0 and outside the skyline camera at `[-3810, 501, -2387]`. Done when `megaView('approach')` shows one dark pyramid, and a fly to each exit shows the vista rather than more sprawl.

### Pass D — The street figure and the atlas

One agent, no new draw class. Move `joi-bridge-dancer` off the 11.2 m deck into a wider historic-core intersection, scale the 14 × 46 m panel toward canyon height with its feet at street level, keep the original figure, and let the existing rain break it. It remains one projector inside the medium cap of 18 panels. In `signPhrases.ts` and `signAtlas.ts`, keep the 8×8 atlas and the ban on real brands. Replace a slice of the 64 cells so kana, hangul, hanzi, and devanagari strokes read as different words, add a Cyrillic stroke group, and add a few non-food lines in original wording: an off-world colony sentence, a drink script, a car-marque script. Do not copy the 1982 slogan. Point the existing `lax-lease` panel at the colony line. Done when `broadwayView('bridge')` shows a street-scale figure, and `marketView('street')` shows more than one script and more than a menu.

### Pass E — The roof office and the spinner bar

One agent, after A–D, and skippable if the draw cap is still the problem. Dim the LAPD street lightbox (`at=lapd-steps`) so the concrete reads first, keep the roof pads as the arrival, and add one occluded high room with a baked city window. Cold, one desk. In `spinnerModel.ts`, show the red/blue roof bar only when `car.police` is set (about 18% of AI hulls). Same instanced draw, driven by a per-instance flag. On the wide historic-core avenues, reuse the downtown 74 / 112 m spinner altitudes where roofs allow, leave the 18 m alleys empty, and update the bible sentence that pins the canyon at 148–260 m. Do not raise the medium vehicle count. Done when a civilian spinner has a dark roof, `civicView('approach')` still lands on the pads, and the new office hides the city.

## Survey record

Preview `http://127.0.0.1:4173/`, WebGL2, SwiftShader. Pixel ratio 1 in both viewports, so this pass did not exercise the medium pixel-ratio cap of 1.5 on a DPR 3 phone. `fps` and `frameMs` are software-rasterizer times. Use the draw and triangle counts.

**Districts**, street or walk plus an aerial or a roof, night rain, medium, unless noted. All 21 ids resolved: `little-tokyo-market`, `financial-megatowers`, `dtla`, `civic-center`, `historic-core`, `k-megablock`, `wallace-vernon`, `coastal-strip`, `lakewood-megablocks`, `south-la-megablocks`, `arts-district`, `westside`, `basin-sprawl`, `southeast-industrial`, `hollywood`, `lax-spaceport`, `south-bay-refineries`, `harbor`, `long-beach`, `east-la`.

**Interiors entered**, each occluded, id matched: `bradbury-court`, `bradbury-service`, `k-lobby`, `k-corridor`, `k-apartment`, `k-head`, `k-lift-lobby`, `k-lift-floor`, `k-lift-roof`, `wallace-atrium`, `lakewood-shop`, `south-la-laundry`, `arts-foundry`, `westside-diner`, `southeast-pump`, `hollywood-lobby`, `lax-concourse`, `south-bay-control`, `harbor-control`, `long-beach-concourse`, `east-la-counter`. Noodle bar, Bibi's, and the LAPD lobby are soffits. The LAPD lobby camera still ran (`civicView('lobby')`).

**Deep links.** Every POI and landmark id in the layout returned `ok: true` from `streetView`, including `trash-mesa-gate`. A same-tick read of district and camera after `streetView` is stale. The frames and the view helpers above are the evidence.

**Counts worth keeping.**

| Frame | Tier | Canvas | Draws | Tris | Notes |
| --- | --- | --- | --- | --- | --- |
| Little Tokyo street | medium | 1280×720 | 166 | 659 k | crowd 160, holo 18, voices 11 |
| Night skyline, westside | medium | 1280×720 | 359 | 978 k | over the 250-draw cap |
| DTLA lanes | medium | 1280×720 | 342 | 938 k | |
| Clear day skyline | medium | 1280×720 | 86 | 247 k | same camera, lights off |
| K apartment | medium | 1280×720 | 17 | 35 k | occluded |
| Wallace atrium | medium | 1280×720 | 14 | 34 k | occluded |
| Bradbury court | medium | 1280×720 | 19 | 37 k | occluded |
| Sea-wall aerial | medium | 1280×720 | 70 | 206 k | y = 260 |
| Joi bridge | medium | 1280×720 | 153 | 556 k | holo 18 |
| Hollywood street | medium | 1280×720 | 45 | 197 k | |
| Ultra market | ultra | 1280×720 | 279 | 825 k | crowd 680, holo 29 |
| Ultra skyline | ultra | 1280×720 | 499 | 1.12 M | |
| Phone market | medium | 390×844 | 140 | 571 k | touch sticks on |
| Phone apartment | medium | 390×844 | 17 | 35 k | occluded |
| Phone clear day | medium | 390×844 | 86 | 236 k | same beige skyline |

The phone frames match the desktop read. The portrait crop makes the bridge glyph taller and still a glyph. The LAPD approach on the phone is the roof deck. K's slab from the phone street reads as a megablock. The touch sticks cover the lower third of every phone frame. They are UI, not a film miss.

Proof frames saved with this critique:

- `daytime-skyline.png` — finding 1
- `k-apartment-bright-room.png` — finding 2
- `wallace-atrium-teal-room.png` — finding 3
- `trash-mesa-gate-empty.png` — finding 4
- `joi-bridge-small-glyph.png` — finding 5
- `hollywood-wet-street.png` — findings 6 and 7
- `wallace-approach-satellites.png` — findings 8 and 13
- `sea-wall-lost-in-fog.png` — finding 9
