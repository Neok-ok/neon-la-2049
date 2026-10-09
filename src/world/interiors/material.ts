// Unlit on purpose. The city material follows night, wetness and sign power; an interior must not.
import { DoubleSide, MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';

const T = TSL as any;

let mat: MeshBasicNodeMaterial | null = null;

export function interiorMaterial(): MeshBasicNodeMaterial {
  if (mat) return mat;
  const m = new MeshBasicNodeMaterial();
  m.fog = false;
  m.side = DoubleSide;
  m.colorNode = T.Fn(() => {
    const col = T.attribute('color', 'vec3');
    const em = T.attribute('emissive', 'vec3');
    const flick = T.attribute('flick', 'float');
    const pulse = T.float(0.55).add(T.sin(U.time.mul(6.5).add(flick.mul(5.3))).mul(0.45));
    const k = T.select(flick.lessThan(0.0), T.float(1.0), pulse);
    return col.add(em.mul(k));
  })();
  mat = m;
  return m;
}
