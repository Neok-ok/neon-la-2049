// Scanline hologram panels. One material for every design: figures are SDFs, ads are scrolling blocks.
// Nothing here is a film character or a logo. Additive, so the dark parts of the quad disappear.
import {
  AdditiveBlending, ClampToEdgeWrapping, DataTexture, DoubleSide, LinearFilter, MeshBasicNodeMaterial,
  NoColorSpace, type Texture,
} from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';
import { resources } from '../../core/memory';
import { NITS } from '../../lighting/presets.ts';

const T = TSL as any;
const {
  Fn, attribute, float, vec2, vec3, vec4, uv, sin, cos, abs, min, max, mix, step, smoothstep,
  fract, floor, hash, length, exp, clamp, positionWorld, cameraPosition, texture, uniform,
} = T;

// Placeholder until the low-mesh silhouette arrives. Swapping `.value` keeps the
// cached hologram material bound to the same node.
const dancerMaskTex = resources.texture(
  () => new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1),
  { label: 'dancer-mask-standin', owner: 'humans' },
);
dancerMaskTex.needsUpdate = true;
dancerMaskTex.colorSpace = NoColorSpace;
dancerMaskTex.wrapS = ClampToEdgeWrapping;
dancerMaskTex.wrapT = ClampToEdgeWrapping;
dancerMaskTex.magFilter = LinearFilter;
dancerMaskTex.minFilter = LinearFilter;
dancerMaskTex.flipY = true;
dancerMaskTex.generateMipmaps = false;
const dancerMaskNode = texture(dancerMaskTex);
const dancerMaskReady = uniform(0);

let installedMask: Texture | null = null;

/** Swap the 1×1 stand-in for the approved dancer silhouette. Linear, clamped.
 *  A KTX2 mask is already Y-flipped in the file. Compressed uploads ignore flipY. */
export function installDancerMask(source: Texture): void {
  source.colorSpace = NoColorSpace;
  source.wrapS = ClampToEdgeWrapping;
  source.wrapT = ClampToEdgeWrapping;
  source.magFilter = LinearFilter;
  source.minFilter = LinearFilter;
  source.generateMipmaps = false;
  const compressed = (source as Texture & { isCompressedTexture?: boolean }).isCompressedTexture === true;
  if (!compressed) source.flipY = true;
  const prev = installedMask;
  installedMask = source;
  dancerMaskNode.value = source;
  dancerMaskReady.value = 1;
  if (prev && prev !== source) prev.dispose();
}

/** Back to the 1×1 stand-in. The installed mask is freed. */
export function releaseDancerMask(): void {
  const prev = installedMask;
  installedMask = null;
  dancerMaskNode.value = dancerMaskTex;
  dancerMaskReady.value = 0;
  prev?.dispose();
}

function ellipse(p: any, cx: any, cy: any, rx: any, ry: any): any {
  const dx = p.x.sub(cx).div(rx);
  const dy = p.y.sub(cy).div(ry);
  return smoothstep(0.72, 1.15, dx.mul(dx).add(dy.mul(dy))).oneMinus();
}

function diamond(p: any, cx: any, cy: any, rx: any, ry: any): any {
  const d = abs(p.x.sub(cx)).div(rx).add(abs(p.y.sub(cy)).div(ry));
  return smoothstep(0.7, 1.15, d).oneMinus();
}

/** Ash Line courier: a paper-crane of light, wings beating. */
function ashCrane(p: any, t: any, seed: any, mot: any): any {
  const flap = sin(t.mul(1.55).add(seed.mul(5.0))).mul(0.07).mul(mot);
  const body = diamond(p, float(0.5), float(0.42), float(0.12), float(0.2));
  const neck = ellipse(p, float(0.5), float(0.58), float(0.032), float(0.09));
  const head = diamond(p, float(0.5), float(0.71), float(0.055), float(0.07));
  const wingL = diamond(p, float(0.27), float(0.48).add(flap), float(0.2), float(0.05));
  const wingR = diamond(p, float(0.73), float(0.48).sub(flap), float(0.2), float(0.05));
  const tail = diamond(p, float(0.5), float(0.2).sub(flap.mul(0.35)), float(0.055), float(0.11));
  return max(body, max(neck, max(head, max(wingL, max(wingR, tail)))));
}

/** Sector 5 market mark: stacked rings, a round head, arms that sway. Not a person from the films. */
function coilVendor(p: any, t: any, seed: any, mot: any): any {
  let rings = float(0);
  for (let i = 0; i < 6; i++) {
    const wobble = sin(t.mul(1.15).add(seed.mul(4.0)).add(float(i))).mul(0.04).mul(mot);
    const y = 0.2 + i * 0.085;
    const rx = 0.2 - i * 0.016;
    rings = max(rings, ellipse(p, float(0.5).add(wobble), float(y), float(rx), float(0.042)));
  }
  const head = ellipse(p, float(0.5), float(0.78), float(0.072), float(0.078));
  const arm = sin(t.mul(1.35).add(seed.mul(2.0))).mul(0.07).mul(mot);
  const arms = max(
    ellipse(p, float(0.72).add(arm), float(0.46), float(0.1), float(0.034)),
    ellipse(p, float(0.28).sub(arm), float(0.5), float(0.09), float(0.032)),
  );
  return max(rings, max(head, arms));
}

/** Downtown "column saint": a bowing stack of ribbons. */
function ribbonColumn(p: any, t: any, seed: any, mot: any): any {
  const bow = sin(t.mul(0.65).add(seed.mul(3.0))).mul(0.1).mul(mot);
  let bars = float(0);
  for (let i = 0; i < 8; i++) {
    const y = 0.16 + i * 0.082;
    const rx = 0.08 + (i % 3) * 0.04;
    const x = float(0.5).add(bow.mul(i / 8));
    bars = max(bars, ellipse(p, x, float(y), float(rx), float(0.028)));
  }
  const head = diamond(p, float(0.5).add(bow), float(0.86), float(0.06), float(0.065));
  return max(bars, head);
}

function panelChrome(p: any): { panel: any; border: any; edge: any } {
  const inset = min(min(p.x, float(1).sub(p.x)), min(p.y, float(1).sub(p.y)));
  const edge = smoothstep(0.0, 0.012, inset);
  const panel = smoothstep(0.0, 0.02, inset).mul(0.2);
  const border = smoothstep(0.02, 0.055, inset).oneMinus().mul(edge);
  return { panel, border, edge };
}

/** Scrolling block-glyph ad. The blocks are noise, not letters and not a brand. */
function glyphLoop(p: any, t: any, seed: any): any {
  const chrome = panelChrome(p);
  let glyphs = float(0);
  for (let row = 0; row < 4; row++) {
    const y0 = 0.16 + row * 0.19;
    const inRow = step(y0, p.y).mul(step(p.y, y0 + 0.11));
    const dir = row % 2 === 0 ? 0.16 : -0.12;
    const scroll = fract(p.x.add(t.mul(dir)).add(seed.mul(0.7)));
    const cell = floor(scroll.mul(8.0));
    const fr = fract(scroll.mul(8.0));
    const on = step(0.4, hash(cell.add(float(row * 17)).add(floor(seed.mul(40.0)))));
    const block = step(0.16, fr).mul(step(fr, 0.84));
    glyphs = max(glyphs, inRow.mul(on).mul(block));
  }
  return max(glyphs, max(chrome.border, chrome.panel)).mul(chrome.edge);
}

/** "Lease a wedge": an original flying wedge and two pods crossing a barcode. Not a spinner replica. */
function leaseLoop(p: any, t: any, seed: any): any {
  const chrome = panelChrome(p);
  const u = fract(t.mul(0.07).add(seed));
  const cx = mix(float(0.22), float(0.78), u);
  const x = p.x.sub(cx);
  const y = p.y.sub(0.56);
  const tri = smoothstep(0.1, 0.2, abs(y).add(x.mul(-0.12))).oneMinus().mul(step(float(-0.16), x)).mul(step(x, float(0.2)));
  const podA = ellipse(p, cx, float(0.68), float(0.055), float(0.028));
  const podB = ellipse(p, cx, float(0.44), float(0.055), float(0.028));
  const bars = step(0.55, fract(p.x.mul(16.0).sub(t.mul(0.35)))).mul(step(0.14, p.y)).mul(step(p.y, 0.26)).mul(step(0.08, p.x)).mul(step(p.x, 0.92));
  return max(chrome.panel, max(chrome.border, max(tri, max(podA, max(podB, bars))))).mul(chrome.edge);
}

/** Red Lantern house mark: a pulsing hex-ish lamp and three orbiting motes. */
function lanternLoop(p: any, t: any, seed: any, mot: any): any {
  const pulse = sin(t.mul(1.2).add(seed.mul(6.0))).mul(0.03).mul(mot).add(0.17);
  const body = ellipse(p, float(0.5), float(0.52), pulse.mul(1.2), pulse.mul(1.45));
  const cap = diamond(p, float(0.5), float(0.74), float(0.07), float(0.04));
  const rib = step(0.7, fract(p.y.mul(7.0).add(t.mul(0.2)))).mul(body);
  let dots = float(0);
  for (let i = 0; i < 3; i++) {
    const a = t.mul(0.85).add(seed.mul(2.0)).add(float(i * 2.094));
    dots = max(dots, ellipse(p, float(0.5).add(cos(a).mul(0.28)), float(0.52).add(sin(a).mul(0.24)), float(0.03), float(0.03)));
  }
  const chrome = panelChrome(p);
  return max(body, max(cap, max(rib, max(dots, chrome.border.mul(0.5))))).mul(chrome.edge);
}

/**
 * Veil House canyon figure. A geometric dancer: diamond head with no face, a swinging
 * chevron skirt, one arm up, a long veil. Not a portrait and not a character from either film.
 */
function veilDancer(p: any, t: any, seed: any, mot: any, detail: any, distCam: any, slice: any): any {
  // Low stays a thin glyph. Medium (detail ~0.33) is already a body when the camera is close.
  const near = smoothstep(float(160), float(24), distCam);
  const tier = smoothstep(float(0.04), float(0.28), detail);
  const thick = near.mul(mix(float(0.18), float(1), tier));
  const sway = sin(t.mul(1.2).add(seed.mul(4.2))).mul(0.22).mul(mot);
  // Hem sits at uv 0.02 so a street-planted quad puts the feet on the ground. Same parts as before.
  // The crown has to travel with the chest. A 0.25 weight left the head still
  // while the street camera was looking at the upper body.
  const head = diamond(p, float(0.5).add(sway.mul(1.15)), float(0.847), float(0.05), float(0.093));
  const neck = ellipse(p, float(0.5).add(sway.mul(0.9)), float(0.726), mix(float(0.016), float(0.03), thick), float(0.04));
  const torso = ellipse(p, float(0.5).add(sway.mul(0.62)), float(0.562), mix(float(0.055), float(0.145), thick), float(0.128));
  const hip = sin(t.mul(1.55).add(seed.mul(2.0))).mul(0.035).mul(mot);
  const skirt1 = diamond(p, float(0.5).add(sway), float(0.334).add(hip), mix(float(0.15), float(0.22), thick), float(0.057));
  const skirt2 = diamond(p, float(0.5).add(sway.mul(1.25)), float(0.220), mix(float(0.19), float(0.26), thick), float(0.050));
  const skirt3 = diamond(p, float(0.5).add(sway.mul(1.45)), float(0.106), mix(float(0.12), float(0.18), thick), float(0.043));
  const armUp = ellipse(p, float(0.64).add(sway.mul(1.05)), float(0.733), float(0.1), mix(float(0.022), float(0.055), thick));
  const armOut = ellipse(p, float(0.32).sub(sway.mul(0.85)), float(0.505), float(0.11), mix(float(0.02), float(0.05), thick));
  const veil = ellipse(p, float(0.56).add(sway.mul(1.7)), float(0.391), mix(float(0.035), float(0.075), thick), float(0.371));
  const shape = max(head, max(neck, max(torso, max(skirt1, max(skirt2, max(skirt3, max(armUp, max(armOut, veil))))))));
  const glow = ellipse(p, float(0.5).add(sway.mul(0.85)), float(0.434), mix(float(0.26), float(0.34), thick), float(0.40)).mul(0.16);
  const sdf = max(shape, glow);
  // Letterbox a 15 m figure on a wider panel. Hollywood's 24 m quad must not stretch her.
  const span = attribute('iSpan', 'vec2');
  const uFig = p.x.sub(0.5).mul(span.x.div(float(15))).add(0.5);
  const inside = step(float(0), uFig).mul(step(uFig, float(1)));
  const sampled = dancerMaskNode.sample(vec2(uFig.sub(sway.mul(1.4)), p.y)).r.mul(inside);
  const body = mix(sdf, sampled, dancerMaskReady);
  // Hand the near slice to the hero mesh. Ghost slices stay on this quad.
  // Distance is to the planted hem, not the fragment: a head fragment on a
  // 68 m panel is far enough that the flat column stayed up over the mesh.
  const hemDrop = mix(span.y.mul(0.48), span.y.mul(0.5), step(float(20), span.x));
  const anchorY = positionWorld.y.sub(p.y.sub(0.5).mul(span.y));
  const hem = vec3(positionWorld.x, anchorY.sub(hemDrop), positionWorld.z);
  const distFig = length(hem.sub(cameraPosition));
  const close = smoothstep(float(80), float(24), distFig).mul(smoothstep(float(0.08), float(0.22), detail)).mul(step(slice, float(0.5)));
  // Stay under the bloom threshold (1.0). The shared *2.5 is for small signs;
  // this figure is 68 m tall and that gain clipped it to a white diamond.
  return body.mul(float(1).sub(close)).mul(0.4);
}

let shared: MeshBasicNodeMaterial | null = null;

/** Instanced attributes: iHolo = (design, seed, slice, detail01), iTint = rgb. */
export function getHoloMaterial(): MeshBasicNodeMaterial {
  if (shared) return shared;
  const m = resources.material('hologram', () => new MeshBasicNodeMaterial());
  m.name = 'Hologram';
  m.transparent = true;
  m.depthWrite = false;
  m.depthTest = true;
  m.blending = AdditiveBlending;
  m.side = DoubleSide;
  m.fog = false;
  m.toneMapped = true;

  const iHolo = attribute('iHolo', 'vec4');
  const tint = attribute('iTint', 'vec3');

  m.colorNode = Fn(() => {
    const design = iHolo.x;
    const seed = iHolo.y;
    const slice = iHolo.z;
    const detail = clamp(iHolo.w, 0, 1);
    const t = U.time;
    const mot = mix(float(0.28), float(1), detail);

    const tear = step(0.988, hash(floor(uv().y.mul(22.0)).add(floor(t.mul(6.0)).add(seed.mul(30.0)))));
    const p = vec2(uv().x.add(tear.mul(detail).mul(0.04)), uv().y);

    const crane = ashCrane(p, t, seed, mot);
    const coil = coilVendor(p, t, seed, mot);
    const ribbon = ribbonColumn(p, t, seed, mot);
    const fig = mix(crane, mix(coil, ribbon, step(1.5, design)), step(0.5, design));
    const vol = ellipse(p, float(0.5), float(0.48), float(0.46), float(0.47)).mul(0.14);
    const figures = max(fig, vol);

    const glyph = glyphLoop(p, t, seed);
    const lease = leaseLoop(p, t, seed);
    const lantern = lanternLoop(p, t, seed, mot);
    const ads = mix(glyph, mix(lease, lantern, step(4.5, design)), step(3.5, design));
    const distCam = length(positionWorld.sub(cameraPosition));
    const dancer = veilDancer(p, t, seed, mot, detail, distCam, slice);
    const base = mix(figures, ads, step(2.5, design));
    const mask = mix(base, dancer, step(5.5, design));

    const lines = mix(float(8), float(32), detail);
    const sweep = fract(p.y.mul(lines).sub(t.mul(mix(float(0.35), float(1.7), detail))));
    const line = smoothstep(0.06, 0.32, sweep).mul(smoothstep(0.58, 0.94, sweep).oneMinus());
    const scan = mix(float(0.58), float(1), line);

    const bucket = floor(t.mul(mix(float(2), float(8), detail)).add(seed.mul(19.0)));
    const fh = hash(bucket);
    const dip = step(fh, 0.14).mul(detail);
    const flick = mix(float(1), float(0.72), dip).add(step(0.975, fh).mul(detail).mul(0.4));

    const sliceDim = mix(float(1), float(0.34), slice.mul(0.5));
    const core = smoothstep(0.2, 0.9, mask);
    const rgb = mix(tint, vec3(0.92, 0.97, 1.0), core.mul(0.06));
    const haze = clamp(exp(distCam.mul(U.fogDensity).mul(-0.22)), 0.35, 1);
    const night = U.night.mul(0.75).add(0.28);
    return vec4(rgb.mul(mask).mul(scan).mul(flick).mul(sliceDim).mul(haze).mul(night).mul(U.signPower).mul(NITS.hologram), float(1));
  })();

  shared = m;
  return m;
}

let cardMat: MeshBasicNodeMaterial | null = null;

/** Ground wash under a street-level projector. iCard = rgb + strength. */
export function getHoloCardMaterial(): MeshBasicNodeMaterial {
  if (cardMat) return cardMat;
  const m = resources.material('hologram-spill', () => new MeshBasicNodeMaterial());
  m.name = 'HologramSpill';
  m.transparent = true;
  m.depthWrite = false;
  m.depthTest = true;
  m.blending = AdditiveBlending;
  m.fog = true;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -2;
  const light = attribute('iCard', 'vec4');
  const u = uv().sub(0.5);
  const r = length(u).mul(2.15);
  const fade = smoothstep(0.08, 1.0, r).oneMinus();
  m.colorNode = vec4(
    light.xyz.mul(light.w).mul(fade).mul(U.wetness.mul(0.7).add(0.3)).mul(U.night.mul(0.8).add(0.2)).mul(U.signPower).mul(U.holoSpill).mul(NITS.holoCard),
    float(1),
  );
  cardMat = m;
  return m;
}
