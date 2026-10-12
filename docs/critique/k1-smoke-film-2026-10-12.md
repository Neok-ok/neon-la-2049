# K1 smoke and steam — film critique

12 October 2026. Draft PR #63 at `8246411` (`cursor/k1-smoke-steam-e19e`), read with `main` at `2a10c95` for the lighting registry, the weather wind, and the LAX flame. Docs only. No game code, no film frames, no logos.

**Overall: 4/10** for "reads as Blade Runner 2049 city smoke and steam."

The emitter list is the right list, and a few street plumes sit near a 1.80 m person. In the night rain the film is shot in, the cards glow a flat grey, the launch is a sleeve about 16 m across on a flame 1.4 km tall, and refinery smoke leaves the stack. A stranger at the market can call one column steam. The pad reads as a small sleeve. The avenue stays clear.

`docs/fx/smoke-k1.html` is named in the PR body and is absent at `8246411`. No smoke stills are under `docs/` on that branch. The metres below are the constants in `src/fx/smoke`, plus a curl-free step of `integrate` at 0.034 s. Rain 0.65 and wind 5 m/s are `WEATHER.rain`. The rain life cut (`1 + rain * 0.22` on street kinds) is included. Curl, which is a small roll on top of these paths, is left out.

## Scores

| Check | Score | Read |
| --- | ---: | --- |
| Launch ground billow | 4 | A cloud of 10–22 m cards on a 12–38 m ring. Visible from the burn camera. Small on a 420 m pad. |
| Launch sheath | 3 | White cards, torn stamp, radius 4.4–15.7 m on a head that is 1439 m at phase 0.45. |
| Launch spine | 4 | Hot cards stay on the axis and the orange is masked to the core. The additive column beside them is ice blue. |
| Street vents | 5 | Market column tops near 4.4 m, generic near 5.3 m. Eight of them on ultra, and the market one follows the camera. |
| Manhole sheet | 5 | Knee-high and flat in rain, then it slides off the grate. |
| Rooftop column | 4 | About 8 m off the slab, then ~20–28 m downwind. Almost horizontal. |
| Food-stall veil | 6 | A wisp from about 1.1 m to 2.0 m, 0.36 m wide. Easy to miss unless the camera aims at the cook. |
| Burning-barrel soot | 3 | The gate barrel is near person height and still orange. The curb barrels climb to about 8 m. |
| Refinery stacks | 3 | Cards sit on the 84–140 m flare, rise about 25 m in clear air, and travel about 190 m sideways in a 5 m/s wind. |
| Tailpipe wake | 4 | A 3 m line of 0.6 m puffs behind the bumper, restamped into a sausage, hidden inside 8 m. |
| Wind coupling | 4 | Same `wind` and `windDir` as the rain and the flame. Three different responses. |
| Scale against 1.80 m | 5 | Street cards are human. The launch is a pencil next to its own flame. |
| Lighting, night rain | 4 | Medium and up call `practicalLit`. The grey body is exposure-lifted, so it glows where the lamps do not reach. |
| Low tier | 3 | The cap table is honest. The picture is a dotted flame and a flat orange hint. |

## How this was looked at

Code on `8246411`: `src/fx/smoke/*`, `src/districts/lax-spaceport/launch.ts`, `src/app/App.ts` (the `smoke.update` call and `smokePunctual`), `src/vehicles/groundTraffic.ts` and `SpinnerTraffic.ts` (`collectExhaust`), `src/districts/_shared/kit/materials.ts` (`kitSteamGain`), `src/atmosphere/AirField.ts` (breath), `src/atmosphere/Weather.ts`, `src/lighting/shade.ts`, `presets.ts`, `tiers.ts`, `cluster.ts`. Street widths are `grid.street` in `src/data/city-layout.json`. The person, the LAX apron, and the Hades note are `docs/BIBLE.md`.

No capture was re-run. `scripts/k1-capture.mjs` writes outside the repo (`OUT` defaults to `/tmp/k1-shots`) and the branch has no committed sheet. The tier table in the PR matches `SMOKE_CAP`, `LAUNCH_GROUND_CAP`, `LAUNCH_COLUMN_CAP`, and `VOLUME_STEPS` in `tiers.ts`.

Heights are one particle at the nominal `rise`, integrated until the rain life cut. End-of-life card size is `size1` by `aspect`. Visual top is the particle centre plus half the card height.

## What the film is asking this pass to do

Published accounts, used as reference. No frames are in this commit. The longer building citations are in the B1 and B2 critiques.

- The 2049 street is rain, darkness, and practicals. Steam is local, and it shows up where a sodium head or a cook fire hits it. Roger Deakins has described that night as underexposed and sourced, in the American Cinematographer coverage of the picture. A puff that is equally bright in a dark alley and under a lamp is a different picture.
- Dennis Gassner, from Denis Villeneuve: brutality, and scale as the power. ([IndieWire, 23 Oct 2017](https://www.indiewire.com/awards/industry/blade-runner-2049-dystopia-production-design-denis-villeneuve-1201891427/))
- Wētā and Alex Funke shot the bigatures in smoke, lights as separate passes. The smoke is what knocks the hard edge off a miniature. ([Wētā Workshop](https://www.wetaworkshop.com/projects/bladerunner-2049))
- The repo's own bible points industrial fire at the 1982 Hades landscape: flare stacks on the southern horizon, plumes that still read as columns. `docs/BIBLE.md` §2. The LAX kilometre flame is invented. It still has to sit on the apron the repo already builds: blocks 420 × 260 m, streets 60 m, gantry stack 56 m (`STACK_H` in `src/districts/lax-spaceport/spec.ts`).
- Vegas dust is a different weather. This pass is LA rain. The inversion already lives in `Weather.ts`. These cards are the grates, the cook, the stack, and the pad.

Human metres used below, from the bible and the market dress: person 1.80 m, eye 1.70 m, market doorway quad 2.2 m (`little-tokyo-market/dress.ts`), stall eave about 1.6–2.3 m, Little Tokyo `grid.street` 7 m, downtown avenues 34–40 m, residential streets 12–22 m, LAX street 60 m. A storey in the megablock band is 3.1–3.6 m.

## Per emitter

### LAX launch — billow, sheath, spine

`headHeight` in `launch.ts` is `ground + 28 + ease * 2600`. At the burn camera's phase 0.45 the head is **1439 m**. At the end of the burn (u = 0.78) it is **2628 m**. The burn lasts 36 s. The flame ribbon is four additive quads. The column term is coloured `ice = (0.42, 0.70, 1.00)`. The base term is `(1, 0.84, 0.58)`. The head is near white. Wind lean on that ribbon is `10 + min(12, wind) * 1.4` metres, the same formula as `plumeLean`.

`columnRadius` in `sim.ts` returns **4.4–15.7 m** over the first 1500 m of height. Ultra sheath cards in `prefill` are about 18–30 m across; low sheath cards about 11–19 m. Hot spine cards are smaller (ultra about 11–17 m, low about 6–12 m) and `heat > 0.85` pulls them back inside `0.16` of the radius. Sheath cards are sprung onto the radius. Ultra holds 110 column cards and 80 ground cards. The prefill spreads the column budget with `pow(random, 1.4)` along `min(length * 0.94, 1500)`, so the head of a 1439 m flame is the thin end. New column particles after that only spawn in the bottom 360 m.

The ground billow is `groundPuff`: rings **12–38 m**, centres from 3 m to about 17 m up, cards **10–16 m** on low and **16–22 m** on the higher tiers. The ring is chosen from the camera (`away` from the lens, flanks preferred, and a puff inside 46 m of the camera is shoved sideways). From `laxView('burn')` the camera is about 91 m from the west pad, so the cloud sits on the apron and can fill the lower frame. On a 420 m block it is a puff beside the shaft.

`write` pulls column cards with `d > 40` a fraction `14 / d` toward the camera. At the burn camera that is about 15% of the way to the lens. `placeVolume` draws an 84 m wide box, at most 1100 m tall, 4 steps on high and 6 on ultra, column density `0.06`. The march is a veil. The cards are the body. The body is a white-grey sleeve about the width of the gantry's lower shaft, on a flame sixty times taller. Downtown, `launch.ts` keeps the ribbon readable with a minimum angular size. The smoke cards have no such floor (`fade` 4500–5200 m only dims them). From the downtown camera the flame is a stroke and the smoke is gone.

The spine orange is `PRESETS.flare` (1800 K) masked by `coreDisc`, plus a hot core `vec3(1.55, 0.95, 0.50)` when `heat > 0.55`. That part is aimed at an engine. The ribbon inside the sleeve is still the ice column. One plume, two colours.

### Street vents

Generic curb vents (`places.ts`, when the block hash is above the manhole band): mouth at **1.05 m**, `size0` 0.22 → `size1` 1.05, aspect 1.4, life 3.1 s, rise 0.9. In night rain the centre tops near **4.5 m** and drifts about **4.5 m**. The card is 1.05 × 1.47 m, so the visual top is about **5.3 m**. A 1.80 m person stands in the lower third. Width is a fraction of a 7 m market lane and a small mark on a 34 m avenue. Wind scale 0.2, so the lean is real and still a column.

The market hero, inside 28 m of the noodle street point, is a different emitter: rate 14, life 2.2, aspect 2.2, `size1` 0.82. Rain top of the card is about **4.4 m**, drift about 2.8 m. That is the column a walker can stand in. It is placed by `laneSpot` from the **camera**, 8.4 m along the carriage. `gatherEmitters` rebuilds when the camera moves 26 m or 2.4 s pass. The grate walks with the lens.

Counts: `CAP.vent` is 2 / 4 / 6 / 8 by tier, inside `GATHER_RADIUS` 48 / 80 / 120 / 150 m. A downtown block is about 200 m. Ultra keeps a handful of columns in the whole view. The canyon stays clear.

### Manhole sheet

Generic: mouth 0.42 m, `size1` 1.5, aspect 0.4 (a card 1.5 m wide and 0.6 m tall), rise 0.2, life 4.8 s. Market hero: `size1` 2.05, aspect 0.34, rise 0.14, life 2.4 s, 16.5 m further along the same camera lane.

In night rain, buoyancy 0.22 loses to the rain sink (0.85). The generic centre stays near **0.46 m** and travels about **14 m**. The market centre stays near **0.16 m** and travels about **5 m**. Visual height is ankle to knee. The shape is a flat card, which is the sheet. The motion is the card leaving the grate, so the grate itself goes bare and a smear sits downwind. On a 7 m lane that smear is a couple of lanes long. On a 34 m avenue it is a small flat disc in a wide road.

Clear air would let the same particle climb toward 2 m. The film's street is the rain case. `market-rain` in the capture script is that case.

### Rooftop column

Generic: mouth `roof + 1.15`, `size1` 2.4, aspect 1.5, life 5.2, rise 1.15. Rain: centre about **6.8 m** above the roof, card top about **8.6 m**, drift about **28 m**. Market hero (camera above the street by 10 m, a roof probe in a narrow pitch window): card top about **8 m**, drift about **20 m**. Wind scale 0.7. The column lies down. A few metres of rise off the slab is the right height. The drift turns it into a banner.

The probe can miss a roof and fall back to a point 16 m ahead at `street + 18`. That fallback is how a roof puff ends up in the air with no slab under it.

### Food-stall veil

World-locked, unlike the market vent. `addMarket` emits it only when the camera is within **8 m** of the noodle or Bibi street point, within **0.2 rad** of that stall's heading, and below `street + 6`. `marketView('bibi')` satisfies that. `marketView('street')` yaws up to 0.45 rad toward the shop and often does not.

Mouth at 0.9 m, `size1` 0.36, aspect 2.55, life 1.35, rise 0.72, heat 0.12. Kind 3 stays on the steam side of the shader (`smoothstep` at 3.15), so the card is the white steam albedo with a trace of warmth. Rain: the card runs from about **1.1 m to 2.0 m**, width **0.36 m**, drift about 2.2 m. A 1.80 m person is inside it. The head is near the top. The doorway beside it is 2.2 m. This is the emitter that matches the cook. `fade` 10 m means it is gone before the end of the stall row. Rate 16 against a short life is enough cards when the gate is open, and zero cards when the walker looks down the lane.

### Burning-barrel soot

Two barrels share kind 4.

The curb barrel, on arts, southeast, south bay, harbor, east LA, and long beach, one block in five: mouth **1.35 m**, life **8 s**, `size1` 1.05, heat **1**. Rain: centre about **7.3 m**, visual top about **7.8 m**, drift about 10 m. That is a short chimney, about four people.

The refinery-gate barrel, placed off `doorWorld`: mouth **0.65 m**, life **3.1 s**, `size1` 0.5, aspect 1.5, heat 1. Rain: visual top about **2.9 m**, drift about 3 m. That one is near a person. Both paint the whole card with flare orange. `heatMask` collapses to the core disc only when `launch` is on. A barrel is kind 4, so the mask stays 1, and `heatGain` for a barrel is **1.65**. Albedo is the grey `(0.36, 0.34, 0.32)`, then the orange is added on top of every texel. The read is a glowing orange puff. Soot at a trash fire is dark, with the flame at the mouth.

`barrelLights` registers up to three `flare` practicals at 420 cd and range 3.5 m. That is inside the flare band (`cdMin` 200, `cdMax` 80000). `contact` on the flare preset is false, so they do not paint a lantern pool. They can take a haze slot only inside a few metres.

### Refinery stacks

`flareStack` in `src/districts/_shared/refinery/plan.ts` builds a column **84–140 m** tall (`params.ts` default) and puts the flame at `H + 3.2`. The district already retains a `flare` practical on that point (`south-bay-refineries/details.ts`). Smoke starts at `flame.y + 0.2`, rate 16, life 12, `size0` 4.6 → `size1` 11.5, aspect 1.08, heat 0.45, rise 2.3, `fade` **1100**. Wind scale **1.35**, the highest in `smokeWindScale`.

Clear air, wind 5 m/s: the centre climbs about **25 m** and travels about **191 m**. Night rain: climb about **12 m**, travel about **188 m**, because the life cut and the sink eat the rise while the horizontal term keeps accelerating. A 5 m/s breeze becomes about **22 m/s** of sideways speed (`vx` at the end of the clear run). The plume lies down and disconnects. The card is about 12 m, a small cap on a 100 m stack, and from a kilometre it has no angular floor while the flame sprite does (`flames.ts`). Heat gain 0.55 leaves a warm tint on the grey `(0.30, 0.29, 0.28)`. Mild next to the barrel. The failure is the path, then the size.

`CAP.stack` is 1 / 3 / 4 / 5 emitters. The kind budget is the largest street share (0.22). On ultra that is 116 cards. Enough to fill a 25 m cap. The cap is the wrong object. Hades is a column that stays on the stack and still reads from the basin.

### Tailpipe wake

`GroundTraffic.collectExhaust` puts the pipe at the back of the body (`p - fwd * len * 0.5`) and **0.62 m** up on a car, **0.85 m** on a truck. `wx, wz` are `fwd * speed * 0.78`. `emitTails` multiplies by 0.72, so the puff's world speed is about **0.56 × vehicle speed**, along travel. The car is faster, so the gap opens behind the bumper. Negating that vector would shoot the puff backward and erase the trail. The comment on `Tailpipe` ("opposite travel") describes the relative motion. The stored vector is along travel, and the lag is what makes it a wake.

Each accepted roll also plants a line of 5 discs (7 on the forced roll) back to **3.3 m**, `size1` about **0.58 m** on a car, **0.9 m** on a spinner, alpha **0.95**. A 5 m car (`docs/BIBLE.md` §4) grows a solid sausage about two thirds of its length, restamped whenever the roll hits. Spinner pipes sit 5 m behind the craft and 0.6 m down. Spinners below `ground + 14` are skipped. Low sets `groundTraffic` and `freewayTraffic` to 0 in `quality.ts`, so a car wake does not exist on low. Flying spinners still can.

`emitTails` rejects a pipe with `ahead < 8` or horizontal distance under 8 m. `write` also fades exhaust inside 7 m. The car in front of a close chase, and the car next to a walker, leave no smoke. The lane ahead, past 8 m, shows the sausage.

## Wind

`App.ts` passes `wNow.params.wind` and `wNow.windDir` into `smoke.update`. `updateLaunch` and `Precipitation.update` get that same pair. The field is on the shared weather. Rain also scales loft down, adds `push = 1 + rain * 0.38`, and shortens life.

`integrate` then adds `wx * shear * windScale` as an **acceleration**, and damps with `exp(-dt * dragK)`. Terminal speed is on the order of `(wind × shear × windScale) / drag`. Shear grows with height (`1 + min(2.1, alt / 60)`). The comment in `integrate` that street smoke "takes the full wind" is ahead of the scales: vent 0.20, manhole 0.38, roof 0.70, stall 0.40, barrel 0.12, stack 1.35, exhaust 0.18, launch column 0.08, ground cloud 0.32.

What that becomes in a 5 m/s rain wind:

| Kind | Lateral at end of life | Vertical story |
| --- | ---: | --- |
| Market vent | ~3 m | Still a column, mild lean |
| Generic vent | ~4.5 m | Same |
| Manhole | ~14 m | Stuck at knee height, then gone downwind |
| Stall | ~2 m | Stays on the cook |
| Gate barrel | ~3 m | Stays near the mouth |
| Curb barrel | ~10 m | Rises further than it leans |
| Roof | ~20–28 m | Rise ~6 m, so the column lies down |
| Stack | ~190 m | Rise 12–25 m, so the plume leaves the flare |
| Launch column | 17 m of `plumeLean` at wind 5, 27 m at wind 13 | On a 1439 m head. A vertical candle, matched to the ribbon |

The launch spring overwrites free drift for `KIND.column`, which is why the sleeve stays on the ice ribbon. Stacks have no spring. They are the kind that should lean with the weather and still belong to the stack. At 1.35× and an acceleration term, they do not belong to it.

Curl (`curl.ts`, Bridson finite difference) is a local roll, `turb` 0.4 on the street and 2.4 on the column. It wobbles a card. It does not put the stack back on the flare.

## Scale

Against a 1.80 m person, a 2.2 m market door, a 7 m market lane, a 34–40 m downtown avenue, and a 60 m LAX street.

| Emitter | Visual top in night rain | Width at end of life | Against the body next to it |
| --- | ---: | ---: | --- |
| Market vent | ~4.4 m | 0.82 m | Person stands in it. Wider than a torso, narrower than the lane. |
| Generic vent | ~5.3 m | 1.05 m | About one and a half storeys. |
| Market manhole | ~0.5 m | 2.05 m | Under the knee. About a third of the 7 m lane. A speck on a 38 m avenue. |
| Generic manhole | ~0.8 m | 1.50 m | Same family, then a 14 m slide. |
| Stall veil | ~2.0 m | 0.36 m | Head near the top. Narrower than the doorway. |
| Gate barrel | ~2.9 m | 0.50 m | A person and a half. |
| Curb barrel | ~7.8 m | 1.05 m | A chimney. |
| Roof | ~8–9 m off the slab | 2.3–2.4 m | A short stack, then a 20 m banner. |
| Refinery card | 12–25 m above an 84–140 m flare | ~12 m | A cap. The sideways run is longer than the stack is tall. |
| Car wake | mouth at 0.62 m | 0.58 m, line to 3.3 m | Bumper height. Line shorter than the 5.06 m car. |
| Launch sleeve | radius ≤ 16 m, cards ~20–30 m | — | About half a LAX street, on a 1.4 km head. The 56 m gantry is taller than the sleeve is wide. |
| Launch billow | ring 12–38 m, cards ~20 m | — | A building-sized puff. The pad block is 420 × 260 m. |

Nothing in the street set is a skyscraper by accident. The curb barrel and the roof banner are the street misses. The launch is the scale miss: too small for the flame the repo already draws, and large next to a person only because a 20 m card is large next to a person.

## Lighting

Night camera in `exposure.ts`: f/2, 1/48 s, ISO 1000. EV100 is 4.26. Exposure is `1 / (1.2 × 2^EV)` = **0.0434**. `authoredLift` is **23.0**. The tone mapper multiplies by exposure, so a colour written as `albedo * authoredLiftU` comes back out as the albedo. Steam albedo is `(0.92, 0.93, 0.95)`. An 18-nit window (`NITS.window`) times 0.0434 is about **0.78** in that same pre-grade range. Unlit steam is in the brightness class of a lit window, in a dark alley and under a lamp.

`practicalLit` is added in nits, then the exposure scales it. A 7500 cd sodium (`street-sodium`, range 28 m) at 8 m is on the order of 100 lux before the cosine. A card facing it can add a few nits of orange, enough to compete with the grey body. At 16 m the same lamp is a few nits times a small `ndl`, and the body wins. In-scatter is `practicalInscatter * 3.6`. With rain fog 0.0016 that term is a trace next to the lifted body. The calls are real. The picture is a glowing card with an orange kiss inside one pool.

`neon-sign` and `hologram` are `volumetric: false`, so they do not enter `practicalInscatter`. A glyph does not paint the puff magenta. That failure mode is absent. The orange that does travel is the launch practical: `writeLights` pushes a **42000 cd** flare at range **200 m** and a **9000 cd** flare at range **140 m**, both legal for the flare band and both `volumetric: true`. `volumetricPicks` keeps a light out to `tierRange + light.range`. Ultra's shade range is 68 m, so those flares occupy haze slots across the apron and well past it. Street steam near LAX takes that orange. `contact` is false, so they still do not paint a ground pool.

Low skips `practicalLit` (`smokeMaterial(tier !== 'low')`) and adds `SODIUM * authoredLiftU * 0.045` on steam and a fraction of that on soot. After exposure that is a **4.5%** orange on every steam card, with no distance to a lamp. `bakedNits` (0.9 on low, a 34 m cell in `practicalLit`) is what the ground uses. The smoke hint does not use it.

The volume's own comment records a blue cone from a fatter march. Density is now `0.06` on the column and the albedo mixes toward orange only near the engine. The ice colour a viewer sees at the pad is the additive ribbon in `launch.ts`, showing through sheath alpha `KIND_ALPHA` **0.58**. High and ultra bloom starts at 32 nits, before the tone mapper. One steam card, after the lift, sits under that line. Overlapped launch cores (`vec3(1.55, 0.95, 0.50) * lift`) sit on it. A dense lower plume can bloom white. Street steam should not.

`fog` is false on the smoke material. The flame attenuates with `fogDepth`. A vent ends on its own `fade` (16–26 m) while the weather fog is still in the lane. The puff cuts out on that short range.

Kit steam is handled. `SmokeField` sets `kitSteamGain` to 0, and the kit material multiplies by it. Breath is a second system: `AirField.placeBreath`, caps 0 / 10 / 18 / 26, quads 0.5–2.3 m wide and 1.5–2.7 m tall, rising on `life * 1.7` with a 0.12 m sine drift. It does not read `windDir`. On medium and up the street has wind-driven cards and a bobbing disc field together. Low draws neither breath nor kit steam.

## Tiers

The PR table matches the code. Buffers are allocated in `ensure` at `SMOKE_CAP[tier]`. Street budget is `streetCap` = cap minus the two launch reserves. Kind shares in `field.ts` sum to 1 (vent 0.16, manhole 0.12, roof 0.12, stall 0.10, barrel 0.14, stack 0.22, exhaust 0.14).

| Tier | Billboard | Street budget | Vent / manhole / stack cards | Launch ground / column | Volume | Lighting on the card |
| --- | ---: | ---: | --- | --- | --- | --- |
| Low | 96 | 66 | 10 / 7 / 14 | 14 / 16 | off | Flat sodium × 0.045. `practicalLit` off. |
| Medium | 320 | 248 | 39 / 29 / 54 | 32 / 40 | off | `practicalLit` + in-scatter. Cluster range 36 m, 2 lights per slice. |
| High | 520 | 392 | 62 / 47 / 86 | 56 / 72 | 4 steps | Same, range 52 m, 4 per slice, bloom on. |
| Ultra | 720 | 530 | 84 / 63 / 116 | 80 / 110 | 6 steps | Range 68 m. Bloom on. |

`RATE_SCALE` is 0.40 / 0.62 / 0.85 / 1. Emitter counts (`CAP` in `places.ts`) drop with the tier, and `GATHER_RADIUS` drops to 48 m on low.

What breaks on low, as a picture:

- The launch column is 16 cards on a head that is still up to 2.6 km. `GAIN.low` on the ribbon is 0.72, so the ice stroke remains and the smoke is beads on it. Volume is off, which is the right cost cut, and it leaves the beads in charge.
- The grey body still goes through `authoredLiftU`. The sodium hint is uniform. A grate in a dark block is as orange as a grate under a lamp.
- Two vents, two manholes, one roof, one barrel, one stack, inside 48 m. The market hero at low is `rate 14 × RATE_SCALE 0.4` over a rain life of about 1.9 s, near 11 cards, and the vent budget is 10. It takes the whole vent share.
- Car exhaust does not run, because low spawns no ground traffic. Breath is off. The street is the two vents and the ribbon.
- Medium is the phone-class picture in the memory notes (no bloom). It has the lifted grey body, no volume, and 40 column cards. The beaded launch survives medium. High adds a thin march and bloom, and the sleeve is still ~16 m across.

The tier split matches the code. Low allocates 96 cards. The ultra count stays on ultra. The picture claim is the miss: the flat hint and the 16-card column do not read as steam.

## What does not belong

A blind read of the shaders and the paths, in the spirit of the earlier critiques. No frames were available to point at.

- **Filled discs.** Street `grain` floors at **0.84** (`material.ts`). The stamp's crease is mixed toward that floor. Overlapping vents sum into a soft shaft of ovals. The launch floor is 0.58, which is why the sleeve can break up, and why the street cannot.
- **One stamp for every kind.** `atlas.ts` bakes eight frames of the same wisp. Soot, cook steam, and the pad cloud share it. Albedo is the only difference.
- **Self-glow.** The lifted grey body, described above. Dark air with bright cotton.
- **A blue candle in a white sock.** Ice ribbon, white sheath, orange core disc.
- **A plume that leaves its stack.** ~190 m of drift on a 25 m rise.
- **A roof banner.** ~6 m of rise, ~28 m of drift.
- **A grate that walks.** Market vent, manhole, and roof are rebuilt from the camera.
- **Orange barrels.** Heat on the whole card, curb barrels to ~8 m.
- **A sausage behind the lamps.** Five to seven discs, alpha 0.95, restamped along 3.3 m.
- **A lens pull.** Column cards beyond 40 m step toward the camera. The ground ring is chosen so the burn camera is not inside it.
- **Breath that ignores the wind**, sitting in the same lane as the new field on medium and up.
- **A hard end to a short fade.** Vents die across 16–26 m with `fog` false, while the weather fog is still in the lane.

Absent, and worth keeping absent: neon chroma in the puff (glyphs are not volumetric), a second kit-steam layer (`kitSteamGain` is 0), a cluster texture, a per-light shadow, and an uncompressed twin of the flipbook (the atlas is one `resources.texture`, 384 × 192, no mipmaps).

The shader has no chromatic fringe. The rim is the stamp times `smoothstep` on the quad corner. The defect is a soft filled oval.

## Ranked fixes

For a K1b on the smoke branch. Each item names a symbol that is in `8246411`. Leave the lighting registry's candela bands alone. Leave `tests/visual` alone.

### 1. Give the launch a width the gantry can stand under

`columnRadius` in `src/fx/smoke/sim.ts` (4.4–15.7 m). `prefill` and `emitLaunch` in `field.ts` (110 ultra cards along a 1439 m head at phase 0.45). `placeVolume` (`halfW` 42, column density 0.06). `groundPuff` (rings 12–38 m).

- Grow the radius with height so the base is on the order of the 60 m LAX street (`STREET` in `lax-spaceport/spec.ts`) and the bulbs stay in that family. Card size in `prefill` should follow that radius. The current 18–30 m quads are the whole sleeve.
- Put the ground ring out toward that street, and stop using the camera to pick `ang`. A burn camera 91 m from the pad can see a ring that is actually around the pad.
- Delete the `14 / d` pull in `write`. It moves the sleeve toward the lens.
- Keep the hot-core mask (`heat > 0.85` pulled to `0.16 * columnRadius`). That part is the spine.
- If the march stays, raise its density on the white albedo and keep `U.fogColor` out of the glow. Four and six steps can stay. The previous fat march read as a blue cone. The fix is the albedo.

### 2. Make wind a target speed

`integrate` and `smokeWindScale` in `sim.ts`.

The acceleration term is why a stack at wind scale 1.35 reaches ~22 m/s in a 5 m/s wind. Accelerate toward `windVelocity × scale × shear`, with a time constant near the current drag, and clamp so the puff does not exceed the wind. Then set scales so a stack stays on the flare and leans (about 1), a roof leans and still rises (about 0.5), a vent leans and stays a column (about 0.35), a manhole slides a few metres (about 0.45), a barrel barely leans (about 0.2), a stall stays on the pot (about 0.3). Leave `KIND.column` on `plumeLean`, which already matches the ribbon. Drop the comment that street smoke takes the full wind, or make the code match a single sentence.

### 3. Retint the additive column toward the flare

`colorNode` in `src/districts/lax-spaceport/launch.ts`, the `ice` vector `(0.42, 0.70, 1.00)`.

The sheath cannot read as one burn while the ribbon is ice and the spine is 1800 K. Move `ice` to the flare chromaticity (`PRESETS.flare`, 1800 K) and keep the head hot white. Stay on the additive mesh. Do not add a three.js light. The two `writeLights` flares (42000 cd / 200 m and 9000 cd / 140 m) already steal haze slots out to `LIGHT_TIERS` range plus 200 m (`volumetricPicks` in `cluster.ts`). Cut those to the pad, with a range on the order of the ground ring, once the ribbon carries the colour. The 420 cd barrel flares can stay.

### 4. Stop the grey body glowing

`shade` in `src/fx/smoke/material.ts`.

The body and the heat are multiplied by `authoredLiftU`, so at night they display as the albedo. Write the unlit body near the fog colour, at a small coefficient, and let `practicalLit` and `practicalInscatter` supply the nits. On low, call the same 34 m cell bake `practicalLit` already uses (`bakedNits`). Drop the flat `SODIUM * 0.045`. Leave the exposure where it is. Leave bloom off on medium.

### 5. Barrels at person height, flame only at the mouth

Generic barrel in `gatherEmitters` (`life` 8, `size1` 1.05, `heat` 1, mouth `+ 1.35`). Gate barrel just below it (life 3.1, `size1` 0.5). `heatMask` in `material.ts`.

Use the gate life and size for the curb barrels so the visual top stays near 3 m in the rain step above. Run barrel heat through `coreDisc` the way launch already does, and keep the grey albedo. The gate placement can stay.

### 6. Pin the market steam to the stall

`addMarket` and `laneSpot` in `places.ts`.

The vent at 8.4 m and the manhole at 16.5 m are offsets from the camera. Anchor them to `noodle.street` plus the carriage frame from `carriageNear`, and keep the `open` test so they stay out of the wall. Probe the roof from that shop, and drop the fallback that plants a puff at `street + 18` with no roof. The stall veil's 8 m / 0.2 rad gate can stay; it is already on the cook. Widen the heading gate only if `marketView('street')` (yaw up to 0.45 rad) is supposed to show the pot. The pot is 3.8 m in front of the stall point. The street camera often looks past it.

### 7. One puff per tailpipe roll, visible beside the camera

`emitTails` in `field.ts`. `collectExhaust` in `groundTraffic.ts` and `SpinnerTraffic.ts`.

Keep `wx` along `fwd`. The 0.78 × 0.72 product is what leaves the smoke behind the car. Replacing it with a negated vector will fire the puff down the lane. Delete the `backs` loop that plants 5–7 equal-age discs, and let one spawned puff lag. Remove the `dx² + dz² < 64` reject. The alpha fade for exhaust inside 7 m in `write` is the close-up control. State in the tier note that low has `groundTraffic: 0`, so the wake is a medium-and-up feature. The spinner skip below `ground + 14` hides the street-level craft. A wake there wants the same 0.6 m mouth, at bumper scale, on this tailpipe path.

### 8. On low, draw the pad cloud and skip the beaded column

`LAUNCH_COLUMN_CAP.low` is 16. `VOLUME_STEPS.low` is 0. `emitLaunch` / `prefill` in `field.ts`.

Sixteen cards on a 1439 m head read as dots next to a ribbon that still draws (`GAIN.low` 0.72). Spawn the ground billow on low. Skip `KIND.column` until medium, where 40 cards are still thin and at least share `practicalLit`. Street caps can stay: two vents inside 48 m is a readable low street if the body stops glowing (fix 4).

### 9. Let a grate thin into the fog, and lower the street alpha floor

`shade` in `material.ts` (`fog = false`, `floor` 0.84, `fade` on the emitter). The flame already calls `fogDepth` from `src/atmosphere/SkyFog`.

Multiply street alpha by that fog, with a coefficient high enough that a vent is a wisp by the far end of a 7 m lane and gone down a 34 m avenue. Lower the street grain floor from 0.84 toward 0.45 so the crease in `atlas.ts` can show. Leave the launch floor at 0.58 if the sheath cards overlap. Generate mipmaps on `smokeAtlas`, or the 12 m stack cards will shimmer at the 1100 m fade.

### 10. One wind for the breath discs

`breathMaterial` and `placeBreath` in `src/atmosphere/AirField.ts`. Caps 10 / 18 / 26 on medium and up. Drift is `sin * 0.12` and rise is `life * 1.7`.

Drive that offset with the same `wind` / `windDir` the field uses, at a fraction of a metre per second, so the discs lean with the vents. Skip a breath cell that sits within a few metres of a live vent, manhole, or stall, so the two draws do not stack. Leave `kitSteamGain` at 0.

## Leave closed

- No second exposure, no brighter night sky, no cluster texture, no per-light shadow, no bloom on medium.
- No new three.js light. The flare practicals that stay must remain inside `checkPunctual`.
- No edit to tower families, the LAPD / City Hall / Wallace meshes, pedestrians, or `tests/visual`.
- No film frames, logos, or downloaded flipbooks. The atlas stays a bake of `fbm` in `curl.ts`.
- Vegas dust and the inversion layer stay in `Weather.ts`. This pass is the grates, the cook, the stack, and the pad.
