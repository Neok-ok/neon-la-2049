// Drives day/night + weather -> shared uniforms, lights, exposure and environment reflections.
import {
  Color, DirectionalLight, EquirectangularReflectionMapping, HemisphereLight, CanvasTexture, SRGBColorSpace, Vector3,
  type Scene, type WebGPURenderer,
} from 'three/webgpu';
import { U } from './uniforms';
import { Weather, type WeatherId } from './Weather';
import { installSkyAndFog } from './SkyFog';

export class DayNight {
  /** 0..24 */
  hours: number;
  /** real seconds per in-game day */
  dayLength = 1800;
  frozen = false;

  constructor(hours = 22.5) {
    this.hours = hours;
  }

  update(dt: number): void {
    if (this.frozen) return;
    this.hours = (this.hours + (dt * 24) / this.dayLength) % 24;
  }

  sunDir(out: Vector3): Vector3 {
    const a = ((this.hours - 6) / 12) * Math.PI;
    return out.set(Math.cos(a), Math.sin(a) * 0.82, Math.sin(a) * 0.45 + 0.15).normalize();
  }

  get label(): string {
    const h = Math.floor(this.hours);
    const m = Math.floor((this.hours - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

const c = (r: number, g: number, b: number) => new Color(r, g, b);
const NIGHT = { zenith: c(0.006, 0.007, 0.011), horizon: c(0.085, 0.056, 0.04), fog: c(0.05, 0.037, 0.03) };
const DUSK = { zenith: c(0.07, 0.07, 0.09), horizon: c(0.5, 0.28, 0.16), fog: c(0.36, 0.23, 0.15) };
const DAY = { zenith: c(0.33, 0.35, 0.37), horizon: c(0.58, 0.55, 0.49), fog: c(0.5, 0.48, 0.43) };
const SMOG_TINT = c(0.85, 0.55, 0.3);
const SNOW_TINT = c(0.85, 0.9, 1.0);

const tmpA = new Color(), tmpB = new Color();
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Atmosphere {
  readonly dayNight: DayNight;
  readonly weather: Weather;
  readonly hemi: HemisphereLight;
  readonly sun: DirectionalLight;
  exposure = 1;
  private sunV = new Vector3();
  private lightningT = 0;

  constructor(private scene: Scene, opts: { hours?: number; weather?: WeatherId }) {
    this.dayNight = new DayNight(opts.hours ?? 22.5);
    this.weather = new Weather(opts.weather ?? 'rain');
    this.hemi = new HemisphereLight(0x9a8070, 0x101014, 0.5);
    this.sun = new DirectionalLight(0xfff0e0, 1);
    this.sun.position.set(0, 1, 0);
    scene.add(this.hemi, this.sun, this.sun.target);
    installSkyAndFog(scene);
    scene.environment = makeEnvTexture();
    scene.environmentIntensity = 0.3;
  }

  update(dt: number, elapsed: number, renderer: WebGPURenderer): void {
    this.dayNight.update(dt);
    this.weather.update(dt);
    const w = this.weather.params;
    const sd = this.dayNight.sunDir(this.sunV);
    const e = sd.y;

    const dayF = smoothstep(-0.1, 0.3, e);
    const duskF = Math.max(0, 1 - Math.abs(e) / 0.22) * (1 - w.overcast * 0.5);
    const night = 1 - dayF;

    const mixSet = (key: 'zenith' | 'horizon' | 'fog', out: Color) => {
      out.copy(NIGHT[key]).lerp(DAY[key], dayF);
      out.lerp(DUSK[key], duskF * 0.75);
      // smog tint (brown-orange) and snow (cold white-grey)
      tmpA.copy(out).multiply(SMOG_TINT).multiplyScalar(1.25);
      out.lerp(tmpA, w.smogTint * 0.6);
      tmpB.copy(out).multiply(SNOW_TINT).multiplyScalar(1.2);
      out.lerp(tmpB, w.snow);
      return out;
    };
    mixSet('zenith', U.skyZenith.value as Color);
    mixSet('horizon', U.skyHorizon.value as Color);
    mixSet('fog', U.fogColor.value as Color);
    // overcast flattens the sky toward the horizon colour
    (U.skyZenith.value as Color).lerp(U.skyHorizon.value as Color, w.overcast * 0.5);

    (U.sunDir.value as Vector3).copy(sd);
    (U.sunColor.value as Color).setRGB(1, 0.86 - duskF * 0.25, 0.72 - duskF * 0.4);
    U.daylight.value = dayF * (1 - w.overcast * 0.75);
    U.night.value = night;
    U.windowLit.value = 0.35 + 0.65 * smoothstep(0.25, -0.05, e);
    U.signPower.value = 0.55 + 0.45 * night;
    U.time.value = elapsed % 3600;
    U.wetness.value = this.weather.wetness;
    U.snow.value = this.weather.snowCover;
    U.fogDensity.value = w.fog * (1 + Number(U.streetFog.value));
    U.fogFalloff.value = 1 / w.falloff;
    U.haze.value = 0.00003 + w.fog * 0.02;

    // occasional lightning flash in heavy rain
    if (w.rain > 0.85 && Math.random() < dt * 0.04) this.lightningT = 0.35;
    this.lightningT = Math.max(0, this.lightningT - dt);
    U.lightning.value = this.lightningT > 0 ? Math.max(0, Math.sin(this.lightningT * 60)) * (this.lightningT / 0.35) : 0;

    this.hemi.color.copy(U.skyHorizon.value as Color).multiplyScalar(1.4);
    this.hemi.groundColor.setRGB(0.05, 0.045, 0.05).lerp(c(0.18, 0.1, 0.06), night * 0.6);
    this.hemi.intensity = 0.55 + 1.3 * dayF + U.lightning.value * 3;
    this.sun.position.copy(sd).multiplyScalar(1000);
    this.sun.intensity = Math.max(0, e) > 0 ? 2.4 * dayF * (1 - w.overcast * 0.75) : 0;
    this.sun.color.copy(U.sunColor.value as Color);
    this.scene.environmentIntensity = 0.25 + 0.6 * dayF;

    this.exposure = 1.15 - 0.25 * dayF;
    renderer.toneMappingExposure = this.exposure;
  }
}

/** Small procedural equirect environment: dark sky, warm city glow band at the horizon, neon blotches. */
function makeEnvTexture(): CanvasTexture {
  const W = 256, H = 128;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0b0d12');
  grad.addColorStop(0.42, '#3a2a22');
  grad.addColorStop(0.5, '#6a4632');
  grad.addColorStop(0.58, '#1a1514');
  grad.addColorStop(1, '#050506');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const neon = ['#ff2d8c', '#20d8ff', '#ff8a1e', '#a040ff', '#30ffb0'];
  for (let i = 0; i < 40; i++) {
    g.fillStyle = neon[i % neon.length];
    g.globalAlpha = 0.25 + Math.random() * 0.4;
    const x = Math.random() * W, y = H * (0.44 + Math.random() * 0.1);
    g.fillRect(x, y, 2 + Math.random() * 8, 2 + Math.random() * 6);
  }
  g.globalAlpha = 1;
  const tex = new CanvasTexture(cv);
  tex.mapping = EquirectangularReflectionMapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
