# Smoke and steam: what actually reads as real

Notes from three.js Discourse, the official volume examples, Codrops, Shadertoy, SIGGRAPH and GDC talks, Stack Overflow, Reddit, and a search of recent posts on X. Written before the lit-shell prototype. No shader or texture from these sources is copied into the city.

The night exposure here is about 0.043. An 18-nit window is already bright. Smoke has to be a few nits of grey with a dark side, or it becomes a lamp. A software WebGL path (SwiftShader in the stills) also cannot host a 12-step march with two noise octaves, and it cannot repeat the clustered-light loop on every sample.

## Top tips

1. **Smoke is a participating medium, not a light.** Integrate transmittance (Beer–Lambert). Premultiplied or normal blending. Additive blending is for the flame, not the body.
2. **Density has to be empty in places.** Several octaves of FBM, or a low-frequency shape eroded by a second noise, so the silhouette is shredded. A smooth filled cone saturates along the view and becomes a spotlight.
3. **One side is darker.** Sample density toward the light (a short shadow march, a density gradient, or a baked normal / six-way map). A flat grey card reads as paper. A uniformly bright volume reads as a beam.
4. **Keep the optical path short.** Sky clouds can be a slab the camera looks *at*. A plume the camera looks *up* needs a shell, a veil, or many thin particles. A kilometre of constant density along the ray goes opaque.
5. **Soften the contact.** Fade alpha by the gap between the sprite and the scene depth (NVIDIA soft particles). A hard cut on asphalt or a gantry is the usual tell.
6. **Move it with a divergence-free field.** Curl noise rolls a wisp. A constant upward scroll only stretches it. Wind is a target velocity, clamped, not an unbounded push.
7. **Spend samples where the camera is.** Horizon drops detail with distance. Wronski jitters a coarse grid and reprojects history. Neither is free: a history buffer is another target, and jitter on a huge step becomes static.
8. **Local steam is a soft sprite. A hero cloud is a march.** Games do not raymarch a manhole. They also do not paint a rocket plume as one unlit quad.

## What makes it read as real

- **Scale.** A manhole wisp is about person height and a couple of metres wide. A launch sheath belongs with the street (the LAX street is 60 m), and it is wider than the flame. A stack is a column, not a ball.
- **Translucency with structure.** The street, the flame, or the sky has to survive in the holes. The clumps are darker than the thin edges (absorption), and the side facing the key is lighter.
- **A warm core that is not the smoke.** Fire is the ribbon or the flare. Smoke near it picks up 1800 K only on the inner, lower scraps. The crown stays ash.
- **Contact and lean.** Steam meets the grate and then leans with the weather wind. It does not hover as a disc, and it does not run away from the mouth.
- **Motion you can believe in one frame.** Even a still needs rolls, a torn edge, and a direction. A perfect ellipse has nowhere to be “going”.

## Common mistakes

- **A cone that is a spotlight.** Filled density, high extinction, camera looking up the bore. The ray’s optical depth hits 1 and the pixel is the smoke colour with no background. Horizon, iq’s cloud shaders, and the three.js volume examples all break the shape up and keep per-step opacity small for this reason. Our own cylinder march did this on the burn camera: a smooth grey beam, then a hollow shell that became a white bulb plus a beam.
- **Glowing steam.** Additive blending, or multiplying unlit smoke by an exposure lift meant for glare sprites. Coffee-smoke writeups call this out directly: normal blending, grey rather than white. MasterAllArts: additive “looks like steam in front of a torch”. Our film note said the same thing about `authoredLiftU`.
- **Hard sprite edges.** No depth fade. NVIDIA’s 2007 paper is the usual fix. three.js added a `softParticles()` helper for the same artifact.
- **A stamp.** One octave, or a painted radial gradient, with no shadow side. Overlapping those still looks like cards.
- **A fog wall.** A sheet a few metres wide, a few metres from the lens, covers the frame. Street steam has to stay local.
- **White exhaust.** A long bright wake on a wet road reads as a headlight. Soot is darker than steam, and the puff sits just behind the pipe.
- **Jitter as a substitute for samples.** Offsetting each ray by most of a long step turns the plume into screen-space static. Blue noise plus a temporal resolve is the version that works, and only when the step is already small.
- **A nested light loop inside the march.** Reddit’s participating-media thread and our own WebGL2 compile say the same thing: the shader gets too big. One in-scatter for the whole ray, or a density gradient, is the cheap shadow.
- **Sorting every puff as its own object.** WestLangley on Stack Overflow: transparent systems do not share a sort, `depthWrite` should stay off, and additive fire can skip the sort entirely. Smoke should not.

## Sources

### three.js Discourse, the examples, Stack Overflow

- [Efficient volumetric clouds](https://discourse.threejs.org/t/efficient-volumetric-clouds/66067). Raymarch, Perlin–Worley in a tileable 3D texture, extra octaves by sampling that texture at other frequencies, fewer octaves in the distance, blue-noise jitter, temporal accumulation. The author warns that reprojection is easy on hard surfaces and poor on a moving cloud.
- [Volumetric clouds, game ready](https://discourse.threejs.org/t/volumetric-clouds-game-ready/86598). Bake FBM into a 3D texture, march, stop at the scene depth, then a separate occlusion pass for god rays. A reply asks why the result stays grainy and unshaded: without a light-side and a shadow-side, a noise ball is not a cloud.
- [Depth in the ray-march cloud example](https://discourse.threejs.org/t/getting-the-correct-depth-in-ray-march-cloud-example/64037). The official cloud shader is described as artistic, not a production cloud. Stop the march at opaque depth. The volume box is double-sided, depth test and frustum cull off, or the camera-inside-the-box case breaks.
- [Soft particles on points](https://discourse.threejs.org/t/points-transparent-textures-depth-artifacts-soft-particles/5927). Scene depth, then fade. `DepthTexture` rather than a second beauty pass.
- Official examples: [webgl_volume_cloud](https://threejs.org/examples/webgl_volume_cloud.html), [webgpu_volume_cloud](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_volume_cloud.html), [webgpu_volume_perlin](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_volume_perlin.html). A 3D texture, on the order of 100 steps, front-to-back composite, and a two-tap density gradient for shading (`sample(p−ε) − sample(p+ε)`). Opacity per step stays small and the march bails out near alpha 0.95. That step count is a desktop GPU demo, not a phone tier and not SwiftShader.
- [three.js PR 33887, `softParticles()`](https://github.com/mrdoob/three.js/pull/33887). TSL helper from the NVIDIA soft-particle paper, demonstrated with smoke sprites. Sharp intersections are the bug it names.
- Stack Overflow: [smoke with ShaderParticleEngine, normal blending, dark grey](https://stackoverflow.com/questions/32858852/three-js-how-to-create-smoke-with-three-js); [points rising in a cone](https://stackoverflow.com/questions/56290889/three-js-using-points-to-make-smoke-effect); [fire and smoke sorting](https://stackoverflow.com/questions/22901015/three-js-transparency-errors-with-multiple-particle-systems-sorting) (WestLangley: try `depthWrite: false`, do not depend on a global particle sort); [camera inside a volume box](https://stackoverflow.com/questions/76251531/how-to-fly-through-volumetric-cloud).

### Codrops and the coffee-smoke lesson

Codrops does not have a production smoke tutorial. The closest piece is [a procedural vortex in TSL](https://tympanus.net/codrops/2025/03/10/rendering-a-procedural-vortex-inside-a-glass-sphere-with-three-js-and-tsl/) (FBM, then particles inside glass). The lesson people actually ship for a wisp is the coffee column: one tall plane, FBM scrolling upward, a rise mask, a column mask, **normal blending**. Writeups: [Brad Woods, shaders 103](https://garden.bradwoods.io/notes/javascript/three-js/shaders/shaders-103-smoke), [MasterAllArts, coffee smoke](https://masterallarts.com/learn/threejs-from-zero/s0-08-coffee-smoke/). Both say the same three things: twist or scroll so it is not a flat sheet, fade the top and the sides, and do not add the smoke onto the picture. [Envato’s Stam fluid tutorial](https://code.tutsplus.com/how-to-write-a-smoke-shader--cms-25587t) is the other Codrops-adjacent path: ping-pong render targets and an upward diffusion. It is a 2D sim, not a city plume, and it costs two targets.

### Shadertoy

- [Clouds, iq](https://www.shadertoy.com/view/XslGRr). FBM density in a slab, marched, with a light sample. This is the shader Maxime Heckel and half the Discourse threads start from.
- [Perlin–Worley](https://www.shadertoy.com/view/3dVXDc). The noise the Horizon writeups and the Discourse cloud thread tell you to bake.
- [Volumetric plasma / flame, iq](https://www.shadertoy.com/view/MsXGRf). Many octaves, density shaped into a rising flame, colour from the density rather than a flat tint. A Godot port spells out the idea: five octaves, then a clamp into a column.
- [Maxime Heckel, real-time cloudscapes](https://blog.maximeheckel.com/posts/real-time-cloudscapes-with-volumetric-raymarching/). Walks through iq, al-ro’s Starry Night, and Suyoku’s volumetric sample. The lighting section is the useful part: a density difference along the light (iq’s directional derivative) plus a Henyey–Greenstein phase. He also drops octaves when the frame rate dies.

### SIGGRAPH and GDC

- Schneider and Vos, [The Real-time Volumetric Cloudscapes of Horizon Zero Dawn](https://www.advances.realtimerendering.com/s2015/The%20Real-time%20Volumetric%20Cloudscapes%20of%20Horizon%20-%20Zero%20Dawn%20-%20ARTR.pdf), SIGGRAPH 2015. Two detail levels (base shape, then erosion), Perlin–Worley, 2D curl for turbulence, density presets over height, wind along a direction. The talk is frank that a naive march is too many texture reads and nested loops. Their budget was about 2 ms on a console, which we do not have.
- Schneider, [Nubis](https://www.guerrilla-games.com/read/nubis-authoring-real-time-volumetric-cloudscapes-with-the-decima-engine), SIGGRAPH 2017, and the later GDC follow-up on storms and temporal upscaling ([notes](https://www.schneidervfx.com/andrew-schneider-real-time-volumetrics-and-vfx)). Same modeling idea, plus a fix for clouds that move too fast for a naive temporal resolve.
- Wronski, [Volumetric Fog](https://advances.realtimerendering.com/s2014/wronski/bwronski_volumetric_fog_siggraph2014.pdf), SIGGRAPH 2014, later the GPU Pro 360 chapter. One froxel grid for fog, smoke, and shafts, shadowed, then temporal jitter and 3D reprojection. He notes reprojection is easier in 3D than in 2D, and that a strongly view-dependent phase still ghosts. We are not adding that history target for a prototype.
- [NVIDIA soft particles](https://developer.download.nvidia.com/whitepapers/2007/SDK10/SoftParticles_hi.pdf), SDK 10 (2007). The depth fade.
- [NVIDIA smoke particles](https://developer.download.nvidia.com/compute/DevZone/C/html_x64/5_Simulations/smokeParticles/doc/smokeParticles.pdf). Half-angle slicing so a particle batch can accumulate a self-shadow while it draws. The paper’s point: a normal map on a sprite is not enough once the puff is dense; the shadow is the density cue.
- Bridson, Hourihan, Nordenstam, [Curl-Noise for Procedural Fluid Flow](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph2007-curlnoise.pdf), SIGGRAPH 2007. Curl of a potential has no sinks, so debris and smoke roll. Several octaves, smaller ones weaker, match a turbulence spectrum.
- [Unity 6-way lighting](https://unity.com/blog/engine-platform/realistic-smoke-with-6-way-lighting-in-vfx-graph). Flipbooks with light response from six directions, plus soft particles. Normal maps light the surface; six-way maps add internal shadow and a rim when the light is behind the puff. This is the current game-industry answer for exhaust, stacks, and vents. It wants baked frames. We will not download those, and we will not check a painted atlas in beside a KTX2.
- Larsson, [Interactive Real-Time Smoke Rendering](https://www.cse.chalmers.se/~uffe/xjobb/Robert%20Larsson-Interactive%20Real-Time%20Smoke%20Rendering.pdf). Three methods tried. Soft particles were the one that shipped. A full volumetric light was more convincing and too unstable.

### Reddit and X

- [r/GraphicsProgramming, lighting impostors](https://www.reddit.com/r/GraphicsProgramming/comments/m0mfar/realistic_lighting_for_impostors/). Albedo plus a normal is the minimum so a billboard can take a light. A baked occlusion channel is the cheap self-shadow. A GDC particle-lighting deck (HL2 basis or a billboard normal) is what people point at.
- [r/GraphicsProgramming, participating media](https://www.reddit.com/r/GraphicsProgramming/comments/1sfegr4/participating_media_volume_scattering_in_my_cuda/). Beer–Lambert for the optical depth, a phase function for the lobe. A reply from someone marching volumes: nested light loops blow the shader. That matches our WebGL2 limit of one in-scatter per ray.
- [r/GraphicsProgramming, raymarched fluid](https://www.reddit.com/r/GraphicsProgramming/comments/1tvs3x0/fluid_simulation_with_ray_marching_rendering/). The comments treat a full particle-SDF march as something you watch in a video, not something you run. One person tried it and called it unusably slow.
- X, 12 recent posts matching three.js or Shadertoy with smoke, steam, or a volumetric shader (12 October 2026, about $0.16). Almost all of them are generated-demo prompts, not technique notes. Two are worth a line: [@kylezantos](https://x.com/kylezantos/status/2103182142255829154) said a shipped scene was three.js with a hand-written volumetric beam, and [@Conor_D_Dart](https://x.com/Conor_D_Dart/status/2100150721429561441) said clouds in a locked-down page had to be written by hand because the build had no addons. Nobody in that page recommended a specific smoke method. Treat X as a miss for this question, not as a vote.

## What we should build

Original code only. Procedural value noise, not a downloaded flipbook and not an iq shader pasted into TSL. No new punctual lights. No second exposure. Flags stay off until an effect scores 7 or better with the film, realism, and technical critics.

| Effect | Approach | Why this one |
| --- | --- | --- |
| Launch | **Lit soft shells.** A few tall curtains around the flame, street-width, cylindrical billboards (they stay vertical while the camera looks up). Three-octave FBM, curl scroll, density-gradient shade, premultiplied ash, 1800 K only on the lower inner scraps. | A Horizon march is the right tool for a cloud you look *at*, with dozens of steps and a shadow march. The burn camera looks *up* the plume, and a filled march becomes a spotlight. Shells keep the optical path to one thin layer per curtain. The flame ribbon stays the hot core. |
| Street vent and manhole | **The same shell shader, full billboard, person scale.** Two to four stacked puffs on the grate, depth fade, grey under window brightness, lean with the clamped wind. | Discourse, Stack Overflow, NVIDIA, and the coffee-smoke lessons all ship local steam this way. A box march is either a fog wall or a puff the full frame does not notice. |
| Exhaust | **One soft shell per tailpipe,** just behind and above the bumper, short, soot-grey, no long beam. | Six-way flipbooks are what Unity and the NVIDIA particle paper recommend, and they need baked frames. A procedural shell is that idea without the asset. A tube volume read as lamps. |
| Stack | **A scrolled FBM column (the coffee ribbon) plus two or three shells,** soot, heat only at the mouth, wind as a clamped target near the flare. | The column wants a continuous silhouette. Shells supply the billow the ribbon cannot. Cards already failed as a bead string up the gantry. |

Vent, roof, stall, and barrel stay off. They are the manhole shader or the stack shader later, only if those two prove out.

**Prototype for this pass:** lit soft shells, launch and manhole only. Exhaust and the stack wait. The city flags stay off while the stills are shot; a `smoke=shell` query builds the mesh for the capture and does not turn the effect on for a normal load.
