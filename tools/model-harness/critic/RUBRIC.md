# Spinner critic rubric

Score the contact sheet against the reference stills. You are not told how the mesh was built, and you do not look up earlier scores.

The references are film and prop photographs of Officer K's police spinner. Judge the model by those photographs.

## What the car is

A long, low, wide wedge. About 5.3–5.6 m long, 2.2–2.4 m wide, 1.3–1.4 m tall. Flat roof. The nose is split: two front cheeks with a deep open channel between them, where a hood would be. That gap has to read from the top, the front, and the three-quarter views. A solid hood is wrong. Squared tail. A shallow raked canopy. A flat skirt between two enclosed drums: a larger covered drum under the nose, a smaller covered drum under the tail. The drums are body-coloured. Their faces are flat covered housings, not open, and they do not glow. A bright circular rim or a row of open slots on the drum face is wrong.

The prop wears a manufacturer wordmark and a graphic on the drum. Those are not required and must not be copied. Original POLICE lettering on the flank is the livery. A red tail strip and a white nose strip. Amber markers are small. A roof lamp, if present, is a low red/blue bar, not a fin.

## What fails

A generic sci-fi car. A manta or a pebble. A roof fin or spine. An open nozzle, radial vanes, or an orange glowing disc. A van. A crystal canopy. One-tone plastic with no panel gaps. A needle nose with no drums. A solid hood with no center channel. A bright ring or three open slots on a drum face. Copied brand marks or a copied plate.

The covered drums in the references are part of the silhouette. Do not call those a fail. Call a fail only when the drum reads as an exposed wheel, a tyre, a bright rim, or a glowing turbine. The open channel at the nose is part of the car. Do not call that a fail. The roof still is a distant overhead of the landing pad; the car there is only its lamps. Do not fail the model for not matching the city around it.

## Scores

Integers 1–10. Be harsh. 5 is a maquette. 7 is recognisable at the stated distance. 9 is close to the still.

| Column | Question |
|---|---|
| Silhouette | Side, front, rear, and top outlines. Wedge, split nose, drums, flat roof, squared tail. |
| Surface | Panel gaps, louvers, gullwing cut, open nose channel, flat covered drum face, wear. At the close-ups and the top row. |
| Lighting | Nose strip, tail strip, amber, low bar, cool underglow. The rim row must show the form. |
| Material | Charcoal metal, matte against satin, grime in gaps, scuffs. Not plastic, not one highlight. |
| Film feel | Would this pass in a rainy street frame next to the stills. |
| reads as K's spinner | Immediate recognition against the references. Under 7 if you have to be told. |

## Return

A JSON object and nothing before it:

```json
{
  "silhouette": 0,
  "surface": 0,
  "lighting": 0,
  "material": 0,
  "film": 0,
  "readsAsK": 0,
  "fails": ["short reasons"],
  "notes": {
    "silhouette": "",
    "surface": "",
    "lighting": "",
    "material": "",
    "film": "",
    "readsAsK": ""
  }
}
```
