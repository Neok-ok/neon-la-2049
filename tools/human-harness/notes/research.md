# Crowd rendering notes

These are the methods that shaped the harness, and the original code that
implements them. Nothing here is copied from a sample, and no mesh was downloaded.

## Skinned instancing

Bryan Dudash, “Animated Crowd Rendering”, *GPU Gems 3*, chapter 2
(Addison-Wesley, 2008). https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-2-animated-crowd-rendering

Dudash stores every animation frame’s bone matrices in one texture and fetches
them in the vertex shader, so thousands of instances can sit on different frames
of different clips in a single draw. The chapter uses `SV_InstanceID` and
`Texture.Load`. This project does the same job with WebGL2 / WebGPU instancing:

- One `InstancedMesh` named `crowd`. Per-instance attributes carry coat, canopy,
  motion, outfit, height, stride, skin, and clip.
- The palette is `public/models/humans/crowd-palette.bin`: 20 bones × 9 clips ×
  16 frames. Each bone is a 3×4 skin matrix, two floats per texel, each float a
  uint16 split across two UNORM bytes. Range is [−1.5, 2.5] metres.
- The fetch is three.js r186 `textureLoad`, which is a texel fetch
  (`TextureNode.setSampler(false)`), not a filtered sample. `DataTexture`
  `flipY` is off and the color space is linear, so row 0 is clip 0 frame 0.
- The shader blends the two surrounding frames. Hidden outfit parts collapse
  after the skin, so a hood that is off does not leave a skinned ghost.

A vertex animation texture (SideFX Labs VAT, and the Unreal ISM path described
at https://www.sidefx.com/docs/houdini/nodes/out/labs--vertex_animation_textures-3.0.html)
bakes a position per vertex per frame. That fits cloth that is not a skeleton.
This body is a skeleton: 20 bones × 16 × 9 × 12 floats is about 69 KB. The high
mesh is 1,084 triangles; a VAT of those vertices would be several times larger
and would still need a second texture when the LOD changes. The palette is
shared by low, medium, and high.

## Skin

The city at night has no sun (`sun.intensity` is 0, the hemisphere is about
0.55). A Lambert-only standard material would drop the coats into the fog.
The material keeps one draw and adds three terms:

- Emissive form light, `albedo * (0.34 + 0.28 * night)`, so the silhouette
  stays readable the way the old unlit crowd was.
- Wrap lighting on skin only. The wrap term is the Half-Life 2 form
  `(N·L + w) / (1 + w)`, used by Valve for soft cloth and skin. It is applied
  to a fixed neon-street light, not to a shadow map.
- A view-opposed scatter on skin only, following Barré-Brisebois and Bouchard,
  “Approximating Translucency for a Fast, Cheap and Convincing Subsurface
  Scattering Look”, GDC 2011
  (https://colinbarrebrisebois.com/2011/03/07/gdc-2011-approximating-translucency-for-a-fast-cheap-and-convincing-subsurface-scattering-look/).
  Their thickness map is an offline inverted AO. Here the head and hands are
  small and blank, so thickness is a constant 0.45 and the scatter color is a
  warm multiple of the three shadowed skin tones. There is no face texture.

Penner’s pre-integrated skin LUT (SIGGRAPH 2011) needs a curvature texture and
a dedicated light. It does not pay for itself on a coated extra in a night
crowd, so it was not built.

Cloth uses the atlas as a weave/grain multiply around 1, then the instance coat
color. Wetness darkens cloth to about 0.62 and drops roughness. The umbrella
shaft stays the emissive `(1.00, 0.74, 0.38)`.

## LOD and impostors

Dudash also switches mesh pieces by distance on the CPU. This game already
buckets the whole crowd by quality tier (low 56 / 48 m, medium 160 / 64 m,
high 340 / 78 m, ultra 680 / 88 m). Ultra and high share the high mesh, the
same way the spinner does. Animation reach is 0 / 28 / 48 / 72 m. Past that,
and on low, the pose is the bind stand. People are not spawned out to 200 m.

Impostors (Millán, Hernández, Rudomín, “Impostors and pseudo-instancing for
GPU crowd rendering”, GRAPHITE 2006, https://dl.acm.org/doi/10.1145/1174429.1174436)
replace a far character with a camera-facing card. `sheets/crowd-impostor-200m.png`
is that card, rendered in the harness. It is not drawn in the game. A card at
200 m would put people where the crowd radius has already ended.

The dancer is the other LOD. Far and low sample a mask built from the low mesh
(`dancer-mask.png`) inside the existing hologram quad, letterboxed so the 24 m
Hollywood panel does not stretch the 15 m figure. The nearest dancer, on
medium and above, inside about 24 m, is one extra mesh draw. Ghost slices stay
on the quad.
