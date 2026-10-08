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
* **Height 3,500 m, base 3,200 m square, top platform 420 m**, seven stepped tiers with ledges, edge ribs, a crown and ground-level entrance blocks.
* **Evidence:** Weta Workshop built the Wallace HQ as a large-scale miniature for the film's aerial establishing shots. The figure
  quoted alongside that work is roughly **3.5 km** of represented height. Dennis Gassner has described the Wallace buildings as
  monumental pyramids that dwarf the city, with "hundreds" of storeys. At ~300 storeys that gives ~11.7 m "mega-storeys", consistent with the
  interiors (Wallace's atrium, the water-lit office). The film's aerials show it as by far the tallest thing on the horizon.
* **Location (inferred, medium-low confidence):** 34.005 N, 118.200 W, in **Vernon / the industrial flats south-east of downtown**.
  Reasoning: in the film it rises out of flat industrial land with no hills behind it, is reached from downtown by a short spinner
  flight, and lore places Wallace manufacturing in the industrial sectors. Vernon is LA's real industrial city, 5–7 km from LAPD.
  From downtown it fills the south-eastern sky, which matches the look of the establishing shots.
* **Three satellite towers** (1,100–1,400 m, 300–360 m bases) are **invented**, following the film's composition of
  smaller Wallace structures around the main mass.

### 5.2 LAPD Headquarters (2049)
* **216 m tall**, 72 × 100 m shaft, inverted-pyramid crown 132 × 165 m and 62 m deep, landing pads on top, police beacons.
* **Evidence:** the building is a Weta miniature too. Scaling the ~4.5 m model at 1:48 gives ~216 m. On screen it stands well above the
  surrounding megablocks but nowhere near Wallace.
* **Location:** the **real LAPD headquarters site, 100 W 1st St** (34.0519 N, 118.2445 W), rotated to the downtown grid (38°).
  The film's LAPD sits in the Civic Center, which is where the real one is.
* Lettering: a generic white band sign. **No real LAPD insignia or film logo.**

### 5.3 Other landmarks
| Id | What | Size | Location and reasoning | Confidence |
|---|---|---|---|---|
| `city-hall` | Old City Hall, kept as a heritage tower among megablocks | 138 m, 45 × 45 m | Real building (1928). Survival to 2049 assumed, as the Bradbury survived in 2019. | medium |
| `megatower-1…6` | Financial District megatowers | 280–420 m, 56–78 m footprints, podium + shaft + flared crown + mast, 2 hologram panels each | Real Bunker Hill / Financial District sites. Heights bracketed between LAPD (216 m) and the Wallace satellites (1.1 km+): the film's downtown has towers clearly taller than LAPD. | invented |
| `k-megablock-tower` | K's apartment megabuilding | 185 m, 230 × 85 m slab | Centre of the on-screen spinner navigation map when K flies home (fan frame analysis puts it near Woodruff Ave & South St, Lakewood/Bellflower). Size from exterior shots: a long, featureless, many-storey slab with an open market at its feet. | medium-low |
| `lax-spaceport-towers` | LAX Off-World launch gantries | 3 gantries to 420 m on a 2.6 × 1.3 km apron | Lore: LAX becomes the off-world spaceport. Structures invented. | invented |
| `el-segundo-refinery` | Refinery flare field | stacks to 140 m over 1.6 × 1.1 km | Real El Segundo refinery. Homage to the 1982 "Hades landscape" opening. | medium |

### 5.4 Points of interest (future interiors and set pieces)
| Id | What | Stage |
|---|---|---|
| `noodle-bar` | Noodle-bar counter, enterable | 2 |
| `bibis-bar` | Bar and vending market | 2 |
| `joi-bridge` | Footbridge with the giant pink hologram (generic dancer, original design) | 6 |
| `bradbury` | Bradbury Building (heritage, 1982 film) | 6 |
| `k-apartment` | K's apartment, enterable | 8 |
| `sea-wall-fight` | Sea-wall finale site | 10 |
| `trash-mesa-gate` | Southern edge toward the San Diego trash mesa (out of bounds, vista only) | — |

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
in full detail). Heights below are the Stage 1 blockout, except Little Tokyo, which Stage 2 dresses in full
(see [§7.1](#71-little-tokyo-night-market-stage-2)).

| District (stage) | Lore sector | Palette | Materials | Signage | Typologies | Heights | Streets | Traffic |
|---|---|---|---|---|---|---|---|---|
| **Little Tokyo Night Market** (2) | Sector 5 shopping/bar district | wet black, sodium amber, red/pink/cyan neon, steam white | stained concrete, corrugated metal, plastic sheeting, tarp | **very dense** (blade signs, stall headers, LED strips) | stalls, kiosks, 2–8 storey shophouses, occasional megablock | 7–38 m, a few 55–95 m | 7 m lanes, covered walkways | pedestrians, umbrellas, bikes; spinners overhead |
| **Financial District Megatowers** (3) | Sector 9 | blue-grey, white LED, cyan holograms | dark glass, brushed metal, ribbed concrete | billboards and giant holograms on towers | podium + tower, stepped towers, megatowers | 100–290 m fabric; 280–420 m landmarks | 38 m avenues | heavy spinner layer at 175–260 m |
| **Downtown Megablocks** (4) | Sector 5/9 fringe | grey-brown, warm windows, pink/cyan ads | board-formed concrete, cantilevered upper masses ("top-heavy brutalism") | dense at street level, billboards high | flat-topped megablocks 90–150 m with rooftop clutter | 90–250 m | 34 m | dense spinners, few ground cars |
| **Civic Center** (5) | Sector 5 central | cold grey, white light, police red/blue | monumental concrete | sparse, institutional | plazas, civic slabs | 55–125 m, LAPD 216 m | 40 m | police spinners on pads |
| **Broadway Neon Canyon** (6) | Sector 9 Retirement Row | magenta, violet, amber neon on black | old masonry under new cladding | **extreme**, vertical blade signs stacked up façades | narrow deep canyon, heritage façades at the base | 40–110 m | 18 m | pedestrians, rickshaws |
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
* **The noodle bar** (`noodle-bar`, 34.0487 N, 118.2392 W) is a real recess: back wall, side walls, counter at **1.06 m**, stools at **0.75 m**, a cook behind the counter, two steam pots, a warm ceiling strip, menu signs. Eye height seated is **1.15 m**. `E` sits; walking stands you up. There is no sit control on the iPhone joystick yet. **Bibi's** (`bibis-bar`) is the same kit, shallower, a walk-up bar rather than a second interior. The names on the signs (NOODLES, HOT BROTH, KASAI, MIDORI, STEAM BAR, and the stroke-glyph lines) are invented. No film logos, no real brands.
* **Light.** Signs are an 8×8 canvas atlas (Latin via `fillText`, kana / hangul / hanzi / devanagari as original strokes). They tint the wet street with instanced additive pools on every tier. A planar mirror (`ReflectorNode`) turns on for high/ultra on a real GPU when you are under 28 m in the market; `?refl=0` forces it off, `?refl=1` forces it on. Software renders (the screenshot VM) stay on the fake pools.
* **People and air.** Instanced coats and lit umbrellas walk the lanes and slow down when the person ahead is inside **0.9 m**. Counts: about **56 / 160 / 340 / 680** on low / medium / high / ultra. Steam cards rise off grates and pots. High and ultra add three haze sheets near the ground. Rain streaks pick up neon while `neonWet` is high.
* **Sound.** Rain on awnings, a murmur, stall sizzle and a distant spinner, all procedural, positional with equal-power panners, mixed into the existing ambience. No music.

## 8. Vehicles and traffic

| Vehicle | Size | Notes |
|---|---|---|
| Spinner (2049 police/civilian) | **5.0 m long, 2.3 m wide, 1.45 m tall** | The 1982 spinner is usually quoted at ~4.7 m; the 2049 car is a little longer and lower. Original model (`spinnerModel.ts`), not a replica. No brand badges. |
| Player spinner cruise / boost | 75 / 260 m/s | arcade-fast for a 50 km city; real spinners are slower on screen |
| AI spinner layers | 55–90 m (low), 175–260 m (main), 320–520 m (high) | `SpinnerTraffic.ts` |
| Ground vehicles | not yet | Stage 2+ adds street-level cars and trucks to the freeway trenches |

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
7. **Scale continuity.** Nothing between 420 m and 1,100 m (the gap separates the city from Wallace), and nothing above 3.5 km.
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
* Whether the Tyrell pyramids still stand in 2049. They are unseen, so they are omitted for now.
* Ground-level freeway use in 2049 (trench traffic vs. abandoned).
* Sea wall crest height: 90 m is a reasoned estimate. Revisit with frame-by-frame analysis in Stage 10.
