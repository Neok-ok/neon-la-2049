# Round 4 builder notes

Not the official score. The sheet is the round-3 mesh with the first PBR bake: 1024 albedo, roughness, metalness, and a bevel normal. 5992 tris. Box still 5.45 × 2.32 × 1.36 m.

The grade used a one-pixel neighbour test for edge wear and a UV hash for rain. Under the rim light those texels read as white sparkle. The drums were still the widest point, so the covers sat outside the slab. Louvers and the door cut were in the mesh and still easy to miss at sheet size. POLICE reads on the flank.

IoU, measured after the sheet: side 0.882, front 0.813, top 0.890. Top is the reconstruction. Side stays above 0.85. Front stays above 0.80. The front trace is a perspective estimate and is narrower than the 2.32 m model.
