// Neon sign panel. Wall and blade signs sample a canvas atlas of invented phrases
// (Latin text + original stroke glyphs). Kind-2 billboards stay the cheap scrolling panel.
// Giant figures and ad loops live in src/world/holograms (they can sit in front of these panels).
import { DoubleSide, MeshBasicNodeMaterial, Color } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';
import { lutColor } from './lut';
import { getSignAtlas } from './signAtlas';
import { SIGN_ATLAS_COLS, SIGN_ATLAS_ROWS } from './signPhrases';

const T = TSL as any;
const { Fn, attribute, float, vec2, vec3, floor, fract, step, smoothstep, mix, hash, uv, sin, abs } = T;

/** Indexed by SignColor (src/world/fabric/types.ts) */
export const SIGN_PALETTE = [
  new Color(1.0, 0.18, 0.55), // pink
  new Color(0.15, 0.85, 1.0), // cyan
  new Color(1.0, 0.55, 0.12), // amber
  new Color(1.0, 0.12, 0.1), // red
  new Color(0.1, 1.0, 0.65), // teal
  new Color(0.62, 0.25, 1.0), // violet
  new Color(0.85, 0.92, 1.0), // white
  new Color(1.0, 0.9, 0.2), // yellow
];

let shared: MeshBasicNodeMaterial | null = null;

/** Instanced attribute `iSign` = (w, h, colorIdx, seed), `iKind` = kind (0 wall, 1 blade, 2 billboard). */
export function getSignMaterial(): MeshBasicNodeMaterial {
  if (shared) return shared;
  const m = new MeshBasicNodeMaterial();
  m.name = 'NeonSign';
  m.side = DoubleSide;
  m.fog = true;

  const iSign = attribute('iSign', 'vec4');
  const kind = attribute('iKind', 'float');
  const size = vec2(iSign.x, iSign.y);
  const color = lutColor(SIGN_PALETTE, iSign.z);
  const seed = iSign.w;
  const puv = uv();

  const color2 = lutColor(SIGN_PALETTE, floor(hash(seed.mul(7919)).mul(7.99)));

  m.colorNode = Fn(() => {
    // Tall blades rotate the landscape atlas cell so the line runs along the long axis.
    const tall = step(size.x, size.y);
    const scroll = step(0.9, seed);
    const su0 = mix(puv.x, puv.y, tall);
    const sv = mix(puv.y, float(1).sub(puv.x), tall);
    const su = fract(su0.add(U.time.mul(0.12).mul(scroll)));

    // phraseSeed(i) = (i + 0.5) / 64, so floor(seed * 64) recovers the cell. Random seeds land somewhere too.
    const idx = floor(seed.mul(SIGN_ATLAS_COLS * SIGN_ATLAS_ROWS - 0.001));
    const col = idx.mod(SIGN_ATLAS_COLS);
    const row = floor(idx.div(SIGN_ATLAS_COLS));
    const au = col.add(su).div(SIGN_ATLAS_COLS);
    // CanvasTexture flipY puts canvas row 0 at texture v = 1.
    const av = float(SIGN_ATLAS_ROWS - 1).sub(row).add(sv).div(SIGN_ATLAS_ROWS);
    const sample = T.texture(getSignAtlas(), vec2(au, av));
    const lum = sample.r.max(sample.g).max(sample.b);
    const panel = color.mul(lum.mul(2.4).add(0.045));

    // billboard: animated gradient bands + scanlines ("hologram ad", still no logos)
    const t = U.time;
    const band = sin(puv.y.mul(6.0).add(t.mul(0.6)).add(seed.mul(20.0))).mul(0.5).add(0.5);
    const scan = step(0.5, fract(puv.y.mul(size.y.mul(1.2)).sub(t.mul(2.0)))).mul(0.25).add(0.75);
    const shape = smoothstep(0.38, 0.42, abs(puv.x.sub(0.5).add(sin(t.mul(0.3).add(seed.mul(9.0))).mul(0.12)))).oneMinus();
    const billboard = mix(color, color2, band).mul(scan).mul(shape.mul(0.9).add(0.25));

    const flickSel = step(0.92, seed);
    const flick = mix(float(1), step(0.25, hash(floor(t.mul(14.0)).add(seed.mul(500.0)))), flickSel);

    const isBillboard = step(1.5, kind);
    const out = mix(panel, billboard.mul(1.35), isBillboard);
    return vec3(out).mul(U.signPower).mul(flick).mul(1.65);
  })();
  shared = m;
  return m;
}
