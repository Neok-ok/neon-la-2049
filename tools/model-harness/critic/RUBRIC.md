# Spinner critic rubric

Score the contact sheet against the reference stills. You are not told how the mesh was built, and you do not look up earlier scores.

The references are film and prop photographs of Officer K's police spinner. Judge the model by those photographs.

## What the car is

A long, low, wide wedge. About 5.3–5.6 m long, 2.2–2.4 m wide, 1.3–1.4 m tall. Flat filled roof. The nose is split at the front only: two cheeks with an open slot where a hood would be. The roof and the body behind that slot are filled metal, and the glass cabin sits in that roof. The slot has to read from the top, the front, and the three-quarter views. A solid hood is wrong. A slot that continues through the cabin, so the plan is two rails with no roof, is also wrong. Squared tail with a louvered deck. A shallow raked canopy. A flat skirt between two enclosed drums: a larger covered drum under the nose, a smaller covered drum under the tail. The drums are body-coloured. Their faces are flat covered housings, not open, and they do not glow. A bright circular rim or a row of open slots on the drum face is wrong. A diagonal gullwing cut has to read on the flank at orbit distance, as a shadowed gap.

The prop wears a manufacturer wordmark and a graphic on the drum. Those are not required and must not be copied. Original POLICE lettering on the flank is the livery. A red tail strip and a white nose strip. Amber markers are small. A roof lamp, if present, is a low red/blue bar, not a fin.

## What fails

A generic sci-fi car. A manta or a pebble. A roof fin or spine. An open nozzle, radial vanes, or an orange glowing disc. A van. A crystal canopy. One-tone plastic with no panel gaps. A needle nose with no drums. A solid hood with no center channel. A plan that is an open staple, with no roof behind the nose slot. A smooth flank with no gullwing cut, or a rear deck with no louvers. A bright ring or three open slots on a drum face. Copied brand marks or a copied plate.

The covered drums in the references are part of the silhouette. Do not call those a fail. Call a fail only when the drum reads as an exposed wheel, a tyre, a bright rim, or a glowing turbine. The open slot at the nose is part of the car. Do not call that a fail. Do call a fail when the slot eats the roof and the plan is a staple. The roof still is a distant overhead of the landing pad; the car there is only its lamps. Do not fail the model for not matching the city around it.

## Scores

Integers 1–10. Be harsh. 5 is a maquette. 7 is recognisable at the stated distance. 9 is close to the still.

| Column | Question |
|---|---|
| Silhouette | Side, front, rear, and top outlines. Wedge, front slot, filled roof, drums, squared tail. |
| Surface | Gullwing cut, rear louvers, panel gaps, nose slot, flat covered drum face, wear. At orbit distance, the close-ups, and the top row. |
| Lighting | Nose strip, tail strip, amber, low bar, cool underglow. The rim row must show the form. |
| Material | Gunmetal with panel tone, clear coat, edge wear, grime. Tinted reflective glass. Not a clean one-tone shell. |
| Film feel | Would this pass in a rainy street frame next to the stills. |
| reads as K's spinner | Immediate recognition against the references. Under 7 if you have to be told. |
| stray parts | Does any part look like it doesn't belong, sticks out, or floats? Answer yes or no. A fin, a rod, a loose panel, or anything bolted on past the body is yes. The open nose channel is part of the car. The covered drums are part of the car. |

## Return

A yes on stray parts fails the mesh, even when the other scores are high.

A JSON object and nothing before it:

```json
{
  "silhouette": 0,
  "surface": 0,
  "lighting": 0,
  "material": 0,
  "film": 0,
  "readsAsK": 0,
  "strayParts": "no",
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
