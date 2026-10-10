# Hollywood Entertainment Strip

Sector 1 entertainment boulevard and the hills behind it. District id `hollywood`. Archetype id `hollywood-strip`. The Stage 1 body `entertainment` stays registered and unused. East LA still uses `sprawl-dense`.

The polygon, the bearing 0 grid, the 160 × 90 m blocks and the 22 m streets are the Stage 1 entry. JSON `traffic` stays 0.42.

## Massing

`plan.ts` is pure. The worker and the detail module both call `planHollywood`. Heights are whole floors of the 4.4 m office module (BIBLE §4, 4.0–5.5 m).

The boulevard is street line `i = 33`. Block `i = 32` faces it on `a+`. Block `i = 33` faces it on `a-`. Those two rows call `buildHeritage` (deco, marquee, beaux, roman). Roofs are 8–16 floors (35.2–70.4 m). Behind the front, about one block in six grows a tower of 20–26 floors (88–114.4 m) plus a 4.4 m mast, so the top is 118.8 m. The rest of the boulevard is a four-floor arcade podium (17.6 m) with a lit lip. South of the strip, filler is 5–9 floors (22–39.6 m), and about one block in eleven adds an 18–22 floor shaft. North of the strip, filler is 5–7 floors (22–30.8 m) so the hillside wordmark stays in the street slot. Towers are also omitted on `j` −132…−124 for that sightline.

Blades and marquees are atlas phrases, kind 0 or 1. The only kind-2 panel is the heritage billboard (16 × 10 m, 160 m²), and only when the roof is over 52 m and the bay is over 18 m wide, about one chance in seven, one per block. The existing field promotes those. Nothing here is under the 140 m² kind-2 floor.

Invented heights are recorded in the Bible. Nothing here crosses 120 m, so the megatower kit is not used.

## Holograms

`holos.ts` calls `registerHologram` only. Six existing designs sit on the north curb, yaw 0, facing south: lantern, veil-dancer, ash-crane, ribbon, glyph, lease. The dancer (24 × 68 m) and the crane (22 × 56 m) are skyline band so they read from about a kilometre. The others are tower band. Copy is the shared atlas. No new shader.

## Hills and the wordmark

Ground above 45 m still swaps to `hills-sparse` before this archetype runs. The planner returns no buildings there. About one slope block in three gets a small warm lamp in the detail pass.

Landmark `veil-mark` is five atlas panels on 50 m pylons (10.5 × 42 m, span 13 m), facing south, at block i = 39, j = −129 (34.109356 N / 118.369091 W). Phrases are latin `KASAI`, kana `MIDORI`, `OPEN LATE`, `NIGHT MARKET`, and `2049`. Kind 0, so the hologram field does not replace the text. Warm beacons sit on the pylons. The mesh stays on at every distance. Reserve radius 34 m.

Far-LOD ground lights for `hollywood-strip` are 1 and street neon is 0.86. The carpet lookup uses the JSON archetype, so the slopes glow with the strip even though their fabric is `hills-sparse`. `entertainment` stays 1 / 1 and unused. Basin, Westside, the belt and `industrial` are unchanged. The ground-light shader is unchanged.

## Interior and crowds

`hollywood-lobby` is one `buildCorridorRoom` on the south face of block i = 33, j = −100 (34.100050 N / 118.340792 W). Warmth 0.78, corridor 3.4 × 2.4 × 3.2 m, room 6.8 × 5.6 × 3.4 m, no window, no rides, stream radius 42 m, muffle 0.8, hum 0. The door faces south. POI `hollywood-lobby` is that threshold, so `at=hollywood-lobby` lands on it. `at=veil-mark` lands on the wordmark.

Crowd share is 0.22. Loops run on both curbs of the boulevard, from the north-face blocks only, so a street is not dressed twice. Shared sodium lamps are off for this district id.

## Traffic

`lanes.ts` registers `hollywood-streets` (prefix `hw`, lane 6.4 m, nodes i 19…40 and j −140…−27, no ramps, no shared nodes). Edges whose midpoint is reserved are dropped, which includes the 101 where it crosses the boulevard. The mix is cars (0.72), vans (0.22) and box trucks (0.06). The route id is the lattice id, so streaks get their own cap of about 7,000 dashes. Medium and up draw the cars. Low tier is streaks.

Spinners skip this district. A 6.4 m lane would park them at 74 m and 112 m, and the towers reach 119 m. A spawn here is 158–210 m or 240–420 m, and a free flier under ground + 155 m is lifted. Westside and the basin are not skipped.

## Cameras

`__nla.hollywoodView('aerial'|'street'|'holo'|'sign'|'interior'|'hills')`.

Prop caps per chunk are 180 / 480 / 900 / 1,400. Pools are 24 / 60 / 100 / 140. No new fog, light or audio path.
