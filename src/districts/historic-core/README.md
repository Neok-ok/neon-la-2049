# Broadway Neon Canyon (`historic-core`)

Stage 6. Real Broadway heritage fronts, partly wrapped in newer cladding, on the 38° grid (blocks 110 × 70 m, streets 18 m). The reusable face builder is `src/districts/_shared/heritage/`.

## What is here

* **Fabric** (`archetype.ts`). Two heritage bays on an empty Broadway face, named theatres where the real houses stand (`sites.ts`), one lighter bay on the other long face, a single masonry end on the cross streets. The Bradbury footprint is a hole, not a reserve, so the side bays and the lane stay.
* **Bradbury** (`bradbury.ts`, landmark `bradbury-building`). 38 × 48 × 22.4 m. The pin is the centre of the depth; the street wall sits on the east Broadway façade. Walk-in court, galleries, columns, an open beam grid, a 27 m jacket on the back and the south side. POI `bradbury` is the west sidewalk. LOD distances 220 / 700 m.
* **Footbridge** (`bridge.ts`, landmark `canyon-bridge`). Deck at 11.2 m on the street one block east of Broadway. Stairs rise 0.35 m. `joi-bridge-dancer` is `veil-dancer`, rank 0, tower band. LOD 160 / 520 m.
* **Street** (`dress.ts`, `details.ts`, `crowd.ts`). Both curbs of owned edges. Bollards, neon pools, steam, parked rickshaws. No sodium lamps. Crowd share 0.72 on the market mesh.
* **Cameras.** `__nla.broadwayView('street'|'bridge'|'bradbury'|'spinner'|'atrium')`.

## Budgets

Measured with `generateFabric` on 500 m chunks:

| Chunk | Blocks | Boxes | Fabric tris (×10) | Signs |
|---|---|---|---|---|
| Around the Bradbury | 21 historic | 832 | ~8.3 k | 481 |
| Around the south theatres | 31 | 915 | ~9.2 k | 457 |

Boxes per block were about 31 / 43 / 67 (min / median / max) in the Bradbury chunk. LOD0 adds one kit batch, steam and pools. Caps: props 420 / 1,100 / 2,200 / 3,400, steam 16 / 40 / 80 / 120, pools 48 / 110 / 180 / 260 on low / medium / high / ultra.

## Known gaps

The court is a soffit, not an interior stream. Galleries have no stair. Rickshaws are scaled cars. Low spinners do not use the 18 m streets. Kind-2 promotions do not use `veil-dancer`. Eastern Columbia is nudged ~27 m so it lands in a block. Several theatre heights are storey reads, not published roofs; the published ones are Eastern Columbia (80.5 m) and the gothic tower (73.8 m).
