# Veil Dancer LOD

Detail follows the graphics tier. Ultra and High carry the full figure. Medium is lighter. Low is a simple glyph. The city keeps the figure on every tier: low does not delete her to save a phone. There is no hard triangle gate. Count the triangles, the file bytes, and the distance reads, and write them next to the sheet.

The tier is a ceiling. Distance spends that ceiling, on the curve the shader already uses: full body inside 24 m, thin glyph at 160 m and beyond, blend between. A mesh that pops at a hard switch fails even when the triangle count is fine.

## Ceiling

| Tier | Mesh | Treatment | Motion |
|---|---|---|---|
| Low | `#outer` shell. One skirt mass, arm up as a spike, veil as a single edge. Interior gaps may close. | Coarse scan (about 8 lines). No tear. No spill. No ground card. No ghost. | The thin sway only (`mot` floor 0.28). |
| Medium | Bind body, three skirt steps, veil as one sheet, both arms, waist pinched to 4.2 m. | Scan, flicker, tear. Spill and a ground card when the tier has slots. No ghost. | Full idle. |
| High | Faceted diamond, chevron hems, veil as two ribbons with the notch. | Medium, plus one ghost slice when this panel is among the first five in the field's score order. | Full idle, and the close-range thicken. |
| Ultra | The high mesh. | A second ghost slice, same rule. | Same as high. |

Ghost slices are a property of the hologram field, not of this figure alone. They step 0.85 m back and dim. High and ultra share one file, the way the spinner shares `spinner-high.glb` across Ultra and High.

## Distance inside a ceiling

| Camera distance | What you draw |
|---|---|
| 0–24 m | The tier's ceiling. |
| 24–160 m | Blend from that ceiling toward the low shell. |
| 160 m and out | The low shell, on every tier. Scan count follows `detail`, which is already 0 at the band's far edge. |

`detail` today is `(holoDetail / 3) × (1 − distance / (range × 1.05))`, with `holoDetail` 0 / 1 / 2 / 3. The mesh blend uses the 24–160 m curve. The scan, tear, and flicker keep using `detail`.

## Where she is still in the world

Cull distances, from the live streaming radii:

| Tier | Broadway (tower: `nearRadius × 1.35`) | Hollywood (skyline: `max(near × 1.35, far × 0.55)`) |
|---|---:|---:|
| Low | 1,215 m | 2,475 m |
| Medium | 1,755 m | 3,850 m |
| High | 2,430 m | 5,500 m |
| Ultra | 3,240 m | 7,700 m |

Off to the side, a panel whose direction dot with the view is under 0.22 drops out once it is more than 28 m away (about 77°). A panel you are about to walk under stays up.

Low still has a hologram cap of 6 panels, rank 0 kept first. Both dancers are rank 0. A low frame can still drop one of them when five other rank-0 panels score better. That is the field cap, not a reason to delete the mesh.

## Triangle bands to report

These are the bands a round should land in. Landing outside one is a note in the review. It is not a reject. A silhouette miss is a reject.

| File | Band |
|---|---|
| `dancer-high.glb` (Ultra, High) | 4,000–8,000 triangles |
| `dancer-medium.glb` | 1,200–2,500 |
| `dancer-low.glb` | 180–400 |

Report the glTF bytes after meshopt as well. The low file is the distant glyph and the low ceiling, so it has to read at 200 m and at a kilometre on the Hollywood placement. A low file that is only a rectangle fails, whatever the count.

## Draw

The city draws every hologram design in one instanced material. A future pass keeps that. The practical split, same idea as the player spinner versus the traffic shell:

- Close, medium and above, the nearest `veil-dancer` may be the hero mesh, one extra draw.
- Far, and all of low, stay on the shared quad. The quad samples a mask rendered from the approved low mesh, so the distant glyph matches `#outer`.
- Other designs (crane, coil, ribbon, the ad loops) stay on the SDF branches they have.

Two full-city hologram materials, or a skinned dancer on every panel in the basin, is outside this plan.
