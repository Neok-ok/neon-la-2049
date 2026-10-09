# Neon LA 2049 — World Bible

The reference every stage builds against: what the Los Angeles of *Blade Runner 2049* looks like, how big
things are, where they are, and how to invent the parts the films never showed. Engine data lives in
[`src/data/city-layout.json`](../src/data/city-layout.json); the maps [`map.svg`](map.svg) and
[`map-downtown.svg`](map-downtown.svg) are generated from it (`npm run map`). **If this document and the JSON
disagree, fix one of them in the same PR.**

> Fan project. Not affiliated with Alcon, Warner Bros., Sony or the filmmakers. Everything in the repo is
> original: no film footage, frames, models, textures, logos or trademarked brand art. Signage is generic
> glyph blocks and invented names (see [§11](#11-asset--ip-policy)).

---

## 1. Canon hierarchy

When sources disagree, the higher one wins:

1. **What is on screen in *Blade Runner 2049* (2017).** Look, scale cues, weather, signage density.
2. **What is on screen in *Blade Runner* (1982, set in 2019).** The city's "DNA": Hades landscape, spinners, street markets.
3. **The canonical shorts:** *Black Out 2022* (anime, Shinichirō Watanabe), *2036: Nexus Dawn*, *2048: Nowhere to Run* (Luke Scott).
4. **Production statements:** interviews with production designer Dennis Gassner, DP Roger Deakins, VFX supervisors
   (Double Negative, Framestore, MPC), Weta Workshop's miniature ("bigature") work, *The Art and Soul of Blade Runner 2049* (Tanya Lapointe).
5. **Fan reference compilations** (Blade Runner wiki, forum frame analyses). Used for names and placement hints, never over 1–4.
6. **Our inference**, always flagged as *invented* in the JSON `confidence` field and in this document.

## 2. Timeline facts that shape the city

| Year | Event (source) | What it means for the map |
|---|---|---|
| 2019 | *Blade Runner*: Tyrell Corporation, refinery flare stacks ("Hades landscape"), constant rain, spinners, Off-World adverts. | Industrial flames on the southern horizon; vertical traffic; ad blimps/holograms. |
| 2022 | *Black Out 2022*: an EMP detonation over LA wipes most digital records; replicants are blamed. | Paper/analogue texture in the city; distrust; a "patched-together" infrastructure look. |
| 2023–2025 | Replicant prohibition; ecological collapse; Niander Wallace's synthetic farming ends famine (*2049* opening crawl / *2036*). | No trees, no green; giant protein farms outside the city; Wallace becomes the dominant corporation. |
| ~2020s–2040s | The Pacific rises; the **Sepulveda Sea Wall** holds it back (on screen in *2049*; name from the film's script/credits and wiki). | A continuous wall along the coast; the old beaches are underwater. |
| 2036 | *2036: Nexus Dawn*: Wallace's Nexus-9 approved. | Wallace architecture: monumental, minimal, pyramidal. |
| 2048–2049 | *2048* and *2049*: LAPD, K's megablock, markets, Wallace HQ, sea wall, snow. | The stage we are recreating. |

## 3. Geography and coordinates

* Real LA geography is the base map. Engine units are **metres**. Origin `(0,0,0)` = **34.0522 N, 118.2437 W**
  (Civic Center/Pershing Sq.). `+X` east, `+Z` south, `+Y` up.
* Projection (equirectangular, accurate to <0.5% across the playable area):
  `x = (lon + 118.2437) · 111320 · cos(34.0522°)`, `z = (34.0522 − lat) · 110574`. Code: [`src/world/geo.ts`](../src/world/geo.ts).
* **Playable bounds:** 34.16 N – 33.68 N, 118.60 W – 118.05 W (≈ 50 × 53 km). Santa Monica Mountains to Long Beach, Pacific to Montebello.
* The basin floor is flattened to `y = 0` (real downtown is ~90 m above sea level; Santa Monica ~30 m). Hills are gaussian bumps
  (Santa Monica Mtns 420–460 m, Hollywood Hills 380 m, Griffith 330 m, Palos Verdes 420 m, Baldwin Hills 150 m, Signal Hill 110 m,
  Elysian 110 m, Montebello 120 m).
* **2049 sea level is +6 m** relative to the basin floor (constant `SEA_LEVEL_2049`). The ocean polygon is the real coastline;
  everything seaward of the sea wall is water.
* Freeways become **open trenches** (70–80 m corridors, nothing built inside) and the LA River a 110 m concrete channel. They are the long
  sightlines the film uses for its spinner shots and keep the grid legible from the air.
* Street grids follow the real ones: downtown rotated **38°** (the historic Spanish-era grid), most of the basin north-aligned,
  the coastal strip at **322°**.

## 4. Human scale and modules

| Thing | Value | Notes |
|---|---|---|
| Eye height (walk mode) | 1.70 m | `HUMAN.eye` |
| Body | 1.80 m tall, 0.32 m radius | collision capsule |
| Walk / run | 1.5 / 4.2 m/s | real human speeds |
| Step-up | 0.45 m | kerbs, stall platforms |
| Floor-to-floor, megablock residential | 3.1–3.6 m | window cell height per style in `cityMaterial.ts` |
| Floor-to-floor, office / civic | 4.0–5.5 m | |
| Market stall | 2.4–4.2 m wide, 2.0 m deep, 2.4–3.4 m tall | Little Tokyo stalls |
| Street lamp | 7.5 m pole, 1.6 m arm, every ~32 m | `_shared/streetLamps.ts` |
| Market lane | 7 m between frontages | Little Tokyo grid |
| Downtown avenue | 34–40 m between megablocks | the film's canyon look |

## 5. Landmarks

Positions are in [`city-layout.json`](../src/data/city-layout.json) (`landmarks`) and drawn to scale on the maps. Dimensions below are what the engine builds.

### 5.1 Wallace Corporation Earth Headquarters — the pyramid
* **Height 3,500 m, base 3,200 m square, top platform 420 m**, seven major tiers of three battered steps each (21 terraces), edge ribs, a crown and ground-level entrance blocks.
* **Stage 3 model** (`src/districts/wallace-vernon/pyramid.ts`, kit `buildPyramid`, `look: 'wallace'`): every step leans back (batter) and carries a dark ledge; every major tier ends in a cornice with a thin warm light strip. Vertical slot channels with fins break the faces. The top two tiers have warm glowing slots, and the apex is a glazed **lantern** (up to 220 m tall) under an overhanging cap with a 110 m mast. That warm interior glow is the only strongly lit part of the pyramid, as in the film's night aerials. The monumental entrance is on the north face, the one turned toward downtown: a tall portal glow between pylons, a lintel and a forecourt plinth. Three LODs (~6.8 k / 2.1 k / 150 triangles) switch at 6 km and 18 km. No logo; the building is a pure form.
* **Stage 7 close range.** The Stage 3 mesh and its far LODs stay. Inside about **1.5 km** of the hull, a second layer adds board-formed bands, panel joints, a drainage channel with a scupper, a maintenance ledge, and a few dim bronze slits at human scale. Only the sectors nearest the camera are built, one per frame, and the central slot plus the portal mouth are left bare. Warm light stays on the apex and the top two tiers. `confidence: invented` — the film aerials are a monolith; the joints are what board-formed concrete shows at arm's length, and the slits are the only human-scale light the district row allows on the stone.
* **Stage 7 forecourt.** North of the portal: a **30 m** walled causeway, an open stone court, eight risers of **0.375 m** onto the Stage 3 plinth (3 m), a security line with a walk-through gap, and a human door in front of the still-sealed portal glow. Puddles are the shared wet-street pools, tinted amber. Four ground haulers loop the causeway. The district polygon's north edge at this longitude cuts the Stage 3 plinth, so the causeway and the north half of the court sit in the **2,400 m** reserve rather than in fabric. `confidence: invented` — the film shows a monumental approach and a sealed face; the stair module is under the §4 step-up so walk mode can climb it. See [§7.8](#78-wallace-precinct-stage-7).
* **Evidence:** Weta Workshop built the Wallace HQ as a large-scale miniature for the film's aerial establishing shots. The figure
  quoted alongside that work is roughly **3.5 km** of represented height. Dennis Gassner has described the Wallace buildings as
  monumental pyramids that dwarf the city, with "hundreds" of storeys. At ~300 storeys that gives ~11.7 m "mega-storeys", consistent with the
  interiors (Wallace's atrium, the water-lit office). The film's aerials show it as by far the tallest thing on the horizon.
* **Location (inferred, medium-low confidence):** 34.005 N, 118.200 W, in **Vernon / the industrial flats south-east of downtown**.
  Reasoning: in the film it rises out of flat industrial land with no hills behind it, is reached from downtown by a short spinner
  flight, and lore places Wallace manufacturing in the industrial sectors. Vernon is LA's real industrial city, 5–7 km from LAPD.
  From downtown it fills the south-eastern sky, which matches the look of the establishing shots.
* **Three satellite towers** (1,100–1,400 m, 300–360 m bases) are **invented**, following the film's composition of
  smaller Wallace structures around the main mass. Stage 7 rebuilds them in the megatower kit as battered monoliths (slot, warm crown, a mast that stays inside the published height, aviation lights). Placements are unchanged. See §5.3.

### 5.2 LAPD Headquarters (2049)
* **216 m tall**, 72 × 100 m shaft, inverted-pyramid crown 132 × 165 m and 62 m deep, landing pads on top, police beacons.
* **Evidence:** the building is a Weta miniature too. Scaling the ~4.5 m model at 1:48 gives ~216 m. On screen it stands well above the
  surrounding megablocks but nowhere near Wallace.
* **Location:** the **real LAPD headquarters site, 100 W 1st St** (34.0519 N, 118.2445 W), rotated to the downtown grid (38°).
  The film's LAPD sits in the Civic Center, which is where the real one is. Local −Z of that bearing points at City Hall, so the
  stair and the lobby are on that face and the two buildings look at each other.
* **Stage 5 model** (`src/districts/civic-center/hq.ts`). Podium **86 × 118 × 18 m**. A **30 m** stair, 32 risers of about 0.16 m, climbs from the forecourt to a floor at **5.2 m**. The lobby is a **17 m** recess under the shaft (ceiling 12.4 m): wings, a rear wall, a desk, six columns, two barriers and a directory. You can walk in. It is a soffit in the street mesh, the same idea as the noodle bar, not a separate interior. Four **22 m** pads sit on the crown; spinners hover at **222.5 m** (about 6 m over the pad, clear of the 3.5 m lane pad). A 6 m mast stands at the centre. `confidence: invented` for the stair, the lobby plan, the pad positions and the cold light bands.
* Lettering: a generic white glow band, plus the atlas phrase **SECTOR 5** over the door and inside. **No real LAPD insignia, no department wordmark, no film logo.**
* LODs switch at 520 m and 1.9 km before the tier's `landmarkLod` scale. Colliders always come from the detail-2 build, so the stair and the lobby stay walkable when the mesh simplifies.

### 5.3 Other landmarks
| Id | What | Size | Location and reasoning | Confidence |
|---|---|---|---|---|
| `city-hall` | Old City Hall, kept and re-clad (Stage 5) | **138 m** to the lamp. Dark jacketed base **92 × 62 × 28 m**, pale shaft **34 m** square to 100 m, neck **26 m** to 114 m, pyramid to 132 m, warm lamp to 138 m. Ceremonial stair on the face toward LAPD. | Real building (1928, 138 m) at **200 N Spring St** (34.0537 N, 118.2427 W). Survival to 2049 is assumed, as the Bradbury survived in 2019. The massing is a homage, not a traced 1928 ornament, and there is no seal. The year band is the atlas cell "2049". `confidence: invented` for the jacket, the stair and the lamp; the place and the height are the real building. | medium (place, height); invented (cladding) |
| `bradbury-building` | Bradbury Building exterior and court (Stage 6, interior X3) | Masonry front **38 × 48 × 22.4 m** (five storeys). Court **14 × 14 m** behind an **8 × 4.8 × 7.2 m** entrance. Galleries at 4.4 / 8.8 / 13.2 / 17.6 m, reached by one masonry switchback (riser about 0.37 m). A service corridor and room sit in the back wing. Panel jacket on the back and the south side to **27 m**. | Real building at **304 S Broadway** (3rd & Broadway). The landmark centre is the depth behind the east façade (34.050468 N, 118.247755 W). The Wikipedia pin sits on the façade, not the centre. Width and the court are reasoned from the lot. The iron atrium is not copied. The stair and the service passage are invented. Reserve radius **0**: the archetype leaves a rectangular hole so side bays and the Broadway lane stay. | medium (place); invented (width, court, jacket, stair, service passage) |
| `canyon-bridge` | Veil House footbridge (Stage 6) | Deck at **11.2 m**, **16.4 × 3.6 m**, piers on the sidewalks. Stairs **32 × 0.35 m**. Pink figure **14 × 46 m** (`veil-dancer`). | Invented. The Stage 1 pin sat 11 m off the street one block east of Broadway; the deck is snapped to that centreline (34.047860 N, 118.249688 W). The figure is original. Reserve **0** so cars drive under the deck. | invented |
| `megatower-1…7` | Financial District megastructures (Stage 3) | **520–1,020 m**; shafts 100–170 m × 70–130 m on podiums up to 220 × 150 m. MT-1 1,020 m slab with raking buttresses, hammer crown, landing pads and an 85 m mast; MT-5 880 m twin slab; MT-2 760 m stack; MT-3 660 m stepped; MT-4 600 m cross plan with a lantern crown; MT-7 560 m slab with a cage crown; MT-6 520 m blade | Real Bunker Hill / Financial District sites, rotated to the 38° grid. Heights: the film's downtown aerials show slab-and-buttress masses many times taller than LAPD that rise out of the smog and still sit well below Wallace; see [§7.3](#73-financial-district-megatowers-stage-3) and rule 7. Hologram slots on crowns, shafts and podiums are X4 projectors (`${id}-holo-a`, `-b`, `-crown`, `-gap`). | invented |
| `legacy-tower-1…3` | 2019-era stepped towers | 310–420 m, 58–66 m shafts, ziggurat crowns with flame stacks | Lore: the city of the 1982 film survives under the 2049 megastructures. Their ziggurat tops and rooftop flames are an homage to its skyline, built new. | invented |
| `skybridge-1…4` | Enclosed skybridges between heroes | decks at 336–560 m, 22–28 m wide, 12–16 m deep, spans 150–330 m | Downtown in the film is layered and connected above the street. Decks stay above the 320 m fabric ceiling so background towers never cut through them. | invented |
| `wallace-satellite-a/b/c` | Wallace towers (Stage 7) | **1,400 / 1,250 / 1,100 m**, bases **360 / 330 / 300 m**, tops **60 / 55 / 50 m**. Six battered tiers, a slot on each face, a warm crown, a **36 m** mast inside the published height, red and warm aviation lights. LODs at 2.4 km and 8 km. | A 34.030 N / 118.193 W, B 33.986 N / 118.182 W, C 33.980 N / 118.228 W. All three sit just outside the `wallace-vernon` polygon. `confidence: invented` — the film's composition has smaller masses around the pyramid; the kit is the pyramid's language at those published heights, and the placements were already fixed. | invented |
| `old-pyramid-north`, `old-pyramid-south` | Two 1982-style stepped pyramids | 1,000 m / 860 m, bases 1,180 / 1,080 m, 45° to the grid | The 2049 opening crawl says Wallace bought the remains of the first film's replicant maker. We keep its twin pyramids, dormant, as Wallace holdings in the refinery belt the 1982 film opened over, 3–5 km east of the Wallace pyramid. They are drawn in that film's style (stepped faces, a lit penthouse, flame stacks, a spire) and are unnamed: no Tyrell name or logo. The 1982 production quoted ~700 storeys, but on screen the pyramid reads closer to 1 km, and 1 km keeps it under the Wallace satellites. Stage 7 adds a ring just outside each reserve (tanks, pipe runs, a low wall, a few stacks with steam) and does not rename them. `confidence: invented` for the ring — dormant holdings still need a working apron, and the shared industrial archetype is left for Stage 15. | invented |
| `k-megablock-tower` | K's apartment megabuilding (Stage 8) | **185 m**, **230 × 85 m**. Floor module **3.4 m**. Floor 40 at **136 m** is the apartment. One service shaft on the south-west. Roof pad **16 m**, hover **191 m**. | Centre of the on-screen spinner navigation map when K flies home (fan frame analysis puts it near Woodruff Ave & South St, Lakewood/Bellflower). Size from exterior shots: a long, featureless, many-storey slab with an open market at its feet. The module, the shaft, the pad and the market plan are invented so one interior path fits the envelope. See [§7.7](#77-ks-megablock-stage-8). | medium-low (place, size); invented (floors, shaft, pad, market) |
| `lax-spaceport-towers` | LAX Off-World launch gantries | 3 gantries to 420 m on a 2.6 × 1.3 km apron | Lore: LAX becomes the off-world spaceport. Structures invented. | invented |
| `el-segundo-refinery` | Refinery flare field | stacks to 140 m over 1.6 × 1.1 km | Real El Segundo refinery. Homage to the 1982 "Hades landscape" opening. | medium |

### 5.4 Points of interest (future interiors and set pieces)
| Id | What | Stage |
|---|---|---|
| `noodle-bar` | Noodle-bar counter, enterable | 2 |
| `bibis-bar` | Bar and vending market | 2 |
| `joi-bridge` | Footbridge with the Veil House dancer (original pink figure) | 6 |
| `bradbury` | Bradbury Building, west sidewalk in front of the court | 6 |
| `k-apartment` | K's apartment, enterable (Stage 8, south-west corner of floor 40) | 8 |
| `wallace-approach` | North causeway, inside the pyramid reserve | 7 |
| `wallace-plaza` | On the entrance plinth, facing the sealed portal | 7 |
| `wallace-atrium` | Water-lit room behind the human door | 7 |
| `sea-wall-fight` | Sea-wall finale site | 10 |
| `trash-mesa-gate` | Southern edge toward the San Diego trash mesa (out of bounds, vista only) | — |
| `lapd-steps` | Foot of the LAPD stair, where the walk up to the door starts | 5 |
| `lapd-lobby` | Inside the LAPD recess, on the lobby floor | 5 |
| `lapd-deck` | On the LAPD landing deck, between the plaza-side pads | 5 |
| `city-hall-steps` | City Hall ceremonial stair | 5 |
| `civic-plaza` | The paved mall between LAPD and City Hall | 5 |

## 6. The Sepulveda Sea Wall

* **On screen:** a colossal, battered, stepped concrete wall with the Pacific breaking against its foot. The finale fight takes place
  on the seaward apron at its base, and spinners look tiny against it.
* **Engine profile:** crest **90 m** above the basin, crest width **28 m**, base **120 m**, **6 seaward terraces**, a toe 12 m below the water,
  a landward batter. Southern continuation (Harbor Sea Wall) **75 m / 100 m / 24 m / 5 terraces**.
* **Why 90 m:** in the finale, waves of a few metres hit the toe while the wall rises many spinner-lengths above (>15 × 5 m). It has to
  hold back a sea several metres above old land plus storm surge, and it reads as taller than the surrounding coastal blocks (40–70 m)
  but far below LAPD. Estimate; adjust only together with the coastal stage.
* **Route:** a continuous line just inland of the real coastline, from Pacific Palisades through Santa Monica, Venice, Marina del Rey,
  Playa del Rey and the LAX bluff to Manhattan, Hermosa and Redondo Beach. The harbor wall runs from San Pedro along the Port to Seal Beach.
  Palos Verdes is high ground and needs no wall.
* Waterside: open dark ocean at `y = 6`. Landside: the grey coastal strip (district `coastal-strip`) with low, salt-stained blocks.

## 7. Districts — visual language

All districts are in `city-layout.json` with their polygon, grid, archetype and **stage number** (the roadmap stage that builds them out
in full detail). Heights below are the Stage 1 blockout unless a later subsection replaces them
([§7.1](#71-little-tokyo-night-market-stage-2) through [§7.8](#78-wallace-precinct-stage-7)).

| District (stage) | Lore sector | Palette | Materials | Signage | Typologies | Heights | Streets | Traffic |
|---|---|---|---|---|---|---|---|---|
| **Little Tokyo Night Market** (2) | Sector 5 shopping/bar district | wet black, sodium amber, red/pink/cyan neon, steam white | stained concrete, corrugated metal, plastic sheeting, tarp | **very dense** (blade signs, stall headers, LED strips) | stalls, kiosks, 2–8 storey shophouses, occasional megablock | 7–38 m, a few 55–95 m | 7 m lanes, covered walkways | pedestrians, umbrellas, bikes; spinners overhead |
| **Financial District Megatowers** (3) | Sector 9 | blue-grey, white LED, cyan holograms, red aviation lights | ribbed and board-formed concrete, dark glass, lit window bands | billboards low, giant holograms on crowns and shafts | podium + tower, stepped towers, kit towers, hero megastructures | 90–155 m megablocks, 165–305 m kit towers; heroes 520–1,020 m, legacy 310–420 m | 38 m avenues | spinner layer 175–260 m, sky avenues 430–860 m, holding patterns over the crowns |
| **Downtown Megablocks** (4) | Sector 5/9 fringe | grey-brown, warm windows, pink/cyan ads, amber walkway lips | ribbed, coffered and panelled concrete; cantilevered upper masses | dense at street level, billboards on the shaft | cantilever, slab-on-podium, bar, courtyard; rooftop tanks, masts, pads | 90–250 m, a few kit towers 200–300 m | 34 m, lit decks at 46 / 68 / 92 / 118 m | ground cars on the street graph, low spinners at 74 and 112 m, avenue lanes at 188 / 222 / 250 m |
| **Civic Center** (5) | Sector 5 central | cold grey, white light, police red/blue | monumental concrete; a kept stone tower in a dark jacket | sparse: SECTOR 5 and a year mark, one glyph hologram | colonnade wings, compact slabs, two monuments, a paved mall | fabric 36–122 m, City Hall 138 m, LAPD 216 m | 40 m | police pads on the LAPD roof; the downtown street graph and avenue lanes already cover the polygon |
| **Broadway Neon Canyon** (6) | Sector 9 Retirement Row | magenta, violet, amber neon on black | old masonry under new cladding | **extreme**, vertical blade signs stacked up façades | narrow deep canyon, heritage façades at the base | 40–110 m | 18 m, driving line ±3.15 m | pedestrians, rickshaws; spinners free at 148–260 m |
| **Wallace Precinct (Vernon)** (7) | Sector 4 industrial | black, bronze, amber haze | monolithic stone/concrete, no windows | none (corporate), monumental lighting | pyramid + satellites, factories, tanks | fabric 15–60 m; pyramid 3.5 km | 30 m | freight spinners, convoys |
| **K's Megablock** (8) | residential | grey, sodium amber, sparse neon | stained concrete slabs | market at the base | megablock slabs with a street market at their feet | 60–185 m | 12 m | pedestrians, vendors |
| **Arts District Works** (9) | Sector 4 fringe | rust, sodium, steam | brick, steel, pipework | sparse | warehouses, foundries, stacks | 10–45 m, stacks 70–140 m | 20 m | trucks |
| **Grey Coast** (10) | coastal sectors | desaturated blue-grey, white spray | salt-stained concrete | sparse | low slabs, the sea wall | 15–60 m | 20 m | almost none |
| **Lakewood / Downey Megablocks** (11), **South LA Megablocks** (12) | residential | grey, warm windows | concrete slabs | low | repetitive megablocks, courtyards | 45–130 m | 24–26 m | moderate |
| **Westside Sprawl** (13), **East LA Sprawl** (21) | Sector 2/3 Uptown; eastern sectors | grey with amber light carpets | mixed | low/medium | 3–12 storey blocks, occasional towers | 10–60 m | 16–18 m | light |
| **Basin Sprawl** (14, default) | unnamed sectors | dark with light carpet | mixed | low | low-rise grid | 6–35 m | 16 m | light |
| **SE Refinery Belt** (15), **South Bay Refineries** (18) | Sector 4 industrial | black, flame orange | steel, tanks | none | refineries, flare stacks, tank farms | 10–60 m, stacks to 140 m | 24–26 m | trucks |
| **Hollywood Entertainment Strip** (16) | Sector 1 entertainment | violet, pink, gold | glass, LED | **very dense**, giant animated holograms | arcades, hotels, theatres | 20–120 m | 22 m | dense |
| **LAX Spaceport** (17) | Sector 12 | white floodlight, red beacons | metal, concrete apron | sparse, wayfinding | gantries, hangars, terminal | gantries 420 m | 60 m | launches, cargo |
| **Harbor & Container Port** (19) | Sector 12 docks | sodium, rust, sea fog | steel, containers | sparse | cranes, container stacks, sheds | 10–80 m | 30 m | cargo |
| **Long Beach Secondary Core** (20) | southern sectors | as downtown, dimmer | concrete | medium | megablocks | 60–180 m | 30 m | moderate |

### 7.1 Little Tokyo night market (stage 2)

The market is the reference district. Later districts copy its kit, not its layout.

* **Where.** Real Little Tokyo, downtown grid bearing 38°, blocks 62 × 44 m, **7 m** streets (the lane width in the row above). The polygon is the present-day district pushed a little south and east so it sits under the film's Sector 5 shopping streets, between the Civic Center and the industrial east side. `confidence: invented` for the exact frontage mix; the place and the 7 m lanes are from the film's market streets read against the real grid.
* **Vertical.** Shophouses are **8–18 m** (about 2–5 storeys), a few **22–40 m**. About one block in five grows a **72–112 m** tower out of a corner so the mega-structure reads as rising through the market into the smog, not as a separate campus. Those heights sit inside the district row (7–38 m, a few 55–95 m) with the towers at the top of that band and a little over it where a base has to clear the sign stack. `confidence: invented`, reasoned from the film's market-under-megablock shots.
* **Street section.** Facade, then a **2.6 m** soffit you can walk under, awning out to about **1.6–2.2 m**, stall counters in the street (**1.5 m** deep, **1.1 m** counter), two sidewalk lanes at **2.45 m** and **3.15 m** outside the facade so neighbouring blocks do not both claim the centreline. Curb, bollards, a bin and a vending machine sit on the owned edges only (`a+` and `b+`), which is how the block avoids dressing the same street twice.
* **The noodle bar** (`noodle-bar`, 34.0487 N, 118.2392 W) is a real recess, about **3.4 m** deep: side walls, a solid back wall with a warm backsplash, its own soffit (fabric boxes have no underside), a wood-clad counter at **1.06 m**, stools at **0.75 m**, bowls and two steam pots, a shelf of bottles, noren strips in the doorway, a cook behind the counter, and menu signs facing the street. Eye height seated is **1.15 m**. `E` sits; walking stands you up. There is no sit control on the iPhone joystick yet. **Bibi's** (`bibis-bar`) is the same kit, shallower (**2.5 m**), a walk-up bar rather than a second interior. The names on the signs (NOODLES, HOT BROTH, KASAI, MIDORI, STEAM BAR, and the stroke-glyph lines) are invented. No film logos, no real brands.
* **Light.** Signs are an 8×8 canvas atlas (Latin via `fillText`, kana / hangul / hanzi / devanagari as original strokes). They tint the wet street with instanced additive pools on every tier. A planar mirror (`ReflectorNode`) turns on for high/ultra on a real GPU when you are under 28 m in the market; `?refl=0` forces it off, `?refl=1` forces it on. Software renders (the screenshot VM) stay on the fake pools.
* **People and air.** Instanced coats and lit umbrellas walk the lanes and slow down when the person ahead is inside **0.9 m**. Counts: about **56 / 160 / 340 / 680** on low / medium / high / ultra. Steam cards rise off grates and pots. High and ultra add three haze sheets near the ground. Rain streaks pick up neon while `neonWet` is high.
* **Sound.** Rain on awnings, a murmur, stall sizzle and a distant spinner, all procedural, positional with equal-power panners, mixed into the existing ambience. No music.
* **Holograms.** The lane in front of the noodle bar carries a Coil Vendor and a glyph-loop ad; Bibi's has a lantern loop. They are the shared X4 projectors ([§7.2](#72-holograms-stage-x4)), not painted signs. The corner-tower billboards stay the cheap kind-2 panel.

### 7.2 Holograms (stage X4)

The films are full of giant animated ads. None of those designs are reproduced. The city runs seven invented projector programs (`confidence: invented`). Shapes, names and the houses that own them are original; the only borrowed fact is that night advertising is a volumetric coloured light, not a television bolted to a wall.

| Program | House | Where it stands in this stage | Look |
|---|---|---|---|
| **Ash Crane** | Ash Line, an off-world courier | One figure in the financial avenue (`financial-canyon-crane`), plus some megatower faces and downtown billboards | A geometric crane. The wings beat. Cyan. |
| **Coil Vendor** | Sector 5 night markets | Over the noodle-bar lane (`market-coil`) | Six stacked rings, a round head, arms that sway. Amber. Not a dancer and not a character from either film. |
| **Ribbon Column** | Downtown commercial leases | Megatower faces and the downtown flyover billboards | A bowing stack of ribbons. Violet. |
| **Glyph Loop** | Generic product board | Beside the Coil Vendor, and on megatower faces | Four rows of scrolling blocks. The blocks are noise, not letters and not a logo. |
| **Lease Loop** | Spinner-share desks | Megatower faces | A flying wedge with two pods crossing a barcode. The wedge is not a spinner model. Amber. |
| **Lantern Loop** | Red Lantern (same invented name as the market signs) | Bibi's lane, and some megatower faces | A pulsing lamp and three orbiting motes. Pink. |
| **Veil Dancer** | Veil House, a canyon ad house | The Spring-side footbridge (`joi-bridge-dancer`) | Diamond head with no face, three chevron skirts, one arm up, a long veil. Pink. Not a person from either film. |

* **Placement now.** Each financial megatower registers two panels on the depth faces the blockout already reserved (about 50–90 m tall). A 40 m Ash Crane stands in a gap about 150 m from megatower 1, facing away from the tower so the shaft reads behind it. Two more figures sit on the downtown billboards that face the northwest flyover. Loaded chunks also promote kind-2 signs of at least 140 m²: the flat panel stays, and a figure floats one to three metres in front of it. Market stall headers are smaller than that and stay signs.
* **Light.** A projector spills its colour onto nearby concrete and kit surfaces (the nearest few, wrapped falloff, no shadow map) and, under about 80 m, onto a soft disc on the wet street. Low tier keeps the silhouette and turns the spill off. The wash is invented in extent: roughly half a panel-width, enough to tint a podium or a lane and not a whole block.
* **The pink footbridge** is built (Stage 6). The placement is `joi-bridge-dancer`: design `veil-dancer`, 14 × 46 m, rank 0, tower band, spill 28 m. It uses the same shader. Kind-2 billboards the canyon promotes still pick the older figures (crane, coil, ribbon), not the dancer.

### 7.3 Financial District megatowers (stage 3)

* **The look.** Downtown in *2049* is a field of monumental brutalist slabs: flat-topped, buttressed, banded with thin lines of lit windows, standing out of a brown smog sea with red lights on every edge. The district reproduces that composition with original forms. Nothing here copies a specific building from the film.
* **Three layers.** (1) The street canyon: **90–155 m** megablocks (Ribbon and Megablock façades, slit service cores, rooftop plant, shop signs). (2) **Kit towers** on about half the lots, **165–305 m** with masts, built from the same kit as the heroes in compact form (fewer, larger pieces) so they fit the fabric ceiling of 320 m. (3) **Ten hand-placed heroes** and four skybridges (§5.3), which are landmarks with colliders, LODs and hologram slots.
* **Kit vocabulary** (`src/districts/_shared/megatower/`). A podium with an entrance canopy and a lit lobby band. A shaft broken by **setbacks** at roughly 35–75% of height, with mechanical floors every 90–130 m (dark louvred bands with a glow line). Pilasters and fins on the long faces. **Raking buttresses** on slabs. Crowns: hammer (an overhanging top block), stepped, lantern (a glazed glowing box), flare (a widening cap), blade (a thin fin), cage (an open frame) and ziggurat. Masts with strobes, rooftop pads with amber edge lights, rails and antennas at LOD0 only.
* **Sizes.** Storeys read at 4.0–5.5 m; the window grid is the city material's, so a 1 km slab shows ~200 floors of tiny lit cells. Podiums are 46–52 m tall (10–12 storeys). Skybridge decks are 12–16 m deep (three storeys) and 22–28 m wide.
* **Light.** Above ~100 m everything is dark except window bands (26–45% lit at night), mechanical-floor glow lines, crown glows, holograms and aviation lights. Obstruction lights follow real practice in spirit: synchronised flashing red at the top and on every major setback, steady red at intermediate levels, white double strobes on mast tips. They are screen-size billboards (§ARCHITECTURE *Landmarks*) so they still read from 5 km.
* **Holograms.** Crowns carry the large panels (`skyline` band, visible across the basin), shafts and podiums the smaller ones. The canyon Ash Crane (`financial-canyon-crane`) is placed by searching for a clear gap outside the new, wider reserves.
* `confidence: invented` for every tower; the composition (slabs out of smog, red lights, crown holograms) is from the film's aerial establishing shots.

### 7.4 Downtown megablocks (stage 4)

* **The look.** The blocks around the financial slabs are shorter, heavier and closer together: a top-heavy canyon with a lit lid. Real downtown LA's superblocks (Bunker Hill, the Civic Center grid, the jewelry and garment blocks south of the towers) are the plan. The film's aerials show those streets as dark concrete slots under the kilometre slabs, so the masses stay in the **90–250 m** band and never compete with MT-1 (1,020 m) or MT-5 (880 m). `confidence: invented` for every plan; the height band and the cantilever are from the film's downtown plates plus present-day block sizes.
* **Kit** (`src/districts/_shared/megablock/`). One plan, four forms: `cantilever` (a smaller base under a shifted upper mass), `slab-podium` (arcade, podium terrace, set-back slab), `bar` (a long slab), `courtyard` (four wings and an open court). Three façade families — ribbed, coffered, panelled — are styles 15–17 of the shared city material plus proud fins, coffer bands and corner pilasters. Nothing here is a second shader. Stages 11, 12 and 20 should call `buildMegablock` with `residential` about 0.7–1 (laundry cages, balcony rows) instead of copying the DTLA dresser.
* **The lid.** Street crossings share a height per grid line (`lineWalkY`): **46 or 68 m** on every downtown street, and **92 or 118 m** on about three streets in five. Ring decks on the mass meet those crossings. Both sit under the 90 m minimum roof, except the high pair, which clears a short block and reads as a skybridge. Rooftop plant is tanks, a mast with a crossarm, corner glows, and an amber pad when the roof is wide enough for a spinner.
* **Occasional towers.** About one wide lot in eight is a compact megatower-kit shaft, **200–300 m** including the mast, still under the 320 m fabric ceiling. Forms are slab, stepped, stack or blade. They are boxes only (the fabric sink drops rotated pieces and detail 3).
* **Street.** 34 m avenues. Kiosks and steam sit in the overhang, not in the driving lane. Ground cars and vans run the downtown street graph (±7.2 m, about 8–16 m/s). Sidewalks are the curb, outside the mass. Crowds reuse the market mesh at about 40% of market density, including the MT-1 and MT-5 aprons.
* **Shared edges.** The financial polygon wins inside its boundary, so MT-1 and MT-5 are not DTLA fabric. The apron (kiosks, canopies, pools, steam, a walking loop) and the ground line under skybridges 1 and 3 are a detail layer registered for both districts. DTLA blocks within 110 m of the financial outline get a busier kiosk pass.
* **Holograms.** `dtla-canyon-ribbon`, `dtla-canyon-lantern`, `dtla-mt1-lease` (spill 22 m on the podium apron) and `dtla-mt5-glyph`. Kind-2 shaft billboards are at least 16 × 10 m so the existing field can promote them. No new designs.
* **Light and sound.** Canyon neon wetness is 0.62 below 90 m (the market stays 0.92). A light street fog (0.28) sits in DTLA under 80 m. Rain and the city bed only — no new emitters.

### 7.5 Civic Center (stage 5)

* **The look.** Sector 5's civic core is colder and emptier than the canyons around it: long concrete, white light, a little police colour, almost no advertising. Present-day Civic Center (the real LAPD block, the real City Hall, the park between them) is the plan. The park is paved stone. Nothing green. `confidence: invented` for every surface that the film does not show; the two sites are the real ones (§5.2, §5.3).
* **The two monuments.** LAPD is the hero (§5.2). City Hall is the smaller stone tower across the mall (§5.3). Both use the downtown bearing, so their stairs face each other. The fabric between the reserves is cleared (`inCivicMall`) and a landmark slab paves the gap, about 34 m wide. Forecourts stay inside the reserves (LAPD **122 m**, so the crown and the stair fit; City Hall **70 m**).
* **The field.** Background lots reuse the megablock kit, compact, with walkways off and no kit shop signs. Heights **58–122 m**, so they sit under both monuments. Lots along the mall are often a **36–52 m** colonnade wing instead, so the sky stays with the two towers. Shared sodium lamps are off in this district; the street kit is cold pylons, bollards, a bench, rare steam and cold pools. Caps: props 320 / 800 / 1,800 / 3,000 and steam 8 / 24 / 48 / 80 on low / medium / high / ultra.
* **People.** The market crowd mesh, at about 22% of market density, on sidewalk loops that skip a block whose centre is inside a monument reserve, plus a loop at each forecourt. They walk the ground, not the steps.
* **Holograms.** One placement, `lapd-shaft-notice`: a glyph-loop, 14 × 26 m, on the shaft face toward the steps. No new design and no new shader.
* **Sound.** Rain and the city bed only. No new emitters.
* **Cameras.** `__nla.civicView('approach'|'steps'|'hall'|'lobby'|'plaza')`.

### 7.6 Broadway Neon Canyon (stage 6)

* **The look.** Present-day Broadway from the Bradbury south through the theatre row: beaux-arts, baroque, deco and gothic fronts at the real addresses, partly wrapped in newer panel cladding, with vertical blade signs stacked up the canyon. Rain and magenta / violet / amber neon. Heights stay in the district row, **40–110 m**. `confidence: invented` for cladding, sign copy and most heights; published places and the few published sizes are called out below.
* **Where.** Grid bearing 38°, blocks **110 × 70 m**, streets **18 m**. The polygon runs from just south of the Civic Center down past the 9th Street theatres, wide enough to include the west-side gothic tower and not the Financial District (priority tie: financial is listed first). Megatower 6's reserve still eats a few blocks inside the polygon. That slab through the south theatre row is intentional.
* **Fronts.** The shared heritage kit (`src/districts/_shared/heritage/`) builds one street face: masonry or deco base, a set-back panel cap, side jackets when `wrap` is high, a cornice, pilasters, an optional marquee, a crown, blade signs. Styles 18 and 19 are the punched-stone and vertical-bay rows. Named bays, snapped onto the grid façades:
  * East (even addresses): Roxie ~518, Arcade ~534, Palace ~630, Globe ~744, Tower Theatre 800 (published frontage **15 m**; depth capped at 16 m because the block is 52 m), Orpheum 842 (published pin; height **54 m** invented), Eastern Columbia 849 (real roof **80.5 m**; nudged ~27 m so the bay sits in a block rather than the cross street).
  * West (odd): Million Dollar 307 (height **48 m** invented), LA Theatre 615 (published pin; height **32 m** invented), State ~703, the gothic tower at 929 (published pin, real roof **73.8 m**).
  * No venue name is on a sign. Copy is the shared atlas.
* **Bradbury.** Landmark `bradbury-building`, POI `bradbury` on the west sidewalk. See §5.3. The court is an interior stream (`bradbury-court`): warm baked light, the city hidden once you are past the tunnel, an open beam grid, eight columns, and a masonry stair up to the galleries. The iron atrium is not copied. A corridor and a room in the back wing (`bradbury-service`) are the X3 template, not a second public room. `__nla.broadwayView('atrium')` still stands in the court. `__nla.interiorView('court'|'stair'|'door'|'service')` frames the stream.
* **Footbridge.** Landmark `canyon-bridge` on the next street east of Broadway, not on Broadway itself. Deck **11.2 m**, stairs on both sidewalks (rise 0.35 m). The figure is Veil Dancer (§7.2). Structure is concrete with warm beacons. Pink is the hologram plus one atlas sign.
* **Street.** The downtown lane graph gained a second lattice (`lane` 3.15 m on canyon edges, 7.2 m on the avenues). The lattices do not share nodes. About one in four canyon vehicles is a rickshaw: the car mesh at scale 0.5 × 1.22 × 0.7, plus parked copies in the kit. Spinners do not fly the 18 m streets; over this district they are free at **148–260 m**. Shared sodium lamps are off. Both curbs of each owned street get bollards, neon pools, steam and people.
* **People and light.** The market crowd mesh at about **72%** of market density. Neon wetness **0.88** below 120 m. Street fog **0.42** below 90 m. Rain and the city bed only.
* **Budgets.** A 500 m chunk on the canyon was about **8–9 k** fabric triangles (one mesh plus one sign batch) and on the order of **30–67** boxes a block. LOD0 also adds kit, steam and pools, the same exception the market and DTLA already have. Caps: props 420 / 1,100 / 2,200 / 3,400 and steam 16 / 40 / 80 / 120 on low / medium / high / ultra.
* **Cameras.** `__nla.broadwayView('street'|'bridge'|'bradbury'|'spinner'|'atrium')`.

### 7.7 K's Megablock (stage 8)

* **The look.** A residential field of stained slabs. Grey concrete, sodium amber, sparse neon, wet streets. Signage stays at the market. Nothing up the shaft except a few warm windows. `confidence: invented` for every surface the film does not measure; the place and the 185 × 230 × 85 m envelope are the [§5.3](#53-other-landmarks) row.
* **Where.** Polygon 33.853–33.864 N / 118.116–118.132 W. Grid bearing 0°, blocks **150 × 90 m**, streets **12 m**, priority 4. The hero reserve is **140 m**, so the market at the slab's feet is landmark colliders plus kit props, not fabric.
* **The field.** Archetype `k-megablock` replaces the Stage-1 `megablock-market`. One compact megablock per block, `buildMegablock` with residential **0.72–1**, forms bar or slab-on-podium, families ribbed or panelled, lit **0.10–0.22**. Heights snap to the **3.4 m** module and stay inside **61–184 m** (a few near the top of the district row, most lower). Walkways off. No hologram slots. Kit blades are not emitted. Street signs use the shared atlas, and only below about 7 m. `confidence: invented` — the district row asks for 60–185 m residential slabs and signage only at the base.
* **The slab.** `megablock-slab`, bearing 0, so +X is east and +Z is south. Board-formed residential concrete (style 6, lit 0.16), a solid band every **13.6 m**, three slit cores, laundry and three short ledges on the lower south face. LOD triangles **1,180 / 740 / 70**. Colliders come from the detail-2 build: the lobby mouth, the shaft and floor 40 are open; the roof from **184.86 m** to **185 m** is solid. Red lights on the roof corners and the long edges. `confidence: invented` — a 3.4 m module is inside the §4 range 3.1–3.6, and 54 floors plus a cap reach the published 185 m.
* **The pad.** **16 × 16 m** at local (−84, 27.2), amber outline and a chevron, no insignia. A low plant sits off the lanes. The head-house is east of the shaft and is a shell only. Hover **191 m** (6 m over the roof, clear of the 3.5 m lane pad). Lanes `k-pad-ew` and `k-pad-ns`, `altBias` 0, fade **60 m**. The east-west run sits south of the head-house so it is not lifted off the pad. No street graph. `confidence: invented` — the film shows a roof arrival; the markings and the hut are original.
* **The market.** Along the south face, gap at the lobby. Stalls, tarps, a walk-up noodle counter (the shared kit: counter, stools, pots, steam — not a second interior), five vending machines, a kiosk, a pipe, a cable pair, sodium poles and pools. Words are atlas cells: NIGHT MARKET, HOT BROTH, NOODLES, VENDING. `confidence: invented` — the row asks for a market at the base and vendors; the stalls are not a copied set.
* **Inside.** All seven rooms use `registerInterior`. The lobby is a low fluorescent hall: mailboxes, lockers, a security frame, then the lift. Floor 40 is a 1.72 m corridor with cold tubes, repeated doors and invented-glyph marks (no words). The apartment is the south-west unit: the template puts the window on +X and the door on +Z, so the window faces west and the door faces the corridor. Kitchen counter, table and chair, bench, shower alcove, shelves, a lock panel, blinds. A warm lamp against the cool shell. Rain at the window is the interior streak mesh on the procedural card, not a second city render. No figure and no projector. `confidence: invented` — the film apartment is not measured here, and a replica is out of policy.
* **The lift.** Three static cars in one shaft (lobby, floor 40, roof). The right panel is the near stop, the left panel is the far stop. Standing on the panel's floor patch fades the bed and moves the walker. The mesh does not travel. `confidence: invented` — X3 has no moving platform; a fade is the smallest extension that still changes floors.
* **People and light.** The market crowd mesh at about **32%** of market density, on sidewalk loops that skip a block buried in the reserve, plus one aisle loop under the canopy. Neon wetness **0.5** below 48 m. Street fog **0.36** below 40 m. Shared sodium lamps stay on for 12 m streets outside the reserve.
* **Sound.** Rain and the city bed. Interiors that set `hum` add one 74 Hz sine under the muffled bed. No music, no film audio.
* **Cameras.** `__nla.kView('street'|'market'|'lobby'|'corridor'|'apartment'|'roof'|'aerial')`.

### 7.8 Wallace Precinct (stage 7)

* **The look.** Black stone, bronze light, amber haze near the ground. No corporate wordmark and no logo. Utility marks are two seven-segment digits and hazard stripes, not atlas phrases. `confidence: invented` — the district row forbids signage; a plant still needs bay numbers.
* **Where.** Polygon 34.023–33.985 N / 118.240–118.185 W, grid bearing 0°, blocks **240 × 160 m**, streets **30 m**, priority 2. The pyramid reserve is **2,400 m**, so almost every block under the mass is empty. Fabric survives in the western belt (the north-south street at world x = **1,440**) and a south-east sliver. The causeway and the north court are landmark meshes inside that reserve, north of the polygon edge, because the Stage 3 plinth already crosses it. `confidence: invented` for the street snap — a 30 m street on the existing 160 / 240 m grid, just outside the reserve, is where a dock lane can sit without entering the stone.
* **The field.** Archetype `wallace-vernon` replaces `industrial` on this polygon only. One plan per block: a windowless hall (**18–42 m**, sawtooth ridge under **5 m**), a tank farm, a pipe rack on bents, or a stack yard. Conveyor bridges, loading bays, perimeter walls with a **9 m** gate. Stacks **28–58 m**. Styles are Monolith, Solid, Glow and Slit. No new façade shader. Shared sodium lamps are off; bronze bars are the street light. `confidence: invented` — the row asks for 15–60 m windowless halls, tanks and pipes, and the heights stay inside that band.
* **Freight.** `wallace-freight-in` comes in low from the north, runs the causeway, then west into the factory street. `wallace-dock-ns` and `wallace-dock-ew` drop to about **16 m** on those street centre lines. All three are open polylines, `altBias` 0, transport probability 1, platoons of **2–5**. The existing hauler mesh is the vehicle. Fade **90 m** on the corridor and **46 m** on the docks. Ground haulers on the causeway are a separate four-truck loop, not a street-graph edge. `confidence: invented` — the row asks for freight spinners and convoys; there is no street graph on this polygon, and the pads in Stages 5 and 8 are the pattern for an open lane.
* **Air and sound.** Street fog **0.78** below **110 m**, fading with height, both in the polygon and inside the pyramid reserve (so the north court, which the polygon clips, still hazes). Neon wetness is not raised. The archetype's wet-street reflection is **0.06** (the unset default is 0.2, industrial is 0.1), so rain stays a dark amber haze instead of a pink and cyan carpet. A low noise bed and a 41 Hz tone sit on the ambience bus while you are in that haze. The atrium adds the existing 74 Hz hum at 0.45. No music and no film audio. `confidence: invented` — the row asks for amber haze and an industrial hum, and both are levels on systems that already exist.
* **Inside.** `wallace-atrium` is one `registerInterior` room behind the human door: about **6.7 × 8.2 × 4.1 m**, dark stone, a shallow water plane either side of one walkway, caustic patches on the interior flicker, a bronze lamp at the threshold. The monumental portal stays a glow. The room is hidden from the street (`showFromOutside: false`). Fly mode treats the volume as solid. `confidence: invented` — the film atrium is a cathedral and a character scene; this is a human-scale room that fits the door and the draw budget.
* **Old pyramids.** The Stage 3 models are unchanged. A detail module on `southeast-industrial` dresses a ring from about **18 m** to **170 m** outside each reserve. `confidence: invented` — see the §5.3 row.
* **Cameras.** `__nla.wallaceView('approach'|'plaza'|'face'|'satellite'|'factories'|'convoy'|'oldpyramids'|'atrium')`.

## 8. Vehicles and traffic

| Vehicle | Size | Notes |
|---|---|---|
| Spinner (2049 police/civilian) | **5.0 m long, 2.3 m wide, 1.45 m tall** | The 1982 spinner is usually quoted at ~4.7 m; the 2049 car is a little longer and lower. Original model (`spinnerModel.ts`), not a replica. No brand badges. |
| Player spinner cruise / boost | 75 / 260 m/s | arcade-fast for a 50 km city; real spinners are slower on screen |
| AI spinner layers | Outside downtown: 55–90 m (low), 175–260 m (main), 320–520 m (high). Over DTLA / financial / civic the low share follows the street graph at **74 m and 112 m** (between the walkway decks, ±11 m so a 5.6 m bridge is missed) and the free remainder is **340–520 m**. The 175–260 m band over those districts belongs to the avenue lanes. Over the Broadway canyon, spinners stay **off** the 18 m graph and fly free at **148–260 m** (above the 110 m roofs). | `SpinnerTraffic.ts`, `streetGraph.ts` |
| Transport hauler | **14 m long, 5.2 m wide, 3.6 m tall** | Invented heavy cargo spinner for the sky lanes (`transportModel.ts`): boxy body, amber running lights. Sized like a large rigid truck. |
| Sky lanes (Stage 3–5, pad runs through Stage 8, Wallace freight in Stage 7) | High avenues 430–860 m. **Downtown avenues at 188, 222 and 250 m** on the street centre lines (up to three runs each way, split where a hero collider crosses). Holding patterns 140 m over MT-1, around the MT-2/MT-4 pair, over LAPD (`hold-lapd`, police-heavy, unchanged) and at the Wallace apex (~3.2 km) and mid-height, corridors 360–3,240 m. **LAPD pad runs** (`lapd-pad-a`…`d`, plus a slow `lapd-pad-circuit`) leave the ~190 m avenue band, cross one roof pad at **222.5 m**, and leave again. **K's pad runs** (`k-pad-ew`, `k-pad-ns`) cross the south side of the megablock pad at **191 m** and climb away. One open polyline is both the arrival and the departure. | `skyLanes.ts`, `LaneTraffic.ts`, `civic-center/lanes.ts`, `k-megablock/lanes.ts`, `wallace-vernon/lanes.ts`. Right-hand traffic. High avenues separate directions by 16–30 m; downtown avenues by **11 m** (the street is 34 m). Opposite directions also sit **7 m** apart in height (`altBias`, default 7). Pad lanes set `altBias` to **0**. LAPD fades the ends over **70 m**; K's pad fades over **60 m**. Platoons of 1–4, bank, blink. Counts 60 / 140 / 240 / 380 by tier, dealt by length × weight so the lower avenues are not starved. **Wallace freight** (Stage 7) is three more open polylines (`wallace-freight-in`, `wallace-dock-ns`, `wallace-dock-ew`): transports only, platoons of 2–5, `altBias` 0, low and slow. A lane that omits `platoon` keeps the original roll. Ground haulers on the causeway are not this mesh. |
| Ground vehicles | cars ~4.2 × 1.9 × 1.4 m, vans a little longer and taller; canyon rickshaws are the same mesh at **0.5 × 1.22 × 0.7** | `groundTraffic.ts` on the same street graph. Avenue curb lane ±7.2 m; historic-core lanes ±3.15 m. 8–16 m/s (rickshaws 6–11), about one in five a van, about one in four canyon vehicles a rickshaw. Counts 10 / 22 / 40 / 64 by tier. Two draws (wet body shared with the spinner, headlights). Freeway trenches are still empty. |

## 9. Weather and time-of-day looks

The film's LA has **no blue sky**. Daytime is a flat grey-orange smog dome. Night is black with sodium-amber haze and saturated neon.
It rains most of the time, and it **snows** in the finale. The weather state machine (`src/atmosphere/Weather.ts`) runs on its own:

| State | Look | Rain/snow | Ground fog density (1/m) | Fog height scale | Wind |
|---|---|---|---|---|---|
| Dry smog haze | dusty, brown-grey, long views | 0 | 0.0007 | 600 m | 2 m/s |
| Overcast | flat grey, darker | 0 | 0.0010 | 450 m | 4 |
| Drizzle | wet sheen, soft streaks | 0.3 rain | 0.0013 | 420 m | 3 |
| Rain | the default film look | 0.65 rain | 0.0016 | 380 m | 5 |
| Heavy rain | near-white streaks, lightning | 1.0 rain | 0.0024 | 340 m | 9 |
| Thick fog | towers vanish at 300–600 m | 0 | 0.0042 | 220 m | 1 |
| Toxic smog | orange-brown | 0 | 0.0026 | 300 m | 1.5 |
| Snow | cold blue-grey, white roofs | 0.85 snow | 0.0022 | 380 m | 3 |
| Rain & snow | sleet | 0.45 / 0.5 | 0.0019 | 380 m | 5 |

* Fog is an **exponential height fog** integrated along each view ray, so the pyramid and megatowers rise out of the smog layer as they do in the film.
* On top of that sits an **inversion layer**: a gaussian band of extra density, centred at **150–320 m** with a 115 m half-width (peak 0.0004–0.0012 /m by weather; 0.0007 in dry haze, 0.0011 in toxic smog). Looking across from above, the canyon and podiums sink into a flat brown sea and only the upper half of the megatowers stands clear, which is the film's daytime skyline. Aviation lights see 30% of the fog depth, so beacons punch through it.
* Wetness and snow cover build up and dry out over time (puddles, darkened concrete, white roofs).
* A day lasts 30 real minutes by default. The window-lit fraction rises after dusk and the neon gets stronger at night.

## 10. Rules for inventing unseen areas

1. **Start from the real place.** Use the real street grid, street widths, freeways, river, hills and coast. A district stage should be
   recognisable to someone who knows modern LA from the air.
2. **Then apply 30 years of decline plus densification.** Replace low-rise with megablocks where the film shows megablocks (downtown and
   residential sectors). Elsewhere keep the existing height and add rooftop clutter, cladding and signage.
3. **Nothing green.** No trees, lawns or parks. Former parks become plazas, markets or water tanks.
4. **Brutalist and monolithic.** Large flat-topped concrete masses, cantilevered upper floors, very few curves (the curves belong to Wallace).
5. **Light comes from people.** Windows, signs, stalls and spinners. Street level is the brightest and most saturated, and everything above
   ~100 m is dark except beacons, holograms and lit windows.
6. **Signage density goes by commerce:** markets and entertainment are extreme, downtown dense, residential sparse, industry and civic almost none.
7. **Scale continuity.** Procedural fabric stays under **320 m**. Taller things are hand-placed landmarks: the Financial District megastructures (up to **1,020 m**), the old pyramids (≤ 1 km), the Wallace satellites (1.1–1.4 km) and the Wallace pyramid (3.5 km). Nothing above 3.5 km, and the Wallace pyramid stays at least 3× the tallest tower so it still dominates every view. *(Stage 3 revised this rule. It used to forbid anything between 420 m and 1,100 m, but the film's downtown aerials show kilometre-scale slabs.)*
8. **Wet and dirty.** Every surface is weathered, stained and wet unless the weather is dry.
9. **When you invent, record it** with `confidence: "invented"` in the JSON and in §5 or §7, with a one-line reason.
10. **Never copy.** Use original models, original textures (procedural preferred) and invented brand names. Look-alike is fine;
    a real logo or a traced frame is not.

## 11. Asset & IP policy

* All geometry is procedural or hand-modelled for this repo. All textures are procedural in shaders or drawn in code.
* Advertising uses generic glyph patterns, colours and invented names. **No** Atari, Coca-Cola, Sony, Peugeot, Pan Am, Wallace or Tyrell logos,
  and no real product imagery. A Wallace-*like* pyramid is fine; a Wallace logo is not.
* No audio from the films. Ambience is procedural: rain, wind and city rumble. **No music.**
* Third-party assets need a compatible licence (CC0/CC-BY) recorded in `docs/CREDITS.md` (create it when the first one lands).

## 12. Sources and further reading

* *Blade Runner 2049* (2017) and *Blade Runner* (1982): primary visual reference.
* *Black Out 2022*, *2036: Nexus Dawn*, *2048: Nowhere to Run*: official prologue shorts (Warner Bros./Alcon, 2017).
* Dennis Gassner interviews on the production design (IndieWire, Vanity Fair and Deadline coverage of the 2017–18 awards season): brutalism, the Wallace pyramids, storey counts.
* Weta Workshop's "Blade Runner 2049 miniatures" coverage (Weta Workshop site, a Weta behind-the-scenes video, Arch2O and Gigazine write-ups): Wallace HQ ~3.5 km represented height, LAPD tower miniature.
* VFX coverage (Art of VFX, Animation World Network): Double Negative/Framestore city-extension work, rain/snow/smog look.
* *The Art and Soul of Blade Runner 2049* (Tanya Lapointe, Titan Books, 2017): concept art for districts and markets.
* American Cinematographer coverage of the 1982 film: Tyrell pyramid described as a 700-storey structure (scale context).
* Blade Runner wiki (fandom), "Los Angeles", "Sepulveda Sea Wall", "LAPD" pages: sector names and lore summary (tertiary source).
* Fan frame analysis of K's spinner navigation map (Free League *Blade Runner RPG* forum): K's home location.
* Spinner dimension compilations (bladerunnerthoughts and prop-replica communities): 1982 spinner ≈ 4.7 m.
* Real-world LA data: USGS topography, the freeway network, the LA River channel, the coastline.

## 13. Open questions

* Exact Wallace HQ placement. The film never ties it to a street. If a later stage finds stronger evidence, move the pyramid in the JSON.
  Its 2.4 km reserve radius keeps the surrounding fabric consistent.
* Whether the first film's pyramids still stand in 2049. Stage 3 keeps two unnamed 1982-style pyramids as dormant Wallace holdings (§5.3). If later evidence places them elsewhere, or shows they were demolished, move or delete `old-pyramid-*` in the JSON.
* Megatower heights. The film never gives numbers; 520–1,020 m is read from the aerials against LAPD and Wallace. Stage 4 kept the megablocks at 90–250 m (kit towers to 300 m). They still read as the canyon floor under the slabs, which is the relationship the aerials show, so the hero heights stay.
* Ground-level freeway use in 2049 (trench traffic vs. abandoned).
* Sea wall crest height: 90 m is a reasoned estimate. Revisit with frame-by-frame analysis in Stage 10.
