# Human harness

Parametric pedestrians and the Veil House dancer. Blender exports the mesh,
gltfpack compresses it, and the game skins one instanced crowd from a bone palette.

```bash
python3 tools/human-harness/build.py
python3 tools/human-harness/render_views.py
```

`build.py` writes `public/models/humans/` (glTF, palette, atlas, dancer mask)
and `sheets/scores.json` plus the silhouette overlays. `render_views.py` writes
the turntables, the walk strip, and the 200 m impostor card. That card is not
drawn in the game. Crowd radius tops out at 88 m.

Reference photos stay in `tools/human-harness/reference/` and are gitignored.
The plates in `docs/models/pedestrians/` and `docs/models/dancer/` are the
outline the IoU score uses. Notes on the methods and the body ratios are in
`notes/`.

The game keeps the crowd as one `InstancedMesh` named `crowd`. Low, medium, and
high are separate files. Ultra uses the high file. Until a file loads, the
previous box people stay up so a missing asset does not empty the street.
