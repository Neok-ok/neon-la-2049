# Lighting rules

The city is lit in candela and nits, with one camera exposure for every district. A new light that skips this file will fail `npm run lighting:check` and, at runtime, throw `LightingError`.

The HTML copy is [rules.html](rules.html).

## Units

- Distances are metres. One nit is one candela per square metre.
- A practical is luminous intensity in candela. A glowing surface is luminance in nits.
- Three.js punctual lights are not used for streets, signs, windows, or rooms. The sun and the sky hemisphere are the only scene lights, and their intensity is lux.
- Inverse-square is the Frostbite window: `(saturate(1 - (d / range)^4))^2 / d^2`, with a source radius so a tube does not divide by zero. The window is zero at `range`.
- Colour temperature is a blackbody chromaticity (peak 1). Neon, holograms, and police bars are discharges: pass a linear RGB, do not invent a kelvin for a gas tube. Low-pressure sodium at 589 nm is `sodiumLineLinear()`. The street default is high-pressure sodium at 2000 K, which is the orange the night plates use. White LED streets are 4000 K.

## Exposure

Night is f/2, 1/48 s, ISO 1000 (about EV 4.26). Day is f/5.6, 1/125 s, ISO 100, a smoggy stop down from sunny-16. Exposure is Filament's `1 / (1.2 * 2^EV100)`. The iris adapts with the sun. `?ev=` locks it for a screenshot.

Sky, fog, and rain were painted at exposure 1. Those uniforms are multiplied by `1 / exposure` after the sun and sky lights have copied them, so the grade holds and a wet streak still reads `U.fogColor`. Glare sprites (beacons, flares, portal cards) use the same lift. Signs, windows, and lamp heads are true nits: they dim when the sun is up.

Do not raise the night hemisphere to lift a dark wall. Night skyglow is about 12 lux. A face that is too dark needs its own emissive, inside the nit cap, not a brighter sky.

## Registry

Create every practical with `retainChunk` (a streamed chunk) or `setEphemeral` (signs, holograms, the room you are in). Both call `checkPunctual`.

| Preset | Use |
| --- | --- |
| `street-sodium` | 2000 K cutoff lantern, aimed down |
| `street-led` | 4000 K lantern, the occasional white head |
| `neon-sign` | Discharge. Override `rgb` with the sign face |
| `window-warm` / `window-cool` | 2700 K and 5000 K glass |
| `hologram` | Cyan discharge, unless the panel has its own rgb |
| `beacon-red` / `beacon-white` / `beacon-amber` | Obstruction and pad lights |
| `flare` | Stack fire |
| `interior-fluorescent` / `interior-tungsten` / `interior-sodium` | Room fixtures while that room is open |
| `spinner-headlight` / `spinner-lightbar` | For the vehicle pass. Do not spawn them here |
| `harbor-mast` | For the sea-wall pass. Do not spawn them here |

Bands reject a non-finite position, a candela outside the preset, nits outside 0..20000, kelvin outside 1000..20000, and a range outside 0.2..500 m.

Bloom runs on nits, before the tone map, and only on high and ultra. The threshold sits above a dim window and below a neon face. Medium and low stay unbloomed. The default curve is AgX. `?tonemap=aces` and `?tonemap=neutral` are the comparison. Neutral is the product curve; it is not the night default.

## Tiers

| Tier | Shaded practicals | What else |
| --- | --- | --- |
| Ultra | 4 per depth slice (8 slots) | Contact discs, probes, haze in-scatter, bloom, one daylight sun shadow |
| High | 4 per slice | Contact, probes, haze, bloom. No sun shadow |
| Medium | 2 per slice | Contact and haze. No probes, no bloom, no shadows |
| Low | none | A flat sodium nit on upward surfaces. Signs and windows stay emissive |

The shader reads individual uniforms, not a cluster texture. A float index texture mis-samples on the WebGL2 fallback, the same way a uniform array does.

## Memory

Lighting does not allocate a cluster texture or a shadow map per practical. Contact shadows are analytic discs. The only shadow map is the daylight sun on ultra, and it is disposed when the tier drops or the sun sets.

| Tier | Render targets | Shadow maps | Env maps | Added at 1920×1080, scale 1 |
| --- | --- | --- | --- | --- |
| Low | 0 | 0 | 0 (keeps the atmosphere equirect) | 0 |
| Medium | 0 | 0 | 0 | 0 |
| High | 12 (1 half-float scene color + depth, 11 bloom targets) | 0 | 1, replacing the atmosphere map | 40,077,120 bytes (38.2 MiB) |
| Ultra, night | same as high | 0 | 1 | 38.2 MiB |
| Ultra, day | same as high | 1 at 1024² | 1 | 48,465,728 bytes (46.2 MiB) |

On a 390×844 phone at the tier pixel-ratio cap the same table is 0, 0, 25,444,240 bytes (24.3 MiB) at high (ratio 2), 57,249,520 bytes (54.6 MiB) for ultra night (ratio 3), and 65,638,128 bytes (62.6 MiB) for ultra day.

The memory governor ([docs/perf/MEMORY-RULES.html](../perf/MEMORY-RULES.html)) shrinks the drawing buffer to 0.75 at pressure level 3. Bloom, the sun shadow, and the probe are sized from that buffer, so they follow it once. `setLightingResolutionScale` (0.25 to 1) is a further cut of those targets only, not a second multiply on the pixel ratio. At 0.5 the 1080p high budget falls to 10,017,600 bytes (9.6 MiB). The scene pass is not MSAA: a multisampled half-float target is the buffer that exhausts a phone. The wet-street probe is a `resources.texture`. Lamp poles and heads are shared geometries and materials. Dropping a tier disposes the targets that tier does not use. Entering photo mode disposes the play chain before the photo chain is built.

## What you may not do

- `new PointLight`, `SpotLight`, `DirectionalLight`, `HemisphereLight`, `RectAreaLight`, or `AmbientLight` outside `src/lighting`.
- `emissive`, `emissiveNode`, or `emissiveIntensity` in a new file that does not import `src/lighting`.
- A second exposure per district. Interiors use the street exposure. The unlit bake is scaled into nits so the room does not go black.
- Copied shader code from Filament, Frostbite, or three.js. Use the published formula, or the library function (`agxToneMapping`, `neutralToneMapping`, `acesFilmicToneMapping`).

Harbor, weather, the sea wall, and vehicles are allowlisted until those passes adopt `harborMast`, `spinnerHeadlight`, and `spinnerLightbar`. A new district file is not allowlisted.
