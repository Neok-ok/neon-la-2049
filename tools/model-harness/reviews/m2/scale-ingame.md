# In-game scale, round 10

The player spinner is the round-10 mesh (`public/models/spinner/`). Traffic still uses the old shell. These numbers are from the parked car on Broadway in historic-core, after the rebase onto the street-scale pass, with the car dropped onto the ground.

Car axes come from the mesh in the spinner's local frame. At the street park the heading is π, so the world-axis box matches. At the doorway the car is yawed: the world-axis box there is the long axis turned across the street, and the car axes stay 5.45 × 2.32 × 1.36 m.

| Check | Metres | Ratio |
|---|---|---|
| Spinner, car axes | 5.450 × 2.320 × 1.360 | |
| Nearest pedestrian | head 1.800, instance scale 1.0, 8.04 m away | height / person = 0.756 |
| Length vs that person | | 5.450 / 1.800 = 3.03 |
| Broadway right-of-way | 18 (`STREET` in historic-core) | width / street = 0.129 |
| Driving line | 3.15 off the street centre | opposing lines are 6.30 apart |
| Harness lane | 3.70 | width / lane = 0.627 |
| Harness figure | 1.75 | height / figure = 0.777 |
| Bradbury masonry | 22.4 over 7 storeys of 3.2 | height / storey = 0.425 |
| Harness doorway | 2.00 | height / door = 0.680 |
| Bradbury street leaf | 2.2 wide × 2.2 tall | height / leaf = 0.618 |
| Bradbury door frame | 3.2 wide × 3.6 tall | height / frame = 0.378 |

The 5.45 m length against a 1.80 m person is the ~5.5 m car vs ~1.8 m people check. The roof at 1.36 m sits under the 1.80 m head. The harness lane of 3.70 m is the 3.5–3.7 m lane check: the car takes 63% of it. Broadway itself is an 18 m right-of-way, and the 3.15 m figure is the driving line, not a painted lane.

The Bradbury street opening is a 2.2 m leaf inside a 3.2 × 3.6 m frame. The masonry front is 22.4 m, seven storeys of 3.2 m.

Frames: `desktop-ultra-scale-people`, `desktop-ultra-scale-lane`, `desktop-ultra-scale-facade`, `desktop-ultra-scale-door`, and the earlier `desktop-medium-scale-people` (lod medium, taken before the crowd had settled on this street). Ultra street shots use lod high.
