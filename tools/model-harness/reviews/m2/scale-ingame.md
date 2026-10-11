# In-game scale, round 6

The player spinner is the round-6 mesh (`public/models/spinner/`). Traffic still uses the old shell. These numbers are from the parked car on Broadway in historic-core, with the car dropped onto the ground.

Car axes come from the mesh in the spinner's local frame. At the street park the heading is π, so the world-axis box matches. At the doorway the car is yawed: the world-axis width there is 5.45 m, which is the long axis, and the car width stays 2.32 m.

| Check | Metres | Ratio |
|---|---|---|
| Spinner, car axes | 5.450 × 2.320 × 1.360 | |
| Nearest pedestrian | head 1.800, instance scale 1.0, 8.0 m away | height / person = 0.756 |
| Length vs that person | | 5.450 / 1.800 = 3.03 |
| Broadway right-of-way | 18 (`STREET` in historic-core) | width / street = 0.129 |
| Driving line | 3.15 off the street centre | opposing lines are 6.30 apart |
| Harness lane | 3.70 | width / lane = 0.627 |
| Harness figure | 1.75 | height / figure = 0.777 |
| Panel window cell beside the street park | 3.9 (style 17, `CELL_H`) | height / cell = 0.349 |
| Ground podium near the street park | 3.5 | height / podium = 0.389 |
| Bradbury masonry | 22.4 over 5 storeys = 4.48 | height / storey = 0.304 |
| Harness doorway | 2.00 | height / door = 0.680 |
| Bradbury street opening | 4.8 wide × 7.2 tall | height / opening = 0.189 |

The 5.45 m length against a 1.80 m person is the ~5.5 m car vs ~1.75 m people check. The roof at 1.36 m sits under the 1.80 m head, which is what the street frames show. The harness lane of 3.70 m is the 3.5–3.7 m lane check: the car takes 63% of it. Broadway itself is an 18 m right-of-way, and the 3.15 m figure is the driving line, not a painted lane.

The panel window cell (3.9 m) and the 3.5 m podium sit in the 3–4 m storey band. Bradbury's masonry storey (4.48 m) and its masonry window cell (4.8 m) sit a little above that band.

Frames: `desktop-ultra-scale-people`, `desktop-ultra-scale-lane`, `desktop-ultra-scale-facade`, `desktop-ultra-scale-door`, and `desktop-medium-scale-people` (lod medium). Ultra street shots use lod high.
