// Top-level wiring: renderer, scene, streaming city, landmarks, traffic, atmosphere, cameras, UI, audio.
import { ACESFilmicToneMapping, MathUtils, PerspectiveCamera, RenderPipeline, Scene, Timer, Vector3, WebGPURenderer } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { params } from '../core/params';
import { autoTier, lowerTier, probeDevice, settingsFor, storedTier, storeTier, TIERS, type QualitySettings, type Tier } from '../core/quality';
import { Atmosphere } from '../atmosphere/Atmosphere';
import { Precipitation } from '../atmosphere/Precipitation';
import { WEATHER, type WeatherId } from '../atmosphere/Weather';
import { ChunkStreamer } from '../world/streaming/ChunkStreamer';
import { CityQuery } from '../world/CityQuery';
import { Landmarks } from '../world/landmarks/Landmarks';
import { localToGeo, geoToLocal } from '../world/geo';
import { SpinnerTraffic } from '../vehicles/SpinnerTraffic';
import { Input } from '../input/Input';
import { TouchControls } from '../input/TouchControls';
import { FlyController } from '../camera/FlyController';
import { WalkController } from '../camera/WalkController';
import { CinematicDirector } from '../camera/CinematicDirector';
import { CameraSystem } from '../camera/CameraSystem';
import type { ModeId, Pose } from '../camera/types';
import { Ambience } from '../audio/Ambience';
import { HUD } from '../ui/HUD';
import { UI } from '../ui/UI';
import '../districts/detail-index';

const T = TSL as any;
const DEG = Math.PI / 180;
const MODES: ModeId[] = ['fly', 'walk', 'cine'];

/** Default opening view: above Little Tokyo looking south-east toward the Wallace pyramid. */
function defaultPose(): Pose {
  const [x, z] = geoToLocal(34.0505, -118.2405);
  const [px, pz] = geoToLocal(34.005, -118.2);
  return { position: new Vector3(x, 230, z), heading: Math.atan2(px - x, -(pz - z)), pitch: -0.08 };
}

export class App {
  renderer!: WebGPURenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 60000);
  readonly query = new CityQuery();
  quality: QualitySettings;
  qualityChoice: Tier | 'auto';
  readonly autoTier: Tier;
  readonly autoReason: string;
  backend = 'unknown';

  streamer!: ChunkStreamer;
  atmosphere!: Atmosphere;
  traffic!: SpinnerTraffic;
  rain!: Precipitation;
  snow!: Precipitation;
  cams!: CameraSystem;
  input!: Input;
  touch: TouchControls | null = null;
  ui!: UI;
  hud!: HUD;
  readonly ambience = new Ambience();

  private pipeline: RenderPipeline | null = null;
  private timer = new Timer();
  private elapsed = 0;
  private frames = 0;
  private slowTime = 0;
  private started = false;
  private loadingEl = document.getElementById('loading');
  private startMs = performance.now();

  constructor(private canvas: HTMLCanvasElement) {
    const dev = probeDevice();
    const auto = autoTier(dev);
    this.autoTier = auto.tier;
    this.autoReason = auto.reason;
    const urlTier = (TIERS as string[]).includes(params.quality ?? '') ? (params.quality as Tier) : null;
    this.qualityChoice = urlTier ?? storedTier();
    this.quality = settingsFor(this.qualityChoice === 'auto' ? auto.tier : this.qualityChoice);
  }

  async init(): Promise<void> {
    // Pick the backend up front: reversed-Z is only safe on WebGPU (on the WebGL2 fallback it breaks the
    // MSAA depth blit used by post-processing), and WebGL2 compensates with an adaptive near plane.
    let webgpu = !params.forceWebGL && 'gpu' in navigator;
    if (webgpu) {
      try {
        webgpu = !!(await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter());
      } catch {
        webgpu = false;
      }
    }
    const r = (this.renderer = new WebGPURenderer({
      canvas: this.canvas,
      antialias: this.quality.antialias,
      forceWebGL: !webgpu,
      reversedDepthBuffer: webgpu,
      powerPreference: 'high-performance',
    }));
    await r.init();
    this.backend = (r.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2';
    r.toneMapping = ACESFilmicToneMapping;
    r.setPixelRatio(Math.min(devicePixelRatio, this.quality.pixelRatio));
    r.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();

    const weather = (params.weather && params.weather in WEATHER ? params.weather : 'rain') as WeatherId;
    this.atmosphere = new Atmosphere(this.scene, { hours: params.time ?? 22, weather });
    if (params.freeze) {
      this.atmosphere.dayNight.frozen = true;
      this.atmosphere.weather.frozen = true;
    }

    this.streamer = new ChunkStreamer(this.scene, this.quality);
    const landmarks = new Landmarks(this.query);
    this.scene.add(landmarks.root);
    this.traffic = new SpinnerTraffic(this.scene, this.query, settingsFor('ultra').traffic);
    const ultra = settingsFor('ultra');
    this.rain = new Precipitation('rain', ultra.rainCount);
    this.snow = new Precipitation('snow', ultra.snowCount);
    this.scene.add(this.rain.mesh, this.snow.mesh);

    this.input = new Input(this.canvas);
    if (TouchControls.wanted()) this.touch = new TouchControls(this.input.touch);
    this.hud = new HUD(params.hud);

    const fly = new FlyController(this.camera, this.input, this.query, this.scene);
    const walk = new WalkController(this.camera, this.input, this.query);
    const cine = new CinematicDirector(this.camera, this.query, this.traffic, (v) => this.ui?.fade(v));

    const urlMode = MODES.includes(params.mode as ModeId) ? (params.mode as ModeId) : null;
    const showTitle = !urlMode && params.ui;
    const startMode: ModeId = urlMode ?? 'cine';
    this.cams = new CameraSystem(fly, walk, cine, startMode, this.initialPose());
    this.cams.onChange = (m) => {
      this.ui.setMode(m);
      this.touch?.setMode(m);
    };

    this.ui = new UI(
      {
        setMode: (m) => this.cams.setMode(m),
        setQuality: (t) => this.setQuality(t),
        toggleHUD: () => this.hud.toggle(),
        toggleSound: () => {
          this.ambience.start();
          this.ambience.setMuted(!this.ambience.muted);
          return !this.ambience.muted;
        },
        setWeather: (w) => this.atmosphere.weather.set(w),
        setTime: (h) => (this.atmosphere.dayNight.hours = h),
        nextShot: () => this.cams.cine.cut(),
        start: (m) => {
          this.ambience.start();
          this.started = true;
          this.cams.setMode(m);
        },
      },
      { show: params.ui, quality: this.qualityChoice, autoTier: this.autoTier, showTitle },
    );
    this.ui.setMode(startMode);
    this.touch?.setMode(showTitle ? 'cine' : startMode);
    this.started = !showTitle;

    const unlockAudio = () => {
      this.ambience.start();
      removeEventListener('pointerdown', unlockAudio);
      removeEventListener('keydown', unlockAudio);
    };
    addEventListener('pointerdown', unlockAudio);
    addEventListener('keydown', unlockAudio);
    addEventListener('resize', () => this.resize());

    this.buildPipeline();
    this.timer.connect(document);
    r.setAnimationLoop((t) => this.frame(t));
  }

  private initialPose(): Pose {
    const p = defaultPose();
    if (params.at) {
      const l = this.query.layout.landmarkById(params.at);
      const poi = this.query.layout.poiById(params.at);
      if (l) {
        const dist = Math.max(l.height * 1.4, 600);
        p.position.set(l.x - dist * 0.7, Math.max(150, l.height * 0.45), l.z + dist * 0.7);
        p.heading = Math.atan2(l.x - p.position.x, -(l.z - p.position.z));
        p.pitch = 0;
      } else if (poi) {
        p.position.set(poi.x, 60, poi.z);
      }
    }
    if (params.x !== undefined) p.position.x = params.x;
    if (params.z !== undefined) p.position.z = params.z;
    if (params.y !== undefined) p.position.y = params.y;
    if (params.yaw !== undefined) p.heading = params.yaw * DEG;
    if (params.pitch !== undefined) p.pitch = params.pitch * DEG;
    return p;
  }

  private buildPipeline(): void {
    this.pipeline?.dispose();
    this.pipeline = null;
    if (!this.quality.bloom) return;
    const scenePass = T.pass(this.scene, this.camera);
    const color = scenePass.getTextureNode('output');
    const glow = bloom(color, 0.4, 0.3, 1.0);
    this.pipeline = new RenderPipeline(this.renderer, color.add(glow));
  }

  setQuality(choice: Tier | 'auto'): void {
    this.qualityChoice = choice;
    storeTier(choice);
    this.applyTier(choice === 'auto' ? this.autoTier : choice);
    this.ui.setQualityValue(choice);
  }

  private applyTier(tier: Tier): void {
    const had = this.quality.bloom;
    this.quality = settingsFor(tier);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.quality.pixelRatio));
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.streamer.setQuality(this.quality);
    if (had !== this.quality.bloom) this.buildPipeline();
    this.slowTime = 0;
  }

  private resize(): void {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight, false);
  }

  private handleKeys(): void {
    const k = this.input;
    if (k.wasPressed('Digit1')) this.cams.setMode('fly');
    if (k.wasPressed('Digit2')) this.cams.setMode('walk');
    if (k.wasPressed('Digit3')) this.cams.setMode('cine');
    if (k.wasPressed('KeyF')) this.cams.setMode(this.cams.mode === 'fly' ? 'walk' : 'fly');
    if (k.wasPressed('KeyN') && this.cams.mode === 'cine') this.cams.cine.cut();
    if (k.wasPressed('KeyH')) this.hud.toggle();
    if (k.wasPressed('KeyM')) {
      this.ambience.start();
      this.ambience.setMuted(!this.ambience.muted);
    }
    if (k.wasPressed('BracketLeft')) this.atmosphere.dayNight.hours = (this.atmosphere.dayNight.hours + 23) % 24;
    if (k.wasPressed('BracketRight')) this.atmosphere.dayNight.hours = (this.atmosphere.dayNight.hours + 1) % 24;
    if (k.wasPressed('KeyB')) this.atmosphere.weather.next();
  }

  /** Automatic downgrade when the auto tier turns out too ambitious (sustained < 24 fps). */
  private adaptQuality(dt: number): void {
    if (this.qualityChoice !== 'auto' || this.elapsed < 12 || this.quality.tier === 'low') return;
    this.slowTime = this.hud.fps < 24 ? this.slowTime + dt : Math.max(0, this.slowTime - dt * 2);
    if (this.slowTime > 6) {
      const t = lowerTier(this.quality.tier);
      this.applyTier(t);
      this.ui.flash(`Quality lowered to ${t} to keep things smooth`);
    }
  }

  private frame(time: number): void {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.1);
    this.elapsed += dt;
    this.frames++;

    this.touch?.update();
    if (this.started) this.handleKeys();
    this.cams.update(dt);

    const cam = this.camera.position;
    const foci = [cam];
    if (this.cams.mode === 'cine' && this.cams.cine.prefetch) foci.push(this.cams.cine.prefetch);
    this.streamer.update(foci);
    this.traffic.update(dt, this.camera, this.quality.traffic);
    this.atmosphere.update(dt, this.elapsed, this.renderer);

    const ground = this.query.groundHeight(cam.x, cam.z);
    const alt = cam.y - ground;
    // depth precision fallback when reversed-Z is unavailable (WebGL2 without EXT_clip_control)
    const near = this.renderer.reversedDepthBuffer ? 0.1 : MathUtils.clamp(alt * 0.004, 0.15, 6);
    if (Math.abs(near - this.camera.near) > 0.01) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }

    const w = this.atmosphere.weather;
    const aboveClouds = MathUtils.clamp(1 - (cam.y - 1400) / 600, 0, 1);
    this.rain.update(dt, cam, w.params.rain * aboveClouds, w.params.wind, w.windDir, this.quality.rainCount);
    this.snow.update(dt, cam, w.params.snow * aboveClouds, w.params.wind, w.windDir, this.quality.snowCount);
    this.ambience.update(w.params.rain, w.params.snow, w.params.wind, alt);

    if (this.pipeline) this.pipeline.render();
    else this.renderer.render(this.scene, this.camera);

    this.hud.tick(dt, () => this.hudLines(alt));
    this.adaptQuality(dt);
    this.input.endFrame();

    if (this.loadingEl && (this.streamer.isIdle() || performance.now() - this.startMs > 8000) && this.frames > 5) {
      this.loadingEl.remove();
      this.loadingEl = null;
    }
  }

  private hudLines(alt: number): Array<[string, string | number]> {
    const info = this.renderer.info.render;
    const s = this.streamer.stats;
    const p = this.camera.position;
    const [lat, lon] = localToGeo(p.x, p.z);
    const d = this.query.district(p.x, p.z);
    const a = this.atmosphere;
    return [
      ['gpu', `${this.backend} · ${this.quality.tier}${this.qualityChoice === 'auto' ? ' (auto)' : ''} · dpr ${this.renderer.getPixelRatio().toFixed(2)}`],
      ['draw', `${info.drawCalls} calls · ${(info.triangles / 1e6).toFixed(2)} M tris`],
      ['chunks', `far ${s.supersFar} · near ${s.chunksNear} · lod0 ${s.lod0} · jobs ${s.inFlight} · queue ${s.readyQueue} · gen ${s.lastGenMs.toFixed(0)} ms`],
      ['pos', `${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)} m · ${alt.toFixed(0)} m AGL`],
      ['geo', `${lat.toFixed(4)}, ${lon.toFixed(4)}`],
      ['district', `${d.name} (stage ${d.stage})`],
      ['sky', `${a.dayNight.label} · ${a.weather.label} · wet ${a.weather.wetness.toFixed(2)}`],
      ['mode', this.cams.mode === 'cine' ? `cinematic · ${this.cams.cine.label}` : this.cams.mode],
    ];
  }

  /** Debug / automation hooks (screenshots, console). */
  debugApi() {
    return {
      app: this,
      isIdle: () => this.frames > 10 && this.streamer.isIdle(),
      setMode: (m: ModeId) => this.cams.setMode(m),
      setPose: (x: number, y: number, z: number, yawDeg = 0, pitchDeg = 0) =>
        this.cams.setPose({ position: new Vector3(x, y, z), heading: yawDeg * DEG, pitch: pitchDeg * DEG }),
      setTime: (h: number) => (this.atmosphere.dayNight.hours = h),
      setWeather: (w: WeatherId, instant = true) => this.atmosphere.weather.set(w, instant),
      cut: () => this.cams.cine.cut(),
      holdShot: (on: boolean) => (this.cams.cine.hold = on),
      /** Walk mode on the centre line of the street nearest to (x, z) or to a landmark/POI id, facing along it. */
      streetView: (target: string | number, zArg = 0, along = 0) => {
        let x = typeof target === 'number' ? target : 0, z = zArg;
        if (typeof target === 'string') {
          const p = this.query.layout.poiById(target) ?? this.query.layout.landmarkById(target);
          if (!p) return false;
          x = p.x;
          z = p.z;
        }
        let best = null as null | ReturnType<CityQuery['fabricAt']>['blocks'][number];
        let bd = Infinity;
        for (const b of this.query.fabricAt(x, z).blocks) {
          const d = Math.hypot(b.cx - x, b.cz - z);
          if (d < bd) { bd = d; best = b; }
        }
        if (!best) return false;
        const off = best.la / 2 + best.street / 2;
        const px = best.cx + best.ax * off + best.bx * along, pz = best.cz + best.az * off + best.bz * along;
        this.cams.setMode('walk');
        this.cams.setPose({ position: new Vector3(px, best.ground + 2, pz), heading: Math.atan2(best.bx, -best.bz), pitch: 0.05 });
        return true;
      },
      geoToLocal,
      stats: () => ({ ...this.streamer.stats, fps: this.hud.fps, backend: this.backend, tier: this.quality.tier, mode: this.cams.mode, shot: this.cams.cine.label }),
    };
  }
}
