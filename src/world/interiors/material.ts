// Unlit on purpose. The city material follows night, wetness and sign power; an interior must not.
import { DoubleSide, MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';
import { resources } from '../../core/memory/resources';
import { NITS } from '../../lighting/presets.ts';

const T = TSL as any;

export function interiorMaterial(): MeshBasicNodeMaterial {
  return resources.material('interior-shell', () => {
  const m = new MeshBasicNodeMaterial();
  m.fog = false;
  m.side = DoubleSide;
  m.colorNode = T.Fn(() => {
    const col = T.attribute('color', 'vec3');
    const em = T.attribute('emissive', 'vec3');
    const flick = T.attribute('flick', 'float');
    const pulse = T.float(0.55).add(T.sin(U.time.mul(6.5).add(flick.mul(5.3))).mul(0.45));
    const k = T.select(flick.lessThan(0.0), T.float(1.0), pulse);
    return col.mul(NITS.interiorSurface).add(em.mul(k).mul(NITS.interiorFixture));
  })();
  return m;
  });
}
