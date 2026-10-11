# Veil Dancer look-target

Original canyon figure for Veil House. A geometric dancer in pink light: diamond head with no face, three separated chevron skirts, one arm held up, one arm out, a long veil. The Broadway panel is a blade. The body is narrow on purpose, and the skirt flare plus the raised hand are what keep it from reading as a lamp.

The figure that ships today is a stack of ellipse and diamond SDFs on one quad (`veilDancer` in `src/world/holograms/material.ts`). That stack is the thing to replace. Panel sizes, ranks, bands, and spill stay.

## Silhouette

Front view, bind pose, inside the 15 × 68 m Broadway quad. The outer contour (`#outer` in [silhouette.svg](silhouette.svg)) is one vertical mark: a diamond cap, a raised hand that breaks the crown, shoulders narrower than the middle skirt, a skirt that steps wider then narrower, a veil along one side. The bind plate (`#bind`) is that same body with the waist pinched and the veil as its own ribbon.

The head is a diamond, taller than it is wide, blank. No eyes, no mouth, no hairline, no ears. A facet edge is a brighter core, not a drawn feature.

The raised arm stays up for the whole loop. The hand is a mitten of light. Fingers that shimmer into noise are a fail. The other arm leaves the shoulder and stops inside the skirt width.

The veil is a ribbon on one side of the body, about 1.4 m wide. It overlaps a skirt edge. It stays off the waist. A notch in the ribbon is the only break.

Side view (`#side`): a blade at most 1.8 m deep. Skirts are the thick part. The head is thinner. The veil sits behind the shoulder line. From the street, a grazing angle still shows the diamond and the raised arm, because the shell has thickness and the panel is double-sided.

## Proportions

Authored to the Broadway blade (15 m wide). Hollywood's 24 m quad letterboxes this same figure. It does not stretch her.

Hem tip at uv `(0.50, 0.020)`. On Broadway that uv is the street plus 0.12 m. Crown of the diamond at uv `(0.50, 0.895)`. Raised hand at uv `(0.66, 0.955)`.

| Mark | uv y | Street height (Broadway) | Full width |
|---|---:|---:|---:|
| Hem tip | 0.021 | 0.19 m | — |
| Lowest skirt step | 0.176 | 10.7 m | 7.2 m |
| Middle skirt | 0.338 | 21.7 m | 13.2 m |
| Upper skirt | 0.450 | 29.4 m | 9.0 m |
| Hips | 0.521 | 34.2 m | 7.4 m |
| Waist | 0.600 | 39.6 m | 4.2 m |
| Shoulders | 0.729 | 48.3 m | 8.4 m |
| Diamond head | 0.796–0.896 | 52.9–59.7 m | 4.2 m |
| Raised hand | 0.965 | 64.4 m | mitten |

Street height = `0.12 + (uv.y − 0.02) × 68`. The crown sits 59.5 m above the hem, about eight and a half head-heights (head 6.8 m). Shoulder width is 8.4 m. The waist pinches to 4.2 m, which is the break between ribcage and hip. The middle skirt is 13.2 m, the widest mark, and it still sits inside the 15 m quad with 0.9 m of margin each side. The three widths are steps on one skirt, not three floating diamonds.

Depth along the panel normal: 0.8 m at the head, 1.8 m at the middle chevron, 0.4 m for the veil. Two ghost slices step 0.85 m back. Depth plus ghosts stay one figure.

## Pose set

An ad idle, about 5.2 s, the current sway period (`sin(time × 1.2)`). The hip term stays near 4.1 s (`sin(time × 1.55)`) so the skirts do not lock to the torso. She does not walk. There is no foot plant.

| Pose | What moves | Amount |
|---|---|---|
| `bind` | The silhouette master | [silhouette.svg](silhouette.svg) `#bind` |
| `sway-l` / `sway-r` | Head and shoulders lead, skirts lag ~0.3 s, veil lags ~0.6 s | Head ±1.1 m, hip ±0.55 m, veil ±1.6 m |
| `hip` | Pelvis and chevrons counter the ribcage | Hip ±0.55 m, chevrons a few degrees |
| `veil` | Ribbon only | ±1.6 m off the bind line |
| `glitch` | Bind, with one horizontal band shifted | At most 0.6 m, for a frame |

The raised arm does not drop in any pose. Dropping it removes the nick that reads at 200 m.

Seeds stay 0.37 on Broadway and 0.17 in Hollywood, so the two figures are out of phase.

## Materials

The panel is additive. A dark face is invisible. Anything that must read is emissive. Gaps are holes in the shell, not black paint. Interior faces that point at the camera fill the waist with light, so the shell is one thickness, normals outward.

Tint is sign pink, `(1.00, 0.18, 0.55)`. The bright core of each shape mixes 62% toward `(0.92, 0.97, 1.00)`, which is the hot white already in the hologram shader. Chevron hems, the diamond facet, and the veil edge take that core. The body of a chevron stays the pink.

No albedo bake, no grey cloth, no AO darkening. An additive figure that has been "weathered" just goes dim.

## Scanline and glitch

The mesh has to survive the treatment already in `getHoloMaterial`. A clean studio render is not the bar.

| Treatment | What it does |
|---|---|
| Scan | Line count blends from 8 at detail 0 to 32 at detail 1. The sweep scrolls with time. |
| Tear | A rare horizontal band (`hash` past 0.988, 22 bands) shifts sideways by `0.04 × detail` in uv. On the 15 m quad that is 0.6 m at full detail. |
| Flicker | Most frames hold. A dip takes the whole figure to 0.72. A rarer spike adds brightness. |
| Ghost | High: one extra slice on the first five panels in the field's score order (distance over range, plus rank, plus view angle), 0.85 m back along the normal, dimmer. Ultra: a second slice. |
| Spill | Broadway 36 m, Hollywood 48 m, onto concrete and the wet street. Low turns spill off. |
| Haze | The shader already fades the panel with distance. Fog does not get a second pass. |

A tear may slide a band. It leaves the head attached and the waist still a pinch. A glitch that deletes the raised arm, or that holds for more than a flash, fails.

Low detail keeps the thin glyph. Close up, `thick` is 0.18, which only moves each radius a short way from its thin value toward its thick value. Past 160 m `thick` is 0 and every tier uses the thin radii. The outer contour, the raised hand, and one skirt flare remain. Interior gaps may close.

## How she reads

- **5 m.** Under the hem, eye at 1.70 m. The hem point, the lowest skirt step, scanlines as separate bars, pink spill on the wet street (36 m on Broadway). A person at the feet is a small dark mark against the glow. There is no face to find.
- **30 m.** Across the 18 m Broadway street, looking up. Diamond head, arm up, pinched waist, three skirt steps, veil to one side. Scanlines are texture on the body. The figure is a dancer in a pose.
- **200 m.** Down the canyon, Broadway fog on. A pink vertical with a wider middle and a nick at the raised hand. The head is a separate cap. The waist pinch may close in the fog. Spill is a pink patch on the street.

Hollywood is skyline-band, so she also has to read from about a kilometre: a pink mark with a skirt flare. The arm nick may go. The cap at the top stays.

## Fail

A face, an eye, a mouth, or a likeness. A stack of similar diamonds. Box arms or box legs under the skirt. A veil that fills the waist. A studio-only render that falls apart once the scan is on. Fingers. A logo or a film wordmark. A torso stretched to fill the 24 m Hollywood quad. A raised arm that drops. A low-tier figure that disappears. A side view that is a paper cutout or a wall.
