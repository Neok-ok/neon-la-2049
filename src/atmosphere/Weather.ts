// Self-driving weather state machine (Markov chain with timed, cross-faded transitions).
import { Rng, trueRandomSeed } from '../core/rng';

export type WeatherId = 'clear' | 'overcast' | 'drizzle' | 'rain' | 'downpour' | 'fog' | 'smog' | 'snow' | 'sleet';

export interface WeatherParams {
  rain: number; // 0..1 particle intensity
  snow: number; // 0..1
  fog: number; // fog density at ground (1/m)
  falloff: number; // fog height scale (m)
  wind: number; // m/s
  overcast: number; // 0..1 sun blocking
  smogTint: number; // 0 grey .. 1 orange-brown
  wetTarget: number; // equilibrium wetness
}

interface WeatherDef extends WeatherParams {
  label: string;
  dur: [number, number]; // seconds of real time
  next: Partial<Record<WeatherId, number>>;
}

export const WEATHER: Record<WeatherId, WeatherDef> = {
  clear: { label: 'Dry smog haze', rain: 0, snow: 0, fog: 0.0007, falloff: 600, wind: 2, overcast: 0.45, smogTint: 0.5, wetTarget: 0.15, dur: [240, 600], next: { overcast: 0.4, smog: 0.25, drizzle: 0.2, fog: 0.15 } },
  overcast: { label: 'Overcast', rain: 0, snow: 0, fog: 0.001, falloff: 450, wind: 4, overcast: 0.8, smogTint: 0.25, wetTarget: 0.35, dur: [150, 360], next: { drizzle: 0.35, rain: 0.25, clear: 0.2, fog: 0.1, snow: 0.1 } },
  drizzle: { label: 'Drizzle', rain: 0.3, snow: 0, fog: 0.0013, falloff: 420, wind: 3, overcast: 0.85, smogTint: 0.2, wetTarget: 0.75, dur: [120, 300], next: { rain: 0.45, overcast: 0.25, fog: 0.15, sleet: 0.15 } },
  rain: { label: 'Rain', rain: 0.65, snow: 0, fog: 0.0016, falloff: 380, wind: 5, overcast: 0.9, smogTint: 0.2, wetTarget: 1, dur: [180, 420], next: { downpour: 0.3, drizzle: 0.35, overcast: 0.2, sleet: 0.15 } },
  downpour: { label: 'Heavy rain', rain: 1, snow: 0, fog: 0.0024, falloff: 340, wind: 9, overcast: 0.95, smogTint: 0.15, wetTarget: 1, dur: [90, 240], next: { rain: 0.7, drizzle: 0.3 } },
  fog: { label: 'Thick fog', rain: 0, snow: 0, fog: 0.0042, falloff: 220, wind: 1, overcast: 0.9, smogTint: 0.1, wetTarget: 0.6, dur: [150, 360], next: { overcast: 0.4, drizzle: 0.3, clear: 0.2, smog: 0.1 } },
  smog: { label: 'Toxic smog', rain: 0, snow: 0, fog: 0.0026, falloff: 300, wind: 1.5, overcast: 0.75, smogTint: 1, wetTarget: 0.25, dur: [150, 360], next: { clear: 0.4, overcast: 0.3, fog: 0.3 } },
  snow: { label: 'Snow', rain: 0, snow: 0.85, fog: 0.0022, falloff: 380, wind: 3, overcast: 0.9, smogTint: 0, wetTarget: 0.5, dur: [180, 420], next: { sleet: 0.3, overcast: 0.4, fog: 0.3 } },
  sleet: { label: 'Rain & snow', rain: 0.45, snow: 0.5, fog: 0.0019, falloff: 380, wind: 5, overcast: 0.9, smogTint: 0.05, wetTarget: 0.9, dur: [120, 300], next: { snow: 0.3, rain: 0.4, drizzle: 0.3 } },
};

const KEYS: (keyof WeatherParams)[] = ['rain', 'snow', 'fog', 'falloff', 'wind', 'overcast', 'smogTint', 'wetTarget'];

export class Weather {
  current: WeatherId;
  target: WeatherId;
  blend = 1; // 0..1 progress from current -> target
  blendTime = 45;
  timeLeft: number;
  frozen = false;
  readonly params: WeatherParams;
  wetness = 0.85;
  snowCover = 0;
  windDir = Math.random() * Math.PI * 2;
  private rng = new Rng(trueRandomSeed());

  constructor(initial: WeatherId = 'rain') {
    this.current = this.target = initial;
    this.timeLeft = this.rng.range(...WEATHER[initial].dur);
    this.params = { ...WEATHER[initial] };
    this.wetness = WEATHER[initial].wetTarget;
    if (initial === 'snow') this.snowCover = 0.7;
  }

  /** Jump to a state (debug / URL). `instant` skips the cross-fade. */
  set(id: WeatherId, instant = false): void {
    if (instant) {
      this.current = this.target = id;
      this.blend = 1;
      Object.assign(this.params, pickParams(WEATHER[id]));
      this.wetness = Math.max(this.wetness, WEATHER[id].wetTarget * 0.9);
      if (id === 'snow') this.snowCover = Math.max(this.snowCover, 0.6);
    } else {
      this.current = this.blend < 1 ? this.target : this.current;
      this.target = id;
      this.blend = 0;
    }
    this.timeLeft = this.rng.range(...WEATHER[id].dur);
  }

  next(): void {
    const opts = Object.entries(WEATHER[this.target].next) as [WeatherId, number][];
    let r = this.rng.next() * opts.reduce((a, [, w]) => a + w, 0);
    for (const [id, w] of opts) {
      if ((r -= w) <= 0) return this.set(id);
    }
    this.set(opts[0][0]);
  }

  update(dt: number): void {
    if (!this.frozen) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0 && this.blend >= 1) this.next();
    }
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / this.blendTime);
      if (this.blend >= 1) this.current = this.target;
    }
    const a = WEATHER[this.current], b = WEATHER[this.target];
    const t = smooth(this.blend);
    for (const k of KEYS) this.params[k] = a[k] + (b[k] - a[k]) * t;

    // surface state integrates slowly
    const p = this.params;
    const wetRate = p.rain > 0.05 ? 0.02 + p.rain * 0.05 : 0.004;
    this.wetness += (p.wetTarget - this.wetness) * Math.min(1, wetRate * dt);
    const snowTarget = p.snow > 0.2 ? 1 : 0;
    const snowRate = snowTarget ? 0.006 * p.snow : 0.003 + p.rain * 0.02;
    this.snowCover += (snowTarget - this.snowCover) * Math.min(1, snowRate * dt);
    this.windDir += (Math.sin(performance.now() * 0.00003) * 0.02) * dt;
  }

  get label(): string {
    return this.blend < 1 ? `${WEATHER[this.current].label} → ${WEATHER[this.target].label}` : WEATHER[this.current].label;
  }
}

function pickParams(d: WeatherDef): WeatherParams {
  const o = {} as WeatherParams;
  for (const k of KEYS) o[k] = d[k];
  return o;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
