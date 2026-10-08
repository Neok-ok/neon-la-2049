// Procedural neon sign / hologram panel material (generic glyph blocks: no real logos or brands).
import { DoubleSide, MeshBasicNodeMaterial, Color } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';
import { lutColor } from './lut';

const T = TSL as any;
const { Fn, attribute, float, vec2, floor, fract, step, smoothstep, mix, hash, uv, min, sin, abs } = T;

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

  const iSign = attribute('iSign', 'vec4');
  const kind = attribute('iKind', 'float');
  const size = vec2(iSign.x, iSign.y);
  const color = lutColor(SIGN_PALETTE, iSign.z);
  const seed = iSign.w;
  const p = uv().mul(size);
  const minSide = min(size.x, size.y);

  const color2 = lutColor(SIGN_PALETTE, floor(hash(seed.mul(7919)).mul(7.99)));

  m.colorNode = Fn(() => {
    // glyph rows: characters are square cells sized to the short side
    const cs = minSide.mul(0.78);
    const g = p.sub(minSide.mul(0.11)).div(cs);
    const cell = floor(g);
    const fr = fract(g);
    const sub = floor(fr.mul(4.0));
    const hId = hash(cell.x.add(cell.y.mul(31.0)).add(seed.mul(10000.0)));
    const on = step(0.5, hash(sub.x.add(sub.y.mul(4.0)).add(hId.mul(1000.0))));
    const inChar = step(0.14, fr.x).mul(step(fr.x, 0.86)).mul(step(0.12, fr.y)).mul(step(fr.y, 0.88));
    const inside = step(minSide.mul(0.1), p.x).mul(step(p.x, size.x.sub(minSide.mul(0.1)))).mul(step(minSide.mul(0.1), p.y)).mul(step(p.y, size.y.sub(minSide.mul(0.1))));
    const glyph = on.mul(inChar).mul(inside);
    const edge = min(min(p.x, size.x.sub(p.x)), min(p.y, size.y.sub(p.y)));
    const border = step(edge, minSide.mul(0.05));

    // billboard: animated gradient bands + scanlines + slow scroll ("hologram ad" placeholder)
    const t = U.time;
    const band = sin(uv().y.mul(6.0).add(t.mul(0.6)).add(seed.mul(20.0))).mul(0.5).add(0.5);
    const scan = step(0.5, fract(p.y.mul(1.2).sub(t.mul(2.0)))).mul(0.25).add(0.75);
    const shape = smoothstep(0.42, 0.38, abs(uv().x.sub(0.5).add(sin(t.mul(0.3).add(seed.mul(9.0))).mul(0.12))));
    const billboard = mix(color, color2, band).mul(scan).mul(shape.mul(0.9).add(0.25));

    // flicker on ~8% of signs
    const flickSel = step(0.92, seed);
    const flick = mix(float(1), step(0.25, hash(floor(t.mul(14.0)).add(seed.mul(500.0)))), flickSel);

    const neon = color.mul(glyph.mul(1.3).add(border.mul(0.9)).add(0.07));
    const isBillboard = step(1.5, kind);
    const out = mix(neon, billboard.mul(1.2), isBillboard);
    return out.mul(U.signPower).mul(flick).mul(1.5);
  })();
  shared = m;
  return m;
}
