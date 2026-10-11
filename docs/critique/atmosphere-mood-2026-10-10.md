# Atmosphere and mood — 2026-10-10

Critique of the lived city: whether a place feels lonely, oversized, weather-heavy, and quiet in the way Blade Runner 2049 asks for. This file does not change gameplay. Rank is impact × effort. Sizes are S (uniforms, one camera, one shader), M (a room, a figure, a vista), L (new systems). iPhone means the existing medium budget: ≤250 draws, ≤1.5 M triangles, pixel-ratio cap 1.5, no bloom, no ground-haze sheets, no wet mirror.

## How this was looked at

`npm run build`, then `vite preview` on `127.0.0.1:4173`. Headless Chrome through Playwright, WebGL2 on SwiftShader (`webgl=1`), `freeze=1`. Desktop 1280×720 at medium and ultra. Phone 390×844 at medium with `touch=1`. A second phone pass at device scale 3 lands on the medium cap: canvas **585×1266**, pixel ratio **1.5**.

All **20** districts in `src/data/city-layout.json` (19 polygons plus the `basin-sprawl` default). Street, roof, and aerial where a view helper exists. Night rain, dusk, day smog, snow, fog. Deep links and view helpers for the set pieces in the bible.

Occluded interiors entered: `bradbury-court`, `bradbury-service`, `arts-foundry`, `east-la-counter`, `wallace-atrium`, `southeast-pump`, `south-la-laundry`, `k-apartment`, `k-lobby`, `k-corridor`, `lakewood-shop`, `long-beach-concourse`, `harbor-control`, `south-bay-control`, `lax-concourse`, `westside-diner`, `hollywood-lobby`. Each is 13–22 draws and about 34–40 k triangles.

Not entered: `k-head`, `k-lift-lobby`, `k-lift-floor`, `k-lift-roof`. `kView` has no head or lift argument. The noodle bar and the LAPD lobby are soffits, so the city keeps drawing (noodle bar 170 draws, civic lobby 140) and rain still crosses the opening.

The southern trash-mesa pose did not move the craft. After the call the camera was still in `historic-core` at (−375, 2, 138), the previous canyon. The frame is a beige smog wall. Treat the empty orange horizon as unframed. The working orange reference is `wallaceView` on the old pyramids in smog.

Frames were shot from the build before Detail Pass D3. D3 (`src/photo/`) hides the spinner and can grade a still, including an “Ash snow” grade. The street path is unchanged: `defaultPose`, `U.neonWet`, `U.streetFog`, weather ids, interiors, and district beds. Photo grades are a postcard look. They are not a substitute for the street.

SwiftShader frame times (about 0.5–4 s) are not an iPhone measurement. Draw calls and triangles are. The wet reflector stayed off (`refl: false`) because this machine is software; it only runs on a real GPU at high/ultra, in the market, under 28 m.

## What already lands

Keep these. They are the mood the other places should be measured against.

- **Dusk approach to the pyramid** (`megaView` approach). Brown haze, rain, the mass centered, satellites on either side. The chase spinner sits on the portal. The picture around it is the right picture.
- **Day smog from far back** (`megaView` skyline, 15.2 h). A beige sea, the pyramid as a ghost behind a comb of towers. This is the daytime. The default camera is not.
- **DTLA in the rain** (`dtlaView` street). Purple canyon, umbrellas receding, wet magenta, a few people at a distance. 144 draws, 0.45 M triangles, crowd 64 on desktop medium. The same street on a 390×844 phone is 88 draws and 0.28 M triangles, and the people are still in frame.
- **Broadway and the Hollywood street.** Black walls, stacked signs, a wet lane, people small in the canyon. Hollywood street: 83 draws, 0.30 M triangles, crowd 35. They work because the walls stay dark.
- **South LA toward Wallace.** The pyramid sits in a gap between megablocks, rain, three figures. This is the player’s eye framing a megastructure. 63 draws, 0.24 M triangles.
- **Civic darkness.** The steps and the plaza use two colored lights and a lot of black. The lobby’s SECTOR 5 sign is a successful pool of light. Rain still cuts the soffit.
- **The old pyramids in smog.** An orange canyon, flare stacks, a vanishing street. This is the closest thing to an empty orange horizon, and it is already built.
- **Basin street at night.** Sparse, dark, a few sodium lamps. Loneliness works on the ground. The aerial is an infinite beige grid, which is a different mood and a weaker one.
- **Coast blocks inland.** A dark grey street and almost no neon. The landward coast already has its own color. The crest does not.
- **Interior quiet.** Offline capture, four scenes: market peak 0.671 / rms 0.158, Broadway 0.328 / 0.101, harbor (horn forced) 0.237 / 0.067, interior 0.018 / 0.005. Rooms really are quiet. Streets are not, relative to each other.

Medium shots that work do it without bloom, haze sheets, or the wet mirror. Do not spend the iPhone budget on those.

## Ranked findings

### 1. The chase spinner covers the pyramid

**Wrong.** The first view of the pyramid, and the dusk approach, put a black spinner dead center on the portal. On a 390×844 phone the craft covers the lower half of the pyramid and the touch cluster sits on the city.

**Where.** `defaultPose()` in `src/app/App.ts` (y = 230, pitch −0.08, over Little Tokyo, looking southeast). Chase camera in `src/camera/FlyController.ts`: the camera sits about 11 m behind the craft and `lookAt`s a point 25 m ahead, so the hull is the center of the picture. Phone: `p-open-night-rain`, 131 draws, 0.50 M triangles, canvas 390×844.

**Evidence.** Desktop dusk approach and the phone opening. Photo mode already hides the spinner for a still (`PhotoMode` sets `spinner.visible = false`). The fly arrival does not.

**Fix.** Offset the chase camera 4–6 m to one side so the craft stays in frame as a scale cue and the pyramid’s face is clear. On touch, aim the pyramid into the upper half of the portrait, above the stick cluster. Leave photo mode as the postcard path.

**Size.** S. **iPhone.** None. Camera only.

### 2. The opening camera sits inside the smog

**Wrong.** The default eye is at 230 m. Smog’s inversion layer is centered at 200 m (`Weather.ts`, `layerY`). Daytime from that seat is a tan wash. The pyramid is a faint stair. Windows and signs stay on, so day looks like night with the lights left up. The far skyline shot is the daytime that already exists.

**Where.** `defaultPose()` at y = 230. `src/atmosphere/Atmosphere.ts`: `U.windowLit = 0.35 + 0.65 * smoothstep(...)`, `U.signPower = 0.55 + 0.45 * night`, exposure `1.15 - 0.25 * dayF`, hemi `0.55 + 1.3 * dayF`. Day zenith `(0.33, 0.35, 0.37)`, horizon `(0.58, 0.55, 0.49)`.

**Evidence.** `03-open-day-smog` from the default seat versus `megaView` skyline (`34-mega-skyline-smog`). Opening night rain is 163 draws / 0.58 M triangles. The skyline aerial hit 312 draws only because SwiftShader timed out while chunks were still uploading. Settled street shots stay under 250.

**Fix.** Move the opening eye to the altitude and aim of the existing skyline or dusk-approach shot (about 450–600 m, clear of the layer), or cut straight to that approach. Drop the daytime floors: signs and window-lit toward a small night remainder, not 0.55 and 0.35. Keep a few windows. Do not raise the night hemi to “fix” the pyramid face (finding 13). That light is what lifts the market floor.

**Size.** S. **iPhone.** None. Uniforms and one pose.

### 3. The market lane is a pale empty floor

**Wrong.** At eye height the Little Tokyo lane is a milky plane. The mood starts 20 m away, at the lanterns. On a phone the portrait crop is mostly that floor, the signs are cut off, and no one is in frame. The joysticks sit on the fog.

**Where.** `src/app/App.ts` `districtFog`: market is `0.8 * (1 - alt / 70)`. `U.neonWet` in the market is 0.92 below 140 m. Night hemi is 0.55. Rain color in `Precipitation.ts` mixes fog toward neon by `neonWet * night * 0.65`.

**Evidence.** `marketView` street. Desktop 177 draws, 0.65 M triangles, crowd counter 160. Phone 134 draws, 0.50 M triangles, canvas 390×844. The DPR-capped HUD on the same street: **128 draws, 0.50 M triangles, 585×1266, dpr 1.5, crowd 160**. Broadway and DTLA, with less street fog, already show how a lane should read.

**Fix.** Cut market `streetFog` from 0.8 to about 0.45 at eye height, still thicker than DTLA’s 0.28. Leave Hollywood and Broadway alone. Their canyons are dark because they have no street-fog boost. Pitch the market street camera up a few degrees so the lane is not the whole foreground.

**Size.** S. **iPhone.** None. A lower fog value is cheaper, not dearer. Ground haze sheets stay high/ultra (`GroundHaze.ts`) and already require `streetFog > 0.05`. Do not add them on medium.

### 4. One magenta floor is stamped across the basin

**Wrong.** Arts, southeast, East LA, K’s market, Lakewood, and South LA share DTLA’s wet magenta/cyan lane. Lakewood and South LA are interchangeable at night in the rain, except that South LA can frame the pyramid. From the Hollywood hill the ground becomes a neon camouflage blotch under an otherwise fine wordmark. Long Beach’s canyon is brighter and more graphic than its “dimmer downtown” brief.

**Where.** `U.neonWet` in `src/app/App.ts` (lines 442–454). Hollywood, civic, westside, basin, and LAX fall through to **0.22**. Arts is only 0.26, southeast has no neon term, Long Beach is 0.46. Ground neon in `cityMaterial.ts` fades with distance from the camera between 140 m and 520 m, and stays full inside 140 m, so a hill camera paints the slope.

**Evidence.** Hollywood hills shot. Lakewood street and South LA street side by side. K market. East LA.

**Fix.** Set `neonWet` near 0 on arts, southeast, harbor, and south bay, and keep sodium pools. Fade ground neon with camera altitude as well as distance, so a hill view goes dark. Lerp `streetFog` and `neonWet` over about 40 m at borders instead of a hard district step. South LA can keep a little amber toward the pyramid (`southAmber` is already there). Do not give the coast or the basin the canyon floor.

**Size.** S. **iPhone.** None. Shader and uniforms. The medium crowd and draw caps stay put.

### 5. The sea-wall crest at night is a black field

**Wrong.** The lower two thirds of the crest shot are unlit deck. One lamp, a parapet line, a thread of city glow, and a grey sliver of ocean. Snow adds white rectangular flakes and leaves the deck black. The apron in a storm shows the terraces, and the spray reads as a row of grey cards.

**Where.** `coastView('crest')` in `src/districts/coastal-strip/view.ts`: eye just above the deck, look point 18 m down the face, pitch about −0.32. The crest mesh uses `getCityMaterial()` (`surface.ts`). Snow albedo in `cityMaterial.ts` mixes upward faces toward `(0.72, 0.74, 0.78)`, then the night hemi lights that albedo. Flakes are unlit quads (`Precipitation.ts`), so they show when the deck does not. Spray is a `MeshStandardNodeMaterial` in `waves.ts`.

**Evidence.** Crest at night: 73 draws, 0.21 M triangles, crowd 0. Crest in snow: 60 draws, 0.20 M triangles, deck still black. Phone crest: 35 draws, 0.18 M triangles, and the black field is most of a portrait. `neonWet` on the coast is already 0.06, so this is darkness, not a missing neon term.

**Fix.** Raise the crest eye and aim seaward so one lamp pool, the parapet, a foam line, and the water share the frame. Add a small snow emissive on upward city-material faces when `U.snow` is high, so cover reads under the night hemi. No new light and no new particle system. Stretch and tint the spray cards toward the fog color.

**Size.** S. **iPhone.** None if it stays a camera plus a few shader terms. Do not add a second wave mesh on medium.

### 6. K’s apartment is a bright office

**Wrong.** The room the game builds as the quiet heart of the city reads as a beige office: fluorescent tube, cream window square, empty shelves, no rain on the glass, no one else there. The amber practical, the blinds, and a rain slot exist. The camera looks the other way, and the corridor template’s ceiling tube outshines the lamp. Ultra bloom makes the tube brighter. It does not make the room lonelier.

**Where.** `kView('apartment')` in `src/districts/k-megablock/view.ts` (feet just inside the door, look toward +X). `apartmentExtras` and `apartmentLamp()` in `rooms.ts`: amber practical at the table, blinds on the +X window, lock panel. `openSky` on the apartment in `interior.ts`. The tube and the beige shell come from `buildCorridorRoom` in `src/world/interiors/template.ts`. The district README already says there is no projector and no figure. Interior lights are vertex shade (`geom.ts`), not scene lights. While the interior is occluded the hologram field is hidden, so a street figure cannot show up in the room.

**Evidence.** `k-apartment`: 18 draws, 35 k triangles, occluded. Ultra: 29 draws, same room, brighter tube. Phone: the portrait misses the window entirely and shows shelves and beige wall, 17 draws, 35 k triangles.

**Fix.** Aim `kView('apartment')` at the west window and the amber lamp so the blinds, the rain slot, and the practical are the frame. Omit the template ceiling tube in this room so the one lamp is the light. Darken the shared portal card (finding 7) so the window is a dim city, not a cream square. One interior-only dim figure, or a dead projector disc on the wall, stays inside this mesh. Do not add a scene light. Do not turn the street hologram field on indoors.

**Size.** M. **iPhone.** The room is already ~18 draws. A few boxes and one shader figure stay far under 250. No bloom.

### 7. Every opening is a bright card, and the rooms share one corridor

**Wrong.** Past the door, the live street is replaced by one procedural card. In the Bradbury court that card is a blown white grid beside a warm stair that is otherwise the best interior in the city. Service corridors, the foundry, the laundry, the diner, the concourse, both control rooms, and the Hollywood lobby are the same family: beige or grey, one ceiling tube, about 13–18 draws. The Bradbury stair shows the template can be specific. The other rooms do not use that.

**Where.** `portalMaterial()` in `src/world/interiors/portal.ts`. It is one draw on purpose, so the phone does not render the city twice. `buildCorridorRoom` supplies the tube, the warm/cool mix, and the ambient. Soffits (noodle bar, LAPD lobby) never occlude, so rain and the full street stay in the shot.

**Evidence.** `bradbury-court` 19 draws / 37 k triangles. `wallace-atrium` 14 draws / 34 k triangles: a flat teal floor, two tubes, cyan panels, a black box. Civic lobby still shows rain streaks across SECTOR 5.

**Fix.** Darken the portal shader: lower the neon-bar gain and the vignette floor so a window reads as a dim canyon. Keep it one draw. For rooms that ship their own practical, skip the template tube. Hide precipitation while the camera is under a soffit (a flag on the noodle recess and the LAPD mouth), without occluding the whole street. Do not rebuild every district room in this pass. The apartment (finding 6) is the one room that has to change. The atrium can follow the same rule: one dim gold practical, kill the second tube, leave the water dark.

**Size.** S for the portal and the soffit flag. M if the atrium is included. **iPhone.** The portal is already the cheap path. Keep it one draw.

### 8. The dancer reads as a glyph

**Wrong.** The figure over the Broadway bridge and the Hollywood strip is a white mark in a pink oval: diamond head, no face, chevron skirt. At billboard size it is a logo. Standing under it does not feel like standing near someone who is not there. Ultra bloom blows the same mark into a white smear, so bloom is the wrong tool.

**Where.** `veilDancer()` in `src/world/holograms/material.ts`. `joi-bridge-dancer` is 14×46 m, pink, rank 0. `hollywood-dancer` is 24×68 m, pink, rank 0. The README is explicit that this is an original geometric figure, not a person from either film. Medium hologram cap is 18 (`quality.ts`).

**Evidence.** `broadwayView` bridge, historic-core, 158 draws, 0.54 M triangles, holo count at the medium cap. Hollywood holo, 68 draws. Phone bridge, 125 draws, 0.34 M triangles: the oval fills the top of the portrait and the sticks cover the street. Ultra bridge timed out at 311 draws with the ultra crowd (490) and 48 holograms. That count is the ultra tier, not the phone budget.

**Fix.** Keep the original figure. At street distance, thicken the torso and the arm so the mark reads as a body inside the oval. Add one small deck-level panel on the bridge (rank 0, within the 18-panel medium cap) at roughly human scale, using the same shader. Do not raise `holoCount`. Do not enable bloom on medium. Do not copy a face.

**Size.** M. **iPhone.** One extra panel inside the existing cap. The medium street shots that show this figure are already at 125–158 draws.

### 9. The Wallace causeway sounds like the quiet basin

**Wrong.** The processional approach and the plaza are outside the `wallace-vernon` polygon, inside the pyramid reserve. Fog treats them as Wallace (`inWallace` includes `reserveRadius + 40`). Audio uses `districtAt`, which falls through to `basin-sprawl`. The arrival plays the sprawl bed: drone 0.24, almost no industry. The Wallace bed (drone 0.46, industrial 0.8) never starts. The causeway itself has a mood — black walls, a glowing gate, rain — and then the sound is the wrong city.

**Where.** `inWallace` in `src/app/App.ts` (line 437). `CitySound.follow` in `src/audio/CitySound.ts` calls `layout.districtAt` only. Beds in `src/audio/beds.ts`.

**Evidence.** `wallaceView` approach and plaza both report district and `audioDistrict` `basin-sprawl`. Approach: 76 draws, 0.22 M triangles, crowd 0. The face shot, once inside the polygon, correctly reports `wallace-vernon` and is almost entirely black (finding 13).

**Fix.** Point `CitySound` at the same reserve test `inWallace` already uses, so the causeway, the plaza, and the face share the Wallace bed. Crossfade stays at ~1.35 s.

**Size.** S. **iPhone.** None. Audio graph only.

### 10. Streets only differ by about 2× under a loud city bed

**Wrong.** District beds are carefully different (market murmur 1, coast drone 0.22 and a foghorn, Wallace industrial 0.8, basin drone 0.24). On the street the global city bed sits on top. Offline rms is 0.158 in the market, 0.101 on Broadway, 0.067 at the harbor with the horn forced. Interior rms is 0.005. The room is the dynamic range the streets were written for. Residential blocks, the coast, and the basin cannot go quiet while that bed is up. The foghorn is already night-only and quiet (`mix.ts`, `horn` scaled by 0.045). Keep it that way. It should not become a melody.

**Where.** `Ambience.update`: `cityGain` targets `(0.18 + 0.3 * street) * (1 - 0.5 * muffle)`. At a street that is about 0.48. `mix.ts`: `dest.drone = bed.drone * 0.05`, so the loudest drone is about 0.04, under the city bed. Interior room bed is `interior * 0.02`, and muffle drops the city bed. Photo mode’s `setDuck` is a still-camera duck, not a district duck.

**Evidence.** `__nlaAudio.capture` on the four built scenes, numbers above.

**Fix.** Scale the city bed down by the district’s own presence, or add a quiet weight on the coast, basin, Lakewood, and Wallace beds, so those streets can fall toward the interior’s floor. Leave the market and Broadway loud. Do not add music or samples.

**Size.** S. **iPhone.** None.

### 11. There is no empty orange horizon

**Wrong.** The southern exit toward the trash mesa (`trash-mesa-gate`, 33.74 N, 118.06 W, vista only) never got a frame. The pose call left the camera in the historic-core canyon under daytime smog, and the picture is a beige wall with a few lamps. The old pyramids in smog are the mood that vista should learn from: orange air, two masses, flares, a street that ends.

**Where.** POI `trash-mesa-gate` in `city-layout.json`. Weather `smog` already tints with `SMOG_TINT (0.85, 0.55, 0.3)` in `Atmosphere.ts`. There is no ash weather id. Photo mode’s “Ash snow” grade is a still grade, not precipitation.

**Evidence.** Trash-mesa capture: district `historic-core`, position unchanged from the traffic canyon, 218 draws. `74-old-pyramids-smog`: southeast-industrial, 58 draws, 0.29 M triangles, the orange canyon.

**Fix.** Add a view helper that moves the fly craft (and is checked by reading `camera.position`) to the southern edge, pitched so the horizon is in frame, smog pushed orange, one far silhouette. Do not build a new district or a Vegas strip. Ash, if it is added, reuses the snow quad budget and recolors it. No third particle system on medium.

**Size.** M for the vista camera. S for an ash recolor. **iPhone.** The vista should be a dressed-edge shot in the same class as the old pyramids (under 100 draws), not a new streaming ring.

### 12. People vanish against the lens, and the market eye sees a handful

**Wrong.** Anyone who is not a vendor is scaled to 0 inside 1.05 m (`crowd.ts`). A close pass deletes the crowd instead of brushing past it. Medium is 160 people over a 64 m radius, about one person per 80 m², so a 15 m market view holds two or three figures. DTLA’s street already puts a readable group in the lane without a higher cap. The market counter says 160 and the picture says almost nobody.

**Where.** `src/districts/little-tokyo-market/crowd.ts` around the `dist < 1.05` hide. Caps in `src/core/quality.ts`: medium crowd 160, radius 64. Wallace, the coast, and LAX are unregistered and correctly empty.

**Evidence.** Market crowd shot versus DTLA street (crowd 64, several umbrellas in frame). Westside strip crops a figure through the bottom of the lens.

**Fix.** Slide a person aside inside that radius instead of scaling them to 0. Pack the existing market loops so a 15 m view holds several people the way the DTLA sidewalk already does. Do not raise `quality.ts` counts.

**Size.** S. **iPhone.** The phone market is already 134 draws with crowd 160. Re-packing loops does not add instances.

### 13. Also seen, smaller

- **Wallace face.** `wallaceView` face is rain on a near-black mass. Board-form and the bronze slits do not read. 68 draws, 0.24 M triangles, audio correctly `wallace-vernon`. Lift the face’s own emissive. Do not lift the global night hemi (finding 2).
- **Wallace atrium.** Flat teal, two tubes, 14 draws. Same cure as finding 7: one dim practical, dark water.
- **LAX burn.** A white bar beside the gantry, not a warm launch. Tint the existing burn toward the smog orange. 55 draws. The aerial of the needles in fog is the better lonely shot. Crowd 0 is correct.
- **Harbor ship.** The hull fills the frame as a black wall. Pull the camera back so water, crane, and hull share it. Street fog here is already 0.46. The control room is the shared corridor (finding 7).
- **Westside street helper.** One street shot stayed in a fog void and reported `audioDistrict` `coastal-strip` while the polygon was `westside`. The strip shot later showed a real low block, an umbrella, and the same magenta floor (finding 4). Re-aim the street helper the way the strip helper already frames a block.
- **Hollywood from the air.** A dark grid and one pink slot. The street is the strip. The aerial is not. A camera aim, once finding 4 stops the ground neon.
- **No ash in the weather Markov.** Clear, overcast, drizzle, rain, downpour, fog, smog, snow, sleet. See finding 11.

## Budget, so the passes stay inside it

Settled medium, desktop 1280×720, pixel ratio 1:

| Place | Draws | Triangles |
|---|---:|---:|
| Opening, night rain | 163 | 0.58 M |
| Market street | 177 | 0.65 M |
| DTLA street | 144 | 0.45 M |
| Hollywood street | 83 | 0.30 M |
| Basin street | 100 | 0.29 M |
| Coast crest | 73 | 0.21 M |
| K apartment | 18 | 0.035 M |
| Wallace atrium | 14 | 0.034 M |

Phone, medium, 390×844, and the capped buffer:

| Place | Canvas | Draws | Triangles |
|---|---|---:|---:|
| Opening | 390×844 | 131 | 0.50 M |
| Market | 390×844 | 134 | 0.50 M |
| Market, dpr cap, HUD on | 585×1266 @ 1.5 | 128 | 0.50 M |
| Joi bridge | 390×844 | 125 | 0.34 M |
| DTLA | 390×844 | 88 | 0.28 M |
| Hollywood street | 390×844 | 44 | 0.20 M |
| Coast crest | 390×844 | 35 | 0.18 M |
| K apartment | 390×844 | 17 | 0.035 M |

Ultra opening, same 1280×720 window, pixel ratio still 1: 243 draws, 0.82 M triangles, crowd 680. Under the draw cap and under 1.5 M. Unsettled aerials (medium skyline 312, ultra skyline 506, ultra market 273) were SwiftShader timeouts with the upload queue still full. They are not steady-state budget failures.

Headroom on the phone is real. It is not enough for bloom, a second city render, a new particle system, or a higher crowd cap. Every pass below stays in uniforms, cameras, one existing shader, and the interior meshes that are already ~20 draws.

## Refinement passes

Five jobs. Each is one agent, inside the medium budget. Do not enable bloom, ground haze, or the wet mirror on medium.

### Pass A — The first look at the pyramid

Move the opening. In `FlyController`, offset the chase camera a few meters to the side and aim the portrait frame so the pyramid sits above the touch cluster. In `defaultPose`, leave the inversion layer: use the altitude and the aim of the existing dusk approach or the far skyline shot. In `Atmosphere.ts`, drop the daytime `signPower` and `windowLit` floors so day is not night with the signs left on. Do not raise the night hemi. The market floor and the Wallace face both get worse if that light comes up. Photo mode may keep hiding the spinner for stills. The fly arrival has to show the pyramid with the craft still in the picture. Check `megaView` approach at dusk and the default seat at 15.2 h smog, desktop and 390×844.

### Pass B — Dark streets, and a market you can see down

In the `App.ts` frame block, cut market `streetFog` from 0.8 to about 0.45. Set `neonWet` near 0 on the industrial districts and the harbor, and fade ground neon with altitude so the Hollywood hill stops painting the slope. Lerp fog and neon over about 40 m at a border. Pitch the market camera up. In `crowd.ts`, slide people aside inside 1.05 m instead of scaling them to 0, and pack the current market loops so a 15 m view holds several figures. Do not raise the medium crowd cap. Do not add street fog to Hollywood or Broadway. Check the market street, the Hollywood hill, a Lakewood street, and a South LA street, at night in the rain, on desktop and on 390×844. Draws on the market should stay near the measured ~130–180.

### Pass C — The apartment, the doorway, the dancer

Darken `portalMaterial` so every window is a dim canyon and still one draw. In the apartment, skip the template ceiling tube, and aim `kView('apartment')` at the amber lamp and the west window so the blinds and the rain slot are in frame. One interior-only dim figure or a dead projector, inside the existing interior mesh, no scene light, hologram field still hidden while occluded. On the bridge, thicken `veilDancer` at street distance and add one human-scale deck panel inside the medium cap of 18. Hide rain under the noodle soffit and the LAPD mouth. Leave the other corridor rooms for later, except the atrium if the same tube deletion is cheap. Check `k-apartment`, `bradbury-court`, and `joi-bridge` on desktop and on 390×844. The apartment should stay under 30 draws.

### Pass D — The wall, the snow, the orange edge

Retarget `coastView('crest')` so a lamp pool, the parapet, a foam line, and the water share the frame, including in a 390×844 portrait. Add a small snow emissive on upward faces in `cityMaterial.ts` when `U.snow` is high. Tint and stretch the spray cards. Add a fly view, verified by camera position, from `trash-mesa-gate` looking out of the city: smog orange, one far silhouette, modeled on the old-pyramids shot. Do not build a district. Ash, if included, recolors the snow quads and does not add a particle system. Check the crest at night, the crest in snow, and the new vista. Crest draws should stay in the measured 30–80 range.

### Pass E — Let the quiet districts be quiet

Duck the global city bed by district so the coast, the basin, Lakewood, and the causeway can fall toward the interior floor (rms about 0.005) while the market and Broadway stay loud. Point `CitySound.follow` at the Wallace reserve the same way `inWallace` does, so the approach and the plaza stop playing `basin-sprawl`. Leave the foghorn night-only and scaled as it is. No music, no samples. Re-check with the existing offline capture: market and Broadway stay the loud scenes, harbor and a coast or Wallace street drop, the apartment stays near rms 0.005.
