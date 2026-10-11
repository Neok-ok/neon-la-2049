// Drives day/night + weather -> shared uniforms, lights, exposure and environment reflections.
import {
  Color, EquirectangularReflectionMapping, CanvasTexture, SRGBColorSpace, Vector3,
  type Scene, type WebGPURenderer,
} from 'three/webgpu';
import { authoredLift, skyLux, stepExposure, sunLux } from '../lighting/exposure.ts';
import { createSkyLights } from '../lighting/sky.ts';
import { U } from './uniforms';
import { Weather, type WeatherId } from './Weather';
import { installSkyAndFog } from './SkyFog';
import { applyAirLayers } from './airState';
import { sampleCoastalFlash, stormSnap, thunderDelay } from '../districts/coastal-strip/storm';

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
const NIGHT = { zenith: c(0.004, 0.006, 0.014), horizon: c(0.026, 0.034, 0.06), fog: c(0.014, 0.018, 0.032) };
const DUSK = { zenith: c(0.07, 0.07, 0.09), horizon: c(0.5, 0.28, 0.16), fog: c(0.36, 0.23, 0.15) };
// Cold steel grey-blue. Orange stays on DUSK and on the smog weather, not on a clear noon.
const DAY = { zenith: c(0.22, 0.31, 0.42), horizon: c(0.40, 0.49, 0.58), fog: c(0.36, 0.44, 0.52) };
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
  readonly hemi: ReturnType<typeof createSkyLights>['hemi'];
  readonly sun: ReturnType<typeof createSkyLights>['sun'];
  exposure = 1;
  private sunV = new Vector3();
  private lightningT = 0;

  constructor(private scene: Scene, opts: { hours?: number; weather?: WeatherId }) {
    this.dayNight = new DayNight(opts.hours ?? 22.5);
    this.weather = new Weather(opts.weather ?? 'rain');
    const sky = createSkyLights(scene);
    this.hemi = sky.hemi;
    this.sun = sky.sun;
    installSkyAndFog(scene);
    scene.environment = makeEnvTexture();
    scene.environmentIntensity = 0.3;
  }

  /**
   * `storm` suppresses the old heavy-rain flash so the preset does not double it.
   * `coastal` is the gentle sea-wall flash (medium and up, near the wall).
   */
  update(
    dt: number, elapsed: number, renderer: WebGPURenderer,
    sky?: { storm: boolean; coastal: boolean; gentle: boolean },
  ): { strike: boolean; delay: number; amount: number } {
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
      // A dark sodium night stays brown if snow only multiplies it. Lerp toward the cold tint.
      const snowLift = tmpB.copy(SNOW_TINT).multiplyScalar(0.55);
      tmpA.copy(out).lerp(snowLift, 0.85);
      out.lerp(tmpA, w.snow);
      return out;
    };
    mixSet('zenith', U.skyZenith.value as Color);
    mixSet('horizon', U.skyHorizon.value as Color);
    mixSet('fog', U.fogColor.value as Color);
    // overcast flattens the sky toward the horizon colour
    (U.skyZenith.value as Color).lerp(U.skyHorizon.value as Color, w.overcast * 0.5);

    (U.sunDir.value as Vector3).copy(sd);
    const sun = U.sunColor.value as Color;
    sun.setRGB(1, 0.86 - duskF * 0.25, 0.72 - duskF * 0.4);
    // Noon light goes cold with the sky. Dusk keeps the orange set above.
    const dayCool = smoothstep(0.55, 0.95, dayF) * (1 - duskF);
    sun.lerp(tmpB.setRGB(0.76, 0.84, 0.94), dayCool * 0.65);
    U.daylight.value = dayF * (1 - w.overcast * 0.75);
    U.night.value = night;
    // Day keeps a few windows and a dim sign. It is not night with the lights left on.
    U.windowLit.value = 0.12 + 0.88 * smoothstep(0.25, -0.05, e);
    U.signPower.value = 0.14 + 0.86 * night;
    U.time.value = elapsed % 3600;
    U.wetness.value = this.weather.wetness;
    U.rain.value = w.rain;
    U.snow.value = this.weather.snowCover;
    U.fogDensity.value = w.fog * (1 + Number(U.streetFog.value));
    U.fogFalloff.value = 1 / w.falloff;
    U.haze.value = 0.00003 + w.fog * 0.02;
    applyAirLayers(w.fog, w.layer, w.layerY, w.smogTint, night, Number(U.daylight.value));

    // Heavy rain inland keeps the old flash. The sea-wall preset replaces it with a
    // short, capped coastal flash so the two do not stack.
    let strike = false;
    let thunderDelayS = 0;
    let thunderAmt = 0;
    if (sky?.storm) {
      this.lightningT = 0;
      const flash = sampleCoastalFlash(elapsed, sky.gentle, sky.coastal);
      U.lightning.value = flash.flash;
      strike = flash.strike;
      if (strike) {
        thunderDelayS = thunderDelay(elapsed, sky.gentle);
        thunderAmt = sky.gentle ? 0.09 : 0.16;
      }
    } else {
      if (w.rain > 0.85 && Math.random() < dt * 0.04) this.lightningT = 0.35;
      this.lightningT = Math.max(0, this.lightningT - dt);
      U.lightning.value = this.lightningT > 0 ? Math.max(0, Math.sin(this.lightningT * 60)) * (this.lightningT / 0.35) : 0;
    }

    // Chromaticity stays peak-1. Lux lives on intensity. Copy the horizon before the grade is lifted into nits.
    const horizon = U.skyHorizon.value as Color;
    this.hemi.color.copy(horizon);
    const hemiPeak = Math.max(this.hemi.color.r, this.hemi.color.g, this.hemi.color.b, 1e-4);
    this.hemi.color.multiplyScalar(1 / hemiPeak);
    this.hemi.groundColor.setRGB(0.045, 0.05, 0.062).lerp(tmpB.setRGB(0.1, 0.075, 0.06), night * 0.28);
    this.hemi.intensity = skyLux(dayF, night, w.overcast) + Number(U.lightning.value) * 8000;

    this.sun.color.copy(sun);
    const sunPeak = Math.max(this.sun.color.r, this.sun.color.g, this.sun.color.b, 1e-4);
    this.sun.color.multiplyScalar(1 / sunPeak);
    if (!this.sun.castShadow) this.sun.position.copy(sd).multiplyScalar(1000);
    this.sun.intensity = sunLux(Number(U.daylight.value), w.overcast);

    const exposure = stepExposure(dt, e, w.overcast, Number(U.lightning.value));
    this.exposure = exposure;
    const lift = authoredLift(exposure);
    // The painted night grade is a mid brown. At this exposure that fills the sky slot.
    // Night keeps the hue and drops the level; day stays on the painted grade. Rain still reads fogColor.
    const nightGrade = 0.42 + 0.58 * dayF;
    (U.skyZenith.value as Color).multiplyScalar(lift * nightGrade);
    (U.skyHorizon.value as Color).multiplyScalar(lift * nightGrade);
    (U.fogColor.value as Color).multiplyScalar(lift * nightGrade);
    (U.deckColor.value as Color).multiplyScalar(lift * nightGrade);
    // Night IBL is a fraction of the exposure lift. A full lift turns the equirect into a flat colored floor.
    this.scene.environmentIntensity = (0.25 + 0.6 * dayF) * lift * (0.35 + 0.65 * dayF);
    renderer.toneMappingExposure = exposure;
    stormSnap.flash = U.lightning.value;
    return { strike, delay: thunderDelayS, amount: thunderAmt };
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
