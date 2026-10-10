// Street-level city sound. The frame loop already calls update(); districts register
// through registerDistrictAudio and never add a branch in App.ts.
import type { Ambience } from './Ambience';
import { CitySound } from './CitySound';

export class MarketAudio {
  private readonly city: CitySound;

  constructor(ambience: Ambience) {
    this.city = new CitySound(ambience);
    const w = window as unknown as { __nlaAudio?: { capture: () => Promise<CaptureFile[]> } };
    w.__nlaAudio = {
      capture: () => import('./capture').then((m) => m.captureScenes()),
    };
  }

  get voices(): number {
    return this.city.voices;
  }

  get voiceCap(): number {
    return this.city.voiceCap;
  }

  get districtId(): string {
    return this.city.districtId;
  }

  update(
    cam: { x: number; y: number; z: number },
    forward: { x: number; y: number; z: number },
    up: { x: number; y: number; z: number },
    rain: number,
    inMarket: boolean,
    alt: number,
    sizzleAt: { x: number; y: number; z: number } | null,
    spinnerAt: { x: number; y: number; z: number; dist: number; closing?: number; heavy?: boolean } | null,
  ): void {
    this.city.update(cam, forward, up, rain, inMarket, alt, sizzleAt, spinnerAt);
  }
}

export interface CaptureFile {
  id: string;
  peak: number;
  rms: number;
  wav: string;
}
