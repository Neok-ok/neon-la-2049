# Heritage façade kit

Street walls for districts where an older front is still readable under newer cladding. Stage 6 uses it for the Broadway canyon. Stage 16 (Hollywood) should call `buildHeritage` instead of inventing a second theatre front.

The frame is one face, not a whole block:

* `+x` runs along the street
* `+y` is up
* `+z` points toward the street
* the wall plane is `z = 0`, and the mass sits in negative `z`

`buildHeritage(plan)` returns boxes and sign anchors. It does not import three.js, so an archetype can emit the pieces and a landmark builder can write the same pieces into a `GeoWriter`. `projectFace` / `faceSize` map a piece onto a block face (`a+`, `a-`, `b+`, `b-`).

| Field | Meaning |
|---|---|
| `family` | `beaux`, `deco`, `baroque`, `gothic`, `roman`, `marquee`. Stone vs deco is styles 18 and 19. The crown, the marquee depth and the pilaster width change with the family. |
| `frontH` | Top of the historic front. |
| `height` | Top of the cladding cap. Keep fabric under 320 m. Broadway stays in the 40–110 m band. |
| `wrap` | 0 leaves the old front in charge. Toward 1, side jackets and a set-back panel cap climb around a narrower masonry spine. |
| `door` | Width of a ground-floor opening. The base splits so a sidewalk can step under the marquee. |
| `blades` | Vertical blade signs per stack. Copy is the shared atlas (`signPhrases.ts`), never a real venue name. |
| `billboard` | One 16 × 10 m kind-2 panel, large enough for the existing hologram field to promote. |
| `compact` | Fewer pilasters. Fabric should pass `true`. A hero front can pass `false`. |
| `skin` | Ornament only (cornice, pilasters, marquee, crown, blades). Mass, cap, jackets and tanks are skipped so a landmark can own the volume. |

Styles 18 (`Masonry`) and 19 (`Deco`) are punched-stone and vertical-bay rows in the shared city material. Do not add a façade shader.

Pieces use detail 0 for the mass, 1 for pilasters, cornices, marquees and crowns, and 2 for the roof tank and mast. A fabric sink already drops nothing of those; a landmark LOD can.
