// Shared photo-mode types. The module stays out of the first-load graph; App imports it dynamically.
import type { PerspectiveCamera, Scene, WebGPURenderer } from 'three/webgpu';
import type { Weather } from '../atmosphere/Weather';
import type { DayNight } from '../atmosphere/Atmosphere';
import type { Ambience } from '../audio/Ambience';
import type { Input } from '../input/Input';
import type { ModeId } from '../camera/types';
import type { Tier } from '../core/quality';
import type { CityLayout } from '../world/layout';
import type { CityQuery } from '../world/CityQuery';

export type GradeId = 'plain' | 'sodium' | 'neon' | 'ash' | 'harbor' | 'orange' | 'cyan' | 'amber';
export type LetterboxId = 'off' | '16:9' | '2.39' | '9:19.5' | '1:1';
export type CaptureKind = 'screen' | '1080' | '1440' | 'wallpaper';
export type SaveMethod = 'share' | 'download' | 'tab' | 'overlay';

export interface CaptureRequest {
  kind?: CaptureKind;
  /** File is exactly this size. The framed shot is matted inside it. */
  exact?: { w: number; h: number };
  /** When false, encode the file and keep it on `lastImage` without a share sheet or download. */
  present?: boolean;
}

export interface CaptureResult {
  ok: boolean;
  width: number;
  height: number;
  kind: string;
  ms: number;
  renderMs: number;
  tiles: number;
  bytes: number;
  heapBefore: number | null;
  heapPeak: number | null;
  method: SaveMethod | 'none';
  /** True when drawImage of the canvas came back empty and the tile was read back from the GPU. */
  readback: boolean;
  capped: boolean;
  filename: string;
  center: [number, number, number, number];
  error?: string;
}

export interface PhotoState {
  focal: number;
  focus: number;
  aperture: number;
  /** f-number. Wide open is 1.4. The aperture slider is the same control, stored both ways. */
  fStop: number;
  /** 0 is a round iris. 1 is a 2× squeeze: oval bokeh, horizontal flare, edge fringing. */
  anamorphic: number;
  /** 0 locks the shutter. 1 is the longest smear this tier allows. */
  motion: number;
  roll: number;
  exposure: number;
  grade: GradeId;
  grain: number;
  vignette: number;
  bloom: number;
  letterbox: LetterboxId;
  rain: number;
  fog: number;
  snow: number;
  hours: number;
  orbit: boolean;
  /** Continuous autofocus on the centre of the frame. A tap sets the distance and turns this off. */
  autofocus: boolean;
  /** When false, the photo bar hides. Letterbox mattes stay. */
  chrome: boolean;
  guide: 'off' | 'left' | 'right';
  size: CaptureKind;
  postcard: string;
}

/** What App hands the lazy module. No photo code runs until this is constructed. */
export interface PhotoHost {
  camera: PerspectiveCamera;
  scene: Scene;
  renderer: WebGPURenderer;
  canvas: HTMLCanvasElement;
  input: Input;
  ambience: Ambience;
  weather: Weather;
  dayNight: DayNight;
  layout: CityLayout;
  query: CityQuery;
  tier: () => Tier;
  backend: () => string;
  exposure: () => number;
  lock: (on: boolean) => void;
  mode: () => ModeId;
  flash: (html: string) => void;
  restoreView: (fov: number) => void;
}
