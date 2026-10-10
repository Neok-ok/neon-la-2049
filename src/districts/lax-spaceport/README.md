# LAX Off-World Spaceport

Sector 12 apron. District id `lax-spaceport`. Archetype id `lax-apron`. The Stage 1 body `spaceport` stays registered and unused. `industrial` stays the Stage 1 body for `south-bay-refineries`. The El Segundo landmark (`flare-field`) is not this district and was not rebuilt.

The polygon, the bearing 0 grid, the 420 × 260 m blocks and the 60 m streets are the Stage 1 entry. JSON `traffic` is 0.28 (the placeholder was 0.08).

## Massing

`plan.ts` is pure. The worker and the detail module both call `planLax`. The terminal is 14 floors of the 5.0 m office module (70 m). Hangars are 4 × 5.5 m (22 m). Dock sheds are 2 × 5.5 m (11 m). Flood masts are 3 × 5.5 m (16.5 m).

The terminal row is block `i = −31`, `j = −64…−54`. The north face has a 12 m recess and a 4.2 m door gap so the concourse is not inside a solid box. A 22 m pier sits on the south of the same block. Pad blocks (`i, j` = −29/−62, −30/−59, −29/−56) emit no fabric. About two other blocks in five stay open taxiway. Wayfinding is atlas only, kind 0, under 140 m².

Invented heights are in the Bible. Anything past 320 m is the gantry landmark, not a fabric box.

## Gantries

`gantry.ts` replaces the Stage 1 `spaceport` landmark builder. Three towers, megatower kit, one mesh per LOD. The published 420 m includes a 30 m mast; the core stops at 390 m (78 × 5.0 m). The pad deck is 0.40 m, under the step-up. A 55 m standby stack (11 × 5.0 m) stays on the pad. The shafts sit on the block centres nearest the Stage 1 offsets, so the 60 m streets miss the colliders. Reserve radius stays 0. LOD switches are 2.4 km and 9 km from a 960 m hull. Beacons are the existing billboards (strobe, red, warm). No scene lights. Triangle counts are `gantryTris` on `__nla.stats()` after the landmark builds (LOD0 / LOD1 / proxy).

## Launch

`launch.ts` is one additive mesh, four quads, not tied to a chunk. Ignition, a column, a wider sheath, and a head with a minimum angle so the flash still reads from downtown and from a kilometre. No `PointLight`. The burn is 36 s. The next ignition is 180 s later. The first is at 48 s. `__nla.launch()` starts one. `__nla.launch(phase, pad)` holds a gantry; `laxView('downtown')` and `laxView('burn')` call that at phase 0.45.

The rumble is `Ambience.setMachinery`, added to the district bed and clamped to 1. Attenuation is `0.34 + 0.66 e^(−d / 7000)`. No new audio node.

## Holograms and the concourse

`holos.ts` calls `registerHologram` only. `lax-glyph` (glyph-loop, 18 × 44 m, white) and `lax-lease` (lease-loop, 36 × 12 m, cyan) face north from the door hall, tower band. The board is Caldera Passage and the wedge is a Ninth Ring share desk. The glyphs are noise. No new shader and no carrier name.

`lax-concourse` is one `buildCorridorRoom` on that door (33.937916 N, 118.408611 W). Warmth 0.16, corridor 4.2 × 3.2 × 3.4 m, room 8.4 × 7.2 × 3.6 m, yaw π, no window, no rides, stream radius 48 m, muffle 0.75, hum 0. POI `lax-concourse` is that threshold, so `at=lax-concourse` lands on it. `at=lax-spaceport-towers` lands on the pin.

Crowd share is 0.05, one loop on the door curb. Shared sodium lamps stay off.

## Traffic

`lanes.ts` registers `lax-streets` (prefix `lx`, lane 11.5 m, nodes i −34…−26 and j −67…−48, no ramps, no shared nodes). Edges whose midpoint is reserved are dropped, which includes the 405 on the east edge and the 105 on the south edge. The mix is vans (0.46), box trucks (0.32), haulers (0.14) and cars (0.08). No tankers. The route id is the lattice id, so streaks get their own cap of about 7,000 dashes. Medium and up draw the vehicles. Low tier is streaks.

Spinners skip this district. A 11.5 m lane would park them at 74 m and 112 m, and the gantries are 420 m, which also fills the 158–420 m roof band. A spawn here is 480–640 m or 720–920 m, and a free flier under ground + 460 m is lifted. Westside and the basin are not skipped.

`lax-shuttle` is one open polyline on street line i = −30 (z = 12,600) at ground + 96 m. Transports only, platoon 2–3, separation 14 m, `altBias` 0, fade 90 m. That is above the 70 m terminal and under the ambient floor. The run is dropped if a gantry collider occupies a sample.

## Light and cameras

Far-LOD ground lights for `lax-apron` are 0.46 and street neon is 0.08. `spaceport` stays 0.3 / 0.15 and unused. Hollywood, the belt, the basin, Westside and `industrial` are unchanged. The ground-light shader is unchanged.

`__nla.laxView('aerial'|'downtown'|'gantry'|'terminal'|'burn'|'interior')`.

Ground above 45 m still swaps to `hills-sparse` before this archetype runs. This polygon is flat.
