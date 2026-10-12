// The only three.js lights in the city. Everything else is a registry practical.
// Directional and hemisphere intensities are lux (three.js r155+ physical lights).
import { DirectionalLight, HemisphereLight, type Scene } from 'three/webgpu';

export function createSkyLights(scene: Scene): { hemi: HemisphereLight; sun: DirectionalLight } {
  const hemi = new HemisphereLight(0x9a8070, 0x101014, 1);
  const sun = new DirectionalLight(0xfff0e0, 0);
  sun.position.set(0, 1, 0);
  sun.castShadow = false;
  scene.add(hemi, sun, sun.target);
  return { hemi, sun };
}
