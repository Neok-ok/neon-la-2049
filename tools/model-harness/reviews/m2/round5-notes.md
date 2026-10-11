# Round 5 builder notes

Not the official score. The drums are set into the slab (the cover is no longer the widest station), the shoulder is flared toward the drum, the door cut is a diagonal satin lip, and the rear louvers are deeper. The grade normalises ambient occlusion and lifts edges with a blur, so a single texel cannot spark. Rain streaks stay in the flank shader. A cheek that bridged the drum was removed before this sheet: it cut through the cover. 5856 tris. Box still 5.45 × 2.32 × 1.36 m.

The silhouette pass hides lamp meshes. A rocker strip under the belly was drawing a line the trace does not have.

IoU: side 0.861, front 0.865, top 0.872. Side is back above 0.85 after the lamp meshes were left out of the mask. Front rose because the shoulder fills the gap the trace had beside the drums. Top is the reconstruction, not a photograph.
