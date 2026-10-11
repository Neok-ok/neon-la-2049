# Round 7 builder notes

Not the official score. Round 6 left the drum face as three open slots inside a bright ring, and the nose as a solid hood. The top IoU that round (0.873) was a reconstruction, not a photograph.

This cut replaces the ring, hub, and slots with one flat body-coloured disc at the same outer radius. The hood plates are gone. A boolean channel runs out through the nose, so the top, front, and three-quarter views show two cheeks and an open gap. The head lamps sit on the cheeks. Side and front outer profiles stay on the round-6 heights.

The plan trace is the published top orthographic, length set to the 5.42 m side trace and width set to 2.32 m so it matches the photographs. The film overheads are on the sheet: the opening flight (the car is about 114 px) and the LAPD roof (the parked spinner is its lamps). Neither frame resolves a plan.

High 4896 tris, medium 2374, low 1236. Maps stay 1024 / 512 / 256. Box still 5.45 × 2.32 × 1.36 m.

IoU against this plan: side 0.856, front 0.856, top 0.898. The round-6 mesh, remeasured on the same traces, is side 0.852, front 0.858, top 0.794. Its top miss is the solid hood sitting in the notch. The old round-6 top of 0.873 was a reconstruction and is not the same number. Side is up from the original 0.853. Front is 0.002 under the original 0.858.
