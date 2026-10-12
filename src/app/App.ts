// Top-level wiring: renderer, scene, streaming city, landmarks, traffic, atmosphere, cameras, UI, audio.
import { MathUtils, NoToneMapping, PerspectiveCamera, Scene, Timer, Vector2, Vector3, WebGPURenderer } from 'three/webgpu';
import { params } from '../core/params';
import { autoTier, probeDevice, settingsFor, stepAutoGuard, storedTier, storeTier, TIERS, type QualitySettings, type Tier } from '../core/quality';
import { Atmosphere } from '../atmosphere/Atmosphere';
import { setCityWindowDetail } from '../world/materials/cityMaterial';
import { atlasMode, prepareAtlases } from '../world/materials/compressedAtlases';
import { applyWindowTier, windowState } from '../world/windows/state';
import { placeWindowHeroes } from '../world/windows/heroes';
import { windowsApi } from '../world/windows/api';
import { Precipitation } from '../atmosphere/Precipitation';
import { WEATHER, type WeatherId } from '../atmosphere/Weather';
import { ChunkStreamer, type StreamPolicy } from '../world/streaming/ChunkStreamer';
import {
  PRESSURE_REST, SSE_THRESHOLD, detectBudget, jsHeapLimit, mountMemoryOverlay, readGpuLimits,
  readUaHints, refineBudget, resources, startupProbe, stepGovernor,
  type MemoryBudget, type Pressure,
} from '../core/memory';
import { CityQuery } from '../world/CityQuery';
import { Landmarks } from '../world/landmarks/Landmarks';
import { localToGeo, geoToLocal } from '../world/geo';
import { LaneTraffic } from '../vehicles/LaneTraffic';
import { GroundTraffic } from '../vehicles/groundTraffic';
import { trafficCamera, type TrafficView } from '../vehicles/trafficView';
import { megaCamera, type MegaView } from '../districts/financial-megatowers/view';
import { dtlaCamera, type DtlaView } from '../districts/dtla/view';
import { installDtlaHolos } from '../districts/dtla/holos';
import { civicCamera, type CivicView } from '../districts/civic-center/view';
import { inLapdLobby, lapdLobbyLooksIn } from '../districts/civic-center/shelter';
import { broadwayCamera, type BroadwayView } from '../districts/historic-core/view';
import { interiorCamera, type InteriorView } from '../districts/historic-core/interior';
import { kCamera, type KView } from '../districts/k-megablock/view';
import type { LakewoodView } from '../districts/lakewood-megablocks/view';
import type { SouthLaView } from '../districts/south-la-megablocks/view';
import { artsCamera, type ArtsView } from '../districts/arts-district/view';
import type { WestsideView } from '../districts/westside/view';
import type { BasinView } from '../districts/basin-sprawl/view';
import type { SoutheastView } from '../districts/southeast-industrial/view';
import type { HollywoodView } from '../districts/hollywood/view';
import type { LaxView } from '../districts/lax-spaceport/view';
import type { SouthBayView } from '../districts/south-bay-refineries/view';
import type { HarborView } from '../districts/harbor/view';
import type { LongBeachView } from '../districts/long-beach/view';
import type { EastLaView } from '../districts/east-la/view';
import {
  farDistrictsPromise, farDistrictsReady, farGantryTris, farLaunchPad, farLaunchPhase,
  mountFarDistricts, requestFarLaunch, sampleFarFrame,
} from './farDistricts';
import { setRefineryFlame } from '../districts/_shared/refinery/flames';
import { installArtsHolos } from '../districts/arts-district/holos';
import { sampleDistrictLook } from '../atmosphere/districtLook';
import '../atmosphere/looks';
import { setAirSample, setAirTier, airFlags } from '../atmosphere/airState';
import { AirField, shaftCapFor, type GlowMark } from '../atmosphere/AirField';
import { fillEmptyAirLights } from '../atmosphere/airLights';
import {
  allLights, disposeLightingPipeline, ephemeralLights, lightCensus, lightingStats, lockExposureEv, parseTone, rebuildLightingPipeline,
  releaseLightingTierTargets, rendererTone, setEphemeral, syncLighting, type ToneId,
} from '../lighting';
import { wallaceCamera, type WallaceView } from '../districts/wallace-vernon/view';
import { updateWallace } from '../districts/wallace-vernon/live';
import { wallaceFaceSectorCount } from '../districts/wallace-vernon/faceDetail';
import { coastCamera, type CoastView } from '../districts/coastal-strip/view';
import { coastImpact, coastSegmentCount, installCoast, updateCoast } from '../districts/coastal-strip/live';
import { applyStormTint, coastWorkLights, resolveStorm, stormCtl, stormSnap } from '../districts/coastal-strip/storm';
import { installInteriors } from '../districts/interior-index';
import { InteriorSystem } from '../world/interiors';
import { installCivicHolos } from '../districts/civic-center/holos';
import { SpinnerTraffic } from '../vehicles/SpinnerTraffic';
import { Input } from '../input/Input';
import { TouchControls } from '../input/TouchControls';
import { FlyController } from '../camera/FlyController';
import { WalkController } from '../camera/WalkController';
import { CinematicDirector } from '../camera/CinematicDirector';
import { CameraSystem } from '../camera/CameraSystem';
import type { ModeId, Pose } from '../camera/types';
import type { PhotoMode } from '../photo/PhotoMode';
import { createPlayLens, type PlayLens } from '../photo/playLens';
import { CAPTURE_CAPS, lensBudgetScale } from '../photo/limits';
import { setDisturbance } from '../camera/disturbance';
import { formatFStop } from '../camera/lensModel';
import type { PhotoHost } from '../photo/types';
import { U } from '../atmosphere/uniforms';
import { GroundHaze } from '../atmosphere/GroundHaze';
import { WetReflector } from '../atmosphere/WetReflector';
import { cameraOverRoad } from '../roads/mirror';
import { roadPoses } from '../roads/report';
import { prepareRoadTextures, roadTexturesReady } from '../roads/textures';
import { Ambience } from '../audio/Ambience';
import { MarketAudio } from '../audio/MarketAudio';
import { HUD } from '../ui/HUD';
import { UI } from '../ui/UI';
import { CrowdField } from '../districts/little-tokyo-market/crowd';
import { marketCamera, type MarketView } from '../districts/little-tokyo-market/view';
import { marketSpots } from '../districts/little-tokyo-market/spots';
import { setSeats } from '../world/seats';
import { HologramField, hologramById, installShowcase } from '../world/holograms/api';
import '../districts/detail-index';

const DEG = Math.PI / 180;
const MODES: ModeId[] = ['fly', 'walk', 'cine'];

/** Opening seat above the inversion: Little Tokyo azimuth, nose on the pyramid's lower tiers. */
function defaultPose(): Pose {
  const [x, z] = geoToLocal(34.0505, -118.2405);
  const [px, pz] = geoToLocal(34.005, -118.2);
  const dist = Math.hypot(px - x, pz - z) || 1;
  const y = 540;
  const pitch = Math.atan2(1100 - y, dist);
  return { position: new Vector3(x, y, z), heading: Math.atan2(px - x, -(pz - z)), pitch };
}

export class App {
  renderer!: WebGPURenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 60000);
  readonly query = new CityQuery();
  quality: QualitySettings;
  budget: MemoryBudget;
  qualityChoice: Tier | 'auto';
  readonly autoTier: Tier;
  readonly autoReason: string;
  backend = 'unknown';

  streamer!: ChunkStreamer;
  atmosphere!: Atmosphere;
  traffic!: SpinnerTraffic;
  lanes!: LaneTraffic;
  ground!: GroundTraffic;
  rain!: Precipitation;
  snow!: Precipitation;
  cams!: CameraSystem;
  input!: Input;
  touch: TouchControls | null = null;
  ui!: UI;
  hud!: HUD;
  readonly ambience = new Ambience();
  readonly marketAudio: MarketAudio;
  readonly crowd = new CrowdField();
  holos!: HologramField;
  landmarks!: Landmarks;
  interiors!: InteriorSystem;
  readonly haze = new GroundHaze();
  readonly air = new AirField(this.scene);
  readonly wet: WetReflector;
  private readonly software: boolean;
  private lastCam = new Vector3();

  private pipeline: ReturnType<typeof rebuildLightingPipeline> = null;
  private playLens: PlayLens | null = null;
  private readonly lensSize = new Vector2();
  private ratioKey = '';
  private ratioCached = 0;
  private tone: ToneId = 'agx';
  private readonly signGlows: GlowMark[] = [];
  private readonly sunScratch = new Vector3();
  private timer = new Timer();
  private elapsed = 0;
  private frames = 0;
  private slowMs = 0;
  private sessionWorstMs = 0;
  private loopStart = 0;
  private boot = { initMs: 0, firstFrameMs: 0, interactiveMs: 0, farMs: 0 };
  private farHooked = false;
  private farApplied = false;
  private wallaceLm: { x: number; z: number; reserveRadius: number } | null | undefined;
  private started = false;
  private photoMod: PhotoMode | null = null;
  private photoGate: Promise<PhotoMode> | null = null;
  private captureLock = false;
  private pressure: Pressure = { ...PRESSURE_REST };
  private pixelScale = 1;
  private exteriorSuspended = false;
  private spinnerWasVisible = false;
  private loadingEl = document.getElementById('loading');
  private startMs = performance.now();

  constructor(private canvas: HTMLCanvasElement) {
    const dev = probeDevice();
    this.software = /swiftshader|llvmpipe|software|basic render/.test(dev.gpu.toLowerCase());
    const auto = autoTier(dev);
    this.autoTier = auto.tier;
    this.autoReason = auto.reason;
    const urlTier = (TIERS as string[]).includes(params.quality ?? '') ? (params.quality as Tier) : null;
    this.qualityChoice = urlTier ?? storedTier();
    this.quality = settingsFor(this.qualityChoice === 'auto' ? auto.tier : this.qualityChoice);
    const probe = startupProbe();
    this.budget = detectBudget({
      device: dev,
      limits: readGpuLimits(),
      heapLimit: jsHeapLimit(),
      override: params.budget,
      probeMs: probe.allocMs,
    });
    this.marketAudio = new MarketAudio(this.ambience);
    this.wet = new WetReflector(this.scene);
  }

  async init(): Promise<void> {
    const hints = await readUaHints();
    if (hints.platform || hints.model) {
      this.budget = detectBudget({
        device: probeDevice(),
        limits: this.budget.limits,
        heapLimit: jsHeapLimit(),
        override: params.budget,
        uaPlatform: hints.platform,
        uaModel: hints.model,
      });
    }
    this.budget = await refineBudget(this.budget);
    const windows = applyWindowTier(this.quality.tier);
    setCityWindowDetail(windows.detail);
    placeWindowHeroes(this.query.layout);
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
    await prepareAtlases(r, { preferCompressed: this.budget.deviceClass !== 'desktop' });
    await prepareRoadTextures(r, this.quality.tier);
    this.tone = parseTone(params.tonemap);
    if (params.ev !== undefined) lockExposureEv(params.ev);
    r.toneMapping = rendererTone(this.tone);
    this.applyPixelRatio();
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();

    const weather = (params.weather && params.weather in WEATHER ? params.weather : 'rain') as WeatherId;
    this.atmosphere = new Atmosphere(this.scene, { hours: params.time ?? 22, weather });
    if (params.freeze) {
      this.atmosphere.dayNight.frozen = true;
      this.atmosphere.weather.frozen = true;
    }
    if (params.flash === 'full') stormCtl.gentle = false;

    this.streamer = new ChunkStreamer(this.scene, this.quality);
    this.landmarks = new Landmarks(this.query);
    this.scene.add(this.landmarks.root);
    installCoast(this.scene, this.query, this.quality.tier);
    installShowcase(this.query.layout);
    installDtlaHolos(this.query.layout);
    installCivicHolos(this.query.layout);
    installArtsHolos(this.query.layout);
    this.holos = new HologramField(this.query.layout);
    this.scene.add(this.holos.group);
    this.traffic = new SpinnerTraffic(this.scene, this.query, settingsFor('ultra').traffic);
    this.lanes = new LaneTraffic(this.scene, this.query, settingsFor('ultra').laneTraffic);
    this.ground = new GroundTraffic(this.scene, this.query, settingsFor('ultra').groundTraffic, settingsFor('ultra').freewayTraffic);
    const ultra = settingsFor('ultra');
    this.rain = new Precipitation('rain', ultra.rainCount);
    this.snow = new Precipitation('snow', ultra.snowCount);
    this.scene.add(this.rain.mesh, this.snow.mesh, this.crowd.mesh, this.haze.group);
    installInteriors();
    this.interiors = new InteriorSystem(this.scene, this.query, this.quality.tier);
    this.interiors.setExteriorListener((suspended) => { this.exteriorSuspended = suspended; });
    this.hookFar();

    const spots = marketSpots(this.query.layout);
    setSeats([...(spots.noodle?.seats ?? []), ...(spots.bibi?.seats ?? [])]);

    this.input = new Input(this.canvas);
    if (TouchControls.wanted()) this.touch = new TouchControls(this.input.touch);
    this.hud = new HUD(params.hud);

    const fly = new FlyController(this.camera, this.input, this.query, this.scene, this.quality.tier);
    fly.blocksExtra = (x, y, z) => this.interiors.blocksFly(x, y, z);
    this.interiors.bind({
      toggle: [this.streamer.root, this.holos.group, this.crowd.mesh, ...this.traffic.nodes, ...this.ground.nodes],
      suppress: [this.rain.mesh, this.snow.mesh, this.haze.group, this.wet.mesh, this.air.glowMesh, this.air.breathMesh, ...this.lanes.nodes, fly.spinner],
      landmarks: this.landmarks.root,
    });
    const walk = new WalkController(this.camera, this.input, this.query);
    walk.spawnHook = (x, y, z) => this.interiors.walkHandoff(x, y, z);
    const cine = new CinematicDirector(this.camera, this.query, this.traffic, (v) => this.ui?.fade(v));

    const urlMode = MODES.includes(params.mode as ModeId) ? (params.mode as ModeId) : null;
    const showTitle = !urlMode && params.ui;
    const startMode: ModeId = urlMode ?? 'cine';
    const startPose = this.initialPose();
    await this.query.prime(startPose.position.x, startPose.position.z);
    this.cams = new CameraSystem(fly, walk, cine, startMode, startPose);
    this.cams.onChange = (m) => {
      this.ui.setMode(m);
      this.touch?.setMode(m);
      if (m !== 'cine') this.releasePlayLens();
      this.applyPixelRatio();
    };
    if (startMode === 'cine') this.applyPixelRatio();

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
        setGentleFlash: () => {
          stormCtl.gentle = !stormCtl.gentle;
          return stormCtl.gentle;
        },
        setTime: (h) => (this.atmosphere.dayNight.hours = h),
        nextShot: () => this.cams.cine.cut(),
        restartTour: () => {
          this.cams.setMode('cine');
          this.cams.cine.restartTour();
        },
        photo: () => this.togglePhoto(),
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

    if (params.mem) mountMemoryOverlay(() => this.overlaySample());
    this.buildPipeline();
    this.boot.initMs = performance.now() - this.startMs;
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

  private lensActive(): boolean {
    return (this.photoMod?.active ?? false) || this.cams?.mode === 'cine';
  }

  /** Depth-of-field targets exist only while photo or cinematic DoF is drawing. */
  private releasePlayLens(): void {
    this.playLens?.dispose();
    this.playLens = null;
  }

  /** Cinematic mode draws through the lens rig. Walk and fly keep buildPipeline. */
  private renderCine(): void {
    if (this.pipeline) this.releasePlayPipeline();
    if (!this.playLens) {
      this.playLens = createPlayLens(this.renderer, this.scene, this.camera, this.quality.tier, this.quality.bloom);
    }
    // Exposure scales the linear plate. renderOutput applies AgX once at exposure 1.
    this.playLens.render(this.camera, this.cams.cine.lens, this.atmosphere.exposure);
  }

  private buildPipeline(): void {
    if (this.photoMod?.active) return;
    this.pipeline = rebuildLightingPipeline(
      this.renderer, this.scene, this.camera, this.quality.bloom, this.tone,
    );
  }

  /** Photo mode owns the frame, so the play bloom targets have to be gone first. */
  private releasePlayPipeline(): void {
    disposeLightingPipeline();
    this.pipeline = null;
  }

  setQuality(choice: Tier | 'auto'): void {
    this.qualityChoice = choice;
    storeTier(choice);
    this.ui.setQualityValue(choice);
    this.applyTier(choice === 'auto' ? this.autoTier : choice);
  }

  private applyTier(tier: Tier): void {
    const windows = applyWindowTier(tier);
    setCityWindowDetail(windows.detail);
    this.quality = settingsFor(tier);
    this.applyPixelRatio();
    this.streamer.setQuality(this.quality);
    const roadsWait = !roadTexturesReady(tier);
    void prepareRoadTextures(this.renderer, tier).then(() => {
      if (roadsWait && this.quality.tier === tier) this.streamer.invalidateLod0();
    });
    this.streamer.invalidateLod0();
    this.interiors.setTier(tier);
    releaseLightingTierTargets(this.scene, this.atmosphere.sun, tier);
    if (!this.photoMod?.active) this.buildPipeline();
    this.photoMod?.retier();
    this.playLens?.dispose();
    this.playLens = null;
    this.cams.fly.setSpinnerTier(tier);
    this.slowMs = 0;
    this.ui.setAppliedTier(tier);
  }

  private resize(): void {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.applyPixelRatio();
    this.photoMod?.onResize();
  }

  private streamPolicy(): StreamPolicy {
    const tier = this.quality.tier;
    const dpr = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
    return {
      fovY: this.camera.fov * DEG,
      viewportHeight: this.canvas.height || Math.round(innerHeight * Math.min(dpr, this.quality.pixelRatio)),
      sseThreshold: SSE_THRESHOLD[tier],
      sseScale: this.pressure.sseScale,
      farScale: this.pressure.farScale,
      maxGeometryBytes: this.budget.geometryBytes,
      floorLod0: tier === 'ultra' || tier === 'high' ? 420 : tier === 'medium' ? 280 : 200,
      suspended: this.exteriorSuspended,
    };
  }

  /** Pixel ratio of the governor's drawing buffer. Photo and cine shrink it until the lens fits. */
  private drawingRatio(): number {
    const dpr = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
    const active = this.lensActive();
    const key = `${this.quality.tier}|${innerWidth}|${innerHeight}|${dpr}|${this.pressure.resolutionScale}|${active ? 1 : 0}|${this.budget.targetBytes}`;
    if (key === this.ratioKey) return this.ratioCached;
    let scale = this.pressure.resolutionScale;
    if (active) {
      scale *= lensBudgetScale(
        this.quality.tier, innerWidth, innerHeight, dpr, this.quality.pixelRatio, scale, this.budget.targetBytes,
      );
    }
    const ratio = Math.max(0.5, Math.min(dpr, this.quality.pixelRatio) * scale);
    this.ratioKey = key;
    this.ratioCached = ratio;
    return ratio;
  }

  private applyPixelRatio(): void {
    const ratio = this.drawingRatio();
    this.pixelScale = ratio;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(innerWidth, innerHeight, false);
  }

  /** Rain softens by its own distance while a lens is drawing. Walk and fly leave the streaks thin. */
  private syncRainDefocus(): void {
    const photo = this.photoMod?.active ? this.photoMod.defocus() : null;
    const cine = this.cams?.mode === 'cine' ? this.cams.cine.lens : null;
    const src = photo ?? (cine ? { focus: cine.focus, focalMm: cine.focalMm, fStop: cine.fStop } : null);
    if (!src || !this.renderer) {
      this.rain.setDefocus(null);
      return;
    }
    this.renderer.getDrawingBufferSize(this.lensSize);
    this.rain.setDefocus({
      focus: src.focus,
      focalMm: src.focalMm,
      fStop: src.fStop,
      sensor: this.camera.getFilmHeight(),
      viewHeight: this.lensSize.y,
      maxPx: CAPTURE_CAPS[this.quality.tier].dofPx,
      fovDeg: this.camera.fov,
    });
  }

  private rtBytes(): number {
    const lit = lightingStats().memory.bytes;
    if (lit > 0) return lit;
    const w = this.canvas.width || 1;
    const h = this.canvas.height || 1;
    const samples = this.quality.antialias ? 4 : 1;
    const bloom = this.quality.bloom ? 2.4 : 1;
    return Math.round(w * h * (4 * samples * bloom + 4));
  }

  /** Drop far detail, then mips, then resolution, before the tab is killed. */
  private govern(frameMs: number): void {
    const heap = (performance as { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize ?? 0;
    const gpu = (this.renderer.info.memory?.total ?? 0) + this.rtBytes();
    const jsRatio = this.budget.jsHeapBytes > 0 ? heap / this.budget.jsHeapBytes : 0;
    const gpuRatio = this.budget.gpuBytes > 0 ? gpu / this.budget.gpuBytes : 0;
    this.pressure = stepGovernor(this.pressure, Math.max(jsRatio, gpuRatio), 1, frameMs);
    if (Math.abs(this.pixelScale - this.drawingRatio()) > 0.03) {
      this.applyPixelRatio();
    }
    resources.setMipBias(this.viewMipBias());
    if (this.pressure.level >= 1) resources.evict(this.budget.geometryBytes);
    this.streamer.setPolicy(this.streamPolicy());
  }

  /** High mips stay resident near the street. A tight budget drops them as the camera climbs. */
  private viewMipBias(): number {
    let bias = this.pressure.mipBias;
    const tight = this.budget.deviceClass !== 'desktop' || this.pressure.level > 0;
    if (!tight) return bias;
    const y = this.camera.position.y;
    if (y > 900) bias = Math.max(bias, 2);
    else if (y > 280) bias = Math.max(bias, 1);
    return Math.min(3, bias);
  }

  private overlaySample() {
    const mem = (performance as { memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number } }).memory;
    const info = this.renderer.info.memory;
    return {
      budget: this.budget,
      report: resources.sample(info?.programs ?? 0),
      pressure: this.pressure,
      jsHeap: mem?.usedJSHeapSize ?? 0,
      jsLimit: mem?.jsHeapSizeLimit ?? 0,
      rendererBytes: info?.total ?? 0,
      rendererTextures: info?.textures ?? 0,
      renderTargets: info?.renderTargets ?? 0,
      residentChunks: {
        far: this.streamer.memory.far,
        near: this.streamer.memory.near,
        lod0: this.streamer.memory.lod0,
      },
      residentBytes: this.streamer.memory.residentBytes,
      hlod: this.streamer.memory.hlod,
      resolutionScale: this.pressure.resolutionScale,
    };
  }

  private handleKeys(): void {
    const k = this.input;
    if (k.wasPressed('Digit1')) this.cams.setMode('fly');
    if (k.wasPressed('Digit2')) this.cams.setMode('walk');
    if (k.wasPressed('Digit3')) this.cams.setMode('cine');
    if (k.wasPressed('KeyF')) this.cams.setMode(this.cams.mode === 'fly' ? 'walk' : 'fly');
    if (k.wasPressed('KeyN') && this.cams.mode === 'cine') this.cams.cine.cut();
    if (k.wasPressed('KeyT') && this.cams.mode === 'cine') this.cams.cine.restartTour();
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
  private adaptQuality(rawSec: number): void {
    const next = stepAutoGuard({
      tier: this.quality.tier,
      choice: this.qualityChoice,
      elapsedMs: this.loopStart ? performance.now() - this.loopStart : 0,
      slowMs: this.slowMs,
      frameMs: rawSec * 1000,
    });
    this.slowMs = next.slowMs;
    if (!next.dropped) return;
    this.applyTier(next.tier);
    this.ui.flash(`Quality lowered to ${next.tier} to keep things smooth`);
  }

  private frame(time: number): void {
    this.query.beginFrame();
    this.timer.update(time);
    const raw = this.timer.getDelta();
    const dt = Math.min(raw, 0.1);
    if (this.captureLock) {
      this.input.endFrame();
      return;
    }
    const photoWas = this.photoMod?.active ?? false;
    if (!photoWas) this.touch?.update();
    if (this.input.wasPressed('KeyP')) this.togglePhoto();
    if (this.photoMod?.active && this.input.wasPressed('Escape')) this.exitPhoto();
    const photoOn = this.photoMod?.active ?? false;
    const simDt = photoOn ? 0 : dt;
    if (this.frames === 0) {
      this.loopStart = performance.now();
      this.boot.firstFrameMs = this.loopStart - this.startMs;
    } else if (this.frames > 2 && !photoOn) {
      this.sessionWorstMs = Math.max(this.sessionWorstMs, raw * 1000);
    }
    if (!photoOn) this.elapsed += dt;
    this.frames++;

    if (this.started && !photoOn) this.handleKeys();
    setDisturbance(this.atmosphere.weather.params.wind, this.atmosphere.weather.params.rain);
    if (photoOn) this.photoMod!.update(dt);
    else this.cams.update(dt);

    const cam = this.camera.position;
    const ground = this.query.groundHeight(cam.x, cam.z);
    const alt = cam.y - ground;
    const districtNow = this.query.district(cam.x, cam.z);
    const inMarket = districtNow.id === 'little-tokyo-market';
    const inArts = districtNow.id === 'arts-district';
    const inSoutheast = districtNow.id === 'southeast-industrial';
    const inEast = districtNow.id === 'east-la';
    if (this.wallaceLm === undefined) this.wallaceLm = this.query.layout.landmarkById('wallace-pyramid');
    const walLm = this.wallaceLm;
    const inWallace = districtNow.id === 'wallace-vernon'
      || (!!walLm && Math.hypot(cam.x - walLm.x, cam.z - walLm.z) < walLm.reserveRadius + 40);
    const wNow = this.atmosphere.weather;
    const stormPreset = wNow.current === 'storm' || wNow.target === 'storm';
    const stormDrive = resolveStorm(stormPreset, wNow.params.rain, wNow.params.wind);
    const coast = updateCoast(
      cam, this.quality.tier, simDt, this.elapsed, wNow.params.rain, wNow.params.wind, this.query.layout, params.surf,
      { ...stormDrive, windDir: wNow.windDir, paused: photoOn },
    );
    const look = applyStormTint(
      sampleDistrictLook(this.query.layout, cam.x, cam.z, alt, this.quality.tier, coast.near),
      coast.near, stormDrive.on, stormDrive.intensity,
    );
    U.stormSky.value = stormDrive.on ? stormDrive.intensity * Math.min(1, Math.max(0, coast.near)) : 0;
    U.neonWet.value = look.neonWet;
    setAirTier(this.quality.tier);
    setAirSample({
      ground: look.ground, mid: look.mid, deck: look.deck,
      tintR: look.tintR, tintG: look.tintG, tintB: look.tintB,
      tintMix: look.tintMix, breath: look.breath,
    });
    let streetFog = Math.max(look.streetFog, coast.fog);
    if (inWallace) streetFog = Math.max(streetFog, 0.78 * Math.max(0, 1 - alt / 110));
    U.streetFog.value = streetFog;
    U.sheen.value = look.sheen;
    U.camAlt.value = alt;
    const dtSafe = Math.max(dt, 1e-4);
    this.query.warm(cam.x, cam.z, cam.x + ((cam.x - this.lastCam.x) / dtSafe) * 0.45, cam.z + ((cam.z - this.lastCam.z) / dtSafe) * 0.45);
    this.lastCam.copy(cam);

    const foci = [cam];
    if (photoOn) {
      for (const f of this.photoMod!.focusPoints()) foci.push(f);
    } else if (this.cams.mode === 'cine' && this.cams.cine.prefetch) foci.push(this.cams.cine.prefetch);
    this.govern(raw * 1000);
    this.streamer.update(foci);
    this.landmarks.update(cam, this.quality.landmarkLod);
    updateWallace(cam, this.quality.tier, simDt);
    this.holos.update(this.camera, this.quality, this.streamer.billboards());
    this.traffic.update(simDt, this.camera, this.quality.traffic);
    this.lanes.update(simDt, this.camera, this.quality.laneTraffic);
    this.ground.update(simDt, this.camera, this.quality.groundTraffic, this.quality.freewayTraffic, this.quality.tier, this.elapsed);
    this.photoMod?.preAtmosphere();
    const sky = this.atmosphere.update(simDt, this.elapsed, this.renderer, {
      storm: stormDrive.on,
      coastal: stormDrive.on && coast.near > 0.22 && this.quality.tier !== 'low',
      gentle: stormCtl.gentle,
    });
    if (sky.strike) this.ambience.cueThunder(sky.delay, sky.amount * Math.max(0.35, coast.near));
    this.photoMod?.postAtmosphere();
    this.syncCityLights();
    this.crowd.update(simDt, cam.x, cam.z, this.query, this.quality, this.atmosphere.weather.params.rain, this.elapsed, this.cams.pose().heading);
    this.haze.update(cam.x, cam.z, ground, alt, this.quality.tier);
    const overRoad = cameraOverRoad(this.query.layout, cam.x, cam.z);
    const wantRefl = this.pressure.reflector && (params.refl === 1 || (
      params.refl !== 0 && !this.software && (this.quality.tier === 'high' || this.quality.tier === 'ultra')
      && (inMarket || overRoad) && alt < 28 && this.atmosphere.weather.wetness > 0.35
    ));
    this.wet.place(cam.x, ground, cam.z, wantRefl);
    // depth precision fallback when reversed-Z is unavailable (WebGL2 without EXT_clip_control)
    const near = this.renderer.reversedDepthBuffer ? 0.1 : MathUtils.clamp(alt * 0.004, 0.15, 6);
    if (Math.abs(near - this.camera.near) > 0.01) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }

    const w = this.atmosphere.weather;
    const aboveClouds = MathUtils.clamp(1 - (cam.y - 1400) / 600, 0, 1);
    this.air.update({
      tier: this.quality.tier,
      camX: cam.x, camY: cam.y, camZ: cam.z, alt, time: this.elapsed,
      cameraQuat: this.camera.quaternion,
      query: this.query,
      holos: this.holos.glowMarks,
      signs: (out, range, minArea) => this.streamer.collectSignGlows(cam.x, cam.y, cam.z, range, minArea, out),
      craft: (out, range) => {
        this.traffic.collectCraft(cam.x, cam.y, cam.z, range, out);
        this.lanes.collectSpinners(cam.x, cam.y, cam.z, range, out);
      },
    });
    if (coast.near > 0.2 && this.quality.tier !== 'low') {
      const slots = this.quality.tier === 'medium' ? 2 : 4;
      const lamps = coastWorkLights(this.query.layout, cam.x, cam.z, slots);
      fillEmptyAirLights(lamps.map((p) => ({ ...p, radius: 18, r: 0.55, g: 0.64, b: 0.72 })));
    }
    const coastLean = 1 + Math.max(coast.crest * 0.85, coast.near * (stormDrive.on ? 0.35 : 0.08));
    this.syncRainDefocus();
    this.rain.update(simDt, cam, w.params.rain * aboveClouds, w.params.wind * coastLean, w.windDir, this.quality.rainCount);
    this.snow.update(simDt, cam, w.params.snow * aboveClouds, w.params.wind, w.windDir, this.quality.snowCount);
    const at = this.cams.mode === 'walk' ? this.cams.walk.pos : cam;
    this.interiors.update(simDt, this.cams.mode, at.x, at.y, at.z, w.params.rain);
    const ride = this.interiors.consumeRide();
    if (ride && this.cams.mode === 'walk' && !photoOn) {
      this.cams.walk.pos.set(ride.x, ride.y, ride.z);
      this.cams.walk.heading = ride.heading;
      this.camera.position.set(ride.x, ride.y + 1.7, ride.z);
      this.camera.rotation.set(this.cams.walk.pitch, -ride.heading, 0, 'YXZ');
    }
    this.ambience.setInterior(this.interiors.blend);
    this.ambience.setHum(this.interiors.humAmount);
    const far = sampleFarFrame({
      elapsed: this.elapsed, tier: this.quality.tier, windDir: w.windDir, wind: w.params.wind,
      x: cam.x, y: cam.y, z: cam.z, layout: this.query.layout,
    });
    const districtMach = inWallace
      ? Math.max(0, 1 - alt / 140) * 0.82
      : inArts ? Math.max(0, 1 - alt / 90) * 0.66
        : inSoutheast ? Math.max(0, 1 - alt / 110) * 0.5 : 0;
    this.ambience.setMachinery(Math.min(1, districtMach + far.rumble + far.southBay + far.harbor + far.east));
    setRefineryFlame(this.quality.tier, w.windDir, w.params.wind);
    this.ambience.setTraffic(this.ground.bed);
    this.ambience.setSurf(coast.surf, coast.impact, coast.crest);
    this.ambience.update(w.params.rain, w.params.snow, w.params.wind, alt, aboveClouds);
    this.camera.updateMatrixWorld();
    const e = this.camera.matrixWorld.elements;
    const cook = marketSpots(this.query.layout).noodle?.cook ?? null;
    const hall = far.hall;
    const nearHall = !!hall && inEast && alt < 28 && Math.hypot(cam.x - hall.x, cam.z - hall.z) < 48;
    this.marketAudio.update(
      cam,
      { x: -e[8], y: -e[9], z: -e[10] },
      { x: e[4], y: e[5], z: e[6] },
      w.params.rain,
      inMarket || nearHall,
      alt,
      inMarket ? cook : nearHall ? hall : null,
      this.nearestSpinner(cam),
      this.cams.mode === 'fly',
    );

    this.applyLapdShelter();

    if (photoOn) this.photoMod!.render();
    else if (this.cams.mode === 'cine') this.renderCine();
    else {
      if (this.playLens) {
        this.playLens.dispose();
        this.playLens = null;
      }
      if (!this.pipeline && this.quality.bloom) this.buildPipeline();
      if (this.pipeline) this.pipeline.render();
      else this.renderer.render(this.scene, this.camera);
    }

    this.hud.tick(raw, () => this.hudLines(alt));
    if (!photoOn) this.adaptQuality(raw);
    this.input.endFrame();

    if (this.loadingEl && (this.streamer.isIdle() || performance.now() - this.startMs > 8000) && this.frames > 5) {
      this.boot.interactiveMs = performance.now() - this.startMs;
      this.loadingEl.remove();
      this.loadingEl = null;
    }
  }

  /**
   * Soffit shelter for the LAPD lobby. Not an interior: the city stays drawn when the
   * walker faces the door. Rain is off for the whole recess. Looking in hides the
   * street meshes so the hall is not a 100-draw city frame.
   */
  private applyLapdShelter(): void {
    const walk = this.cams.mode === 'walk';
    const x = walk ? this.cams.walk.pos.x : this.camera.position.x;
    const y = walk ? this.cams.walk.pos.y : this.camera.position.y;
    const z = walk ? this.cams.walk.pos.z : this.camera.position.z;
    const heading = walk ? this.cams.walk.heading : this.cams.pose().heading;
    const layout = this.query.layout;
    if (!inLapdLobby(layout, x, y, z)) return;
    this.rain.mesh.visible = false;
    this.snow.mesh.visible = false;
    if (!lapdLobbyLooksIn(layout, heading)) return;
    this.haze.group.visible = false;
    this.air.glowMesh.visible = false;
    this.air.breathMesh.visible = false;
    this.streamer.root.visible = false;
    this.holos.group.visible = false;
    this.crowd.mesh.visible = false;
    for (const n of this.traffic.nodes) n.visible = false;
    for (const n of this.ground.nodes) n.visible = false;
    for (const child of this.landmarks.root.children) {
      if (child.name !== 'lapd-hq') child.visible = false;
    }
  }

  private syncCityLights(): void {
    const cam = this.camera.position;
    this.signGlows.length = 0;
    this.streamer.collectSignGlows(cam.x, cam.y, cam.z, 40, 6, this.signGlows);
    setEphemeral(ephemeralLights({
      signs: this.signGlows,
      holos: this.holos.glowMarks,
      interior: this.interiors.lightSpill(),
    }));
    const census = lightCensus();
    const sd = this.atmosphere.dayNight.sunDir(this.sunScratch);
    syncLighting({
      scene: this.scene,
      tier: this.quality.tier,
      tone: this.tone,
      x: cam.x, y: cam.y, z: cam.z,
      sheen: Number(U.sheen.value),
      sun: this.atmosphere.sun,
      sunX: sd.x, sunY: sd.y, sunZ: sd.z,
      daylight: Number(U.daylight.value),
      retained: census.retained,
      ephemeral: census.ephemeral,
      viewW: this.canvas.width,
      viewH: this.canvas.height,
    });
    const lens = (this.photoMod?.active ?? false) || this.cams.mode === 'cine';
    if (lens) {
      // DoF reads linear nits already scaled by exposure. renderOutput applies AgX once.
      this.renderer.toneMapping = rendererTone(this.tone);
      this.renderer.toneMappingExposure = 1;
    } else if (this.pipeline) {
      // Bloom pipeline tone-maps in its own node. The renderer must not do it again.
      this.renderer.toneMapping = NoToneMapping;
    } else {
      // Low and medium walk/fly: the renderer applies AgX, using the exposure Atmosphere just set.
      this.renderer.toneMapping = rendererTone(this.tone);
    }
  }

  private lightHud(): string {
    const L = lightingStats();
    const kind = L.baked ? 'baked' : L.volumetric ? 'haze' : 'direct';
    const mb = L.memory.bytes / (1024 * 1024);
    const mem = L.memory.bytes > 0 ? ` · ${mb.toFixed(1)}MB` : '';
    return `${L.tonemap} EV ${L.ev.toFixed(2)} · ${L.shaded} shaded · ${L.retained}+${L.ephemeral} ${kind}${L.sunShadow ? ' · sun' : ''}${mem}`;
  }

  private hudLines(alt: number): Array<[string, string | number]> {
    const info = this.renderer.info.render;
    const s = this.streamer.stats;
    const p = this.camera.position;
    const [lat, lon] = localToGeo(p.x, p.z);
    const d = this.query.district(p.x, p.z);
    const a = this.atmosphere;
    return [
      ['gpu', `${this.backend} · ${this.quality.tier}${this.qualityChoice === 'auto' ? ' (auto)' : ''} · dpr ${this.renderer.getPixelRatio().toFixed(2)} · ${this.canvas.width}×${this.canvas.height}`],
      ['draw', `${info.drawCalls} calls · ${(info.triangles / 1e6).toFixed(2)} M tris · crowd ${this.crowd.count} · holo ${this.holos.shown} · ground ${this.ground.streetCount}+${this.ground.freewayCount}`],
      ['query', `sync ${this.query.syncCount} · pending ${this.query.pending} · cell ${this.query.lastQueryMs.toFixed(0)} ms`],
      ['chunks', `far ${s.supersFar} · near ${s.chunksNear} · lod0 ${s.lod0} · jobs ${s.inFlight} · queue ${s.readyQueue} · gen ${s.lastGenMs.toFixed(0)} ms`],
      ['pos', `${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)} m · ${alt.toFixed(0)} m AGL`],
      ['geo', `${lat.toFixed(4)}, ${lon.toFixed(4)}`],
      ['district', `${d.name} (stage ${d.stage})`],
      ['sky', `${a.dayNight.label} · ${a.weather.label} · wet ${a.weather.wetness.toFixed(2)}`],
      ['light', this.lightHud()],
      ['mode', this.cams.mode === 'cine' ? `cinematic · ${this.cams.cine.label}` : this.cams.mode],
      ['lens', this.cams.mode === 'cine'
        ? `${this.cams.cine.lens.focalMm.toFixed(0)} mm · ${formatFStop(this.cams.cine.lens.fStop)} · ${this.cams.cine.lens.grade}`
        : '—'],
      ['interior', this.interiors.hudLabel()],
    ];
  }

  /** Closest street-layer or sky-lane spinner, for the positional flyby voice. */
  private nearestSpinner(cam: Vector3) {
    const a = this.traffic.nearestTo(cam.x, cam.y, cam.z);
    const b = this.lanes.nearestTo(cam.x, cam.y, cam.z);
    if (!a) return b;
    if (!b || a.dist <= b.dist) return { ...a, closing: 0, heavy: false };
    return b;
  }

  /** Start the far-district download as early as the class is constructed, and mount when both sides exist. */
  private hookFar(): void {
    if (this.farHooked) return;
    this.farHooked = true;
    const run = () => this.applyFar();
    if (farDistrictsReady()) run();
    else void farDistrictsPromise.then(run);
  }

  private applyFar(): void {
    if (this.farApplied || !this.landmarks || !this.interiors) return;
    this.farApplied = true;
    mountFarDistricts(this.scene, this.query.layout, this.query);
    this.landmarks.mountPending(true);
    this.interiors.adoptNew(this.query);
    this.boot.farMs = performance.now() - this.startMs;
  }

  private applyDistrictPose(p: {
    x: number; y: number; z: number; heading: number; pitch: number;
    mode: 'walk' | 'fly'; cockpit?: boolean;
    feet?: { x: number; y: number; z: number };
  } | null | undefined): boolean {
    if (!p) return false;
    this.query.fabricAt(p.x, p.z);
    this.cams.setMode(p.mode);
    if (p.mode === 'fly') this.cams.fly.cockpit = !!p.cockpit;
    this.cams.setPose({ position: new Vector3(p.x, p.y, p.z), heading: p.heading, pitch: p.pitch });
    if (p.mode === 'walk') {
      this.cams.walk.pitch = p.pitch;
      this.cams.walk.heading = p.heading;
      if (p.feet) {
        this.cams.walk.pos.set(p.feet.x, p.feet.y, p.feet.z);
        this.camera.position.set(p.feet.x, p.feet.y + 1.7, p.feet.z);
        this.camera.rotation.set(p.pitch, -p.heading, 0, 'YXZ');
        this.camera.updateMatrixWorld();
      }
    }
    return true;
  }

  private async ensureFar(): Promise<void> {
    await farDistrictsPromise;
    this.applyFar();
  }

  /** Debug / automation hooks (screenshots, console). */
  private loadPhoto(): Promise<PhotoMode> {
    if (this.photoMod) return Promise.resolve(this.photoMod);
    if (!this.photoGate) {
      this.photoGate = import('../photo/PhotoMode').then((m) => {
        if (!this.photoMod) this.photoMod = new m.PhotoMode(this.photoHost());
        return this.photoMod;
      });
    }
    return this.photoGate;
  }

  private togglePhoto(): void {
    if (this.captureLock) return;
    if (this.photoMod?.active) {
      this.exitPhoto();
      return;
    }
    if (this.photoMod) {
      this.beginPhoto();
      return;
    }
    void this.loadPhoto().then(() => {
      if (!this.photoMod?.active) this.beginPhoto();
    });
  }

  private async enterPhoto(): Promise<boolean> {
    const photo = await this.loadPhoto();
    if (!photo.active) this.beginPhoto();
    return photo.active;
  }

  private beginPhoto(): void {
    if (!this.photoMod || this.photoMod.active || this.captureLock) return;
    this.ui.hideTitle();
    this.started = true;
    this.ambience.start();
    if (document.pointerLockElement) document.exitPointerLock();
    this.spinnerWasVisible = this.cams.fly.spinner.visible;
    this.cams.fly.spinner.visible = false;
    this.releasePlayLens();
    this.releasePlayPipeline();
    try {
      this.photoMod.enter();
    } catch (err) {
      this.buildPipeline();
      throw err;
    }
    this.applyPixelRatio();
  }

  private exitPhoto(): void {
    if (!this.photoMod?.active || this.captureLock) return;
    this.photoMod.exit();
    this.cams.fly.spinner.visible = this.spinnerWasVisible;
    this.buildPipeline();
    this.applyPixelRatio();
  }

  private photoHost(): PhotoHost {
    return {
      camera: this.camera,
      scene: this.scene,
      renderer: this.renderer,
      canvas: this.canvas,
      input: this.input,
      ambience: this.ambience,
      weather: this.atmosphere.weather,
      dayNight: this.atmosphere.dayNight,
      layout: this.query.layout,
      query: this.query,
      tier: () => this.quality.tier,
      backend: () => this.backend,
      exposure: () => this.atmosphere.exposure,
      lock: (on) => { this.captureLock = on; },
      mode: () => this.cams.mode,
      flash: (html) => this.ui.flash(html),
      restoreView: (fov) => {
        this.camera.fov = fov;
        this.camera.aspect = innerWidth / Math.max(1, innerHeight);
        this.camera.clearViewOffset();
        this.camera.updateProjectionMatrix();
      },
    };
  }

  debugApi() {
    const app = this;
    return {
      app: this,
      isIdle: () => this.frames > 10 && this.streamer.isIdle(),
      memory: () => this.overlaySample(),
      budget: () => this.budget,
      pressure: () => this.pressure,
      resetPeaks: () => {
        this.sessionWorstMs = 0;
        this.streamer.resetPeaks();
      },
      photo: {
        enter: () => this.enterPhoto(),
        exit: () => this.exitPhoto(),
        setLens: (p: Parameters<PhotoMode['setLens']>[0]) => this.photoMod?.setLens(p),
        setLook: (p: Parameters<PhotoMode['setLook']>[0]) => this.photoMod?.setLook(p),
        setShot: (p: Parameters<PhotoMode['setShot']>[0]) => this.photoMod?.setShot(p),
        postcard: (id: string) => this.photoMod?.postcard(id) ?? false,
        capture: (req?: Parameters<PhotoMode['capture']>[0]) => this.photoMod?.capture(req) ?? Promise.resolve(null),
        get active() { return app.photoMod?.active ?? false; },
        state: () => this.photoMod?.snapshot() ?? null,
        lastImage: () => this.photoMod?.lastImage() ?? null,
      },
      setMode: (m: ModeId) => this.cams.setMode(m),
      setPose: (x: number, y: number, z: number, yawDeg = 0, pitchDeg = 0) =>
        this.cams.setPose({ position: new Vector3(x, y, z), heading: yawDeg * DEG, pitch: pitchDeg * DEG }),
      /** Rise off the current walk pose and look down the street, so a still shows a pool and the gap past it. */
      survey: (up = 7, back = 5, pitchDeg = -20) => {
        const w = this.cams.walk;
        const h = w.heading;
        const fx = Math.sin(h);
        const fz = -Math.cos(h);
        const x = w.pos.x - fx * back;
        const y = w.pos.y + up;
        const z = w.pos.z - fz * back;
        this.cams.fly.cockpit = true;
        if (this.cams.mode !== 'fly') this.cams.setMode('fly');
        this.cams.setPose({ position: new Vector3(x, y, z), heading: h, pitch: pitchDeg * DEG });
        this.cams.fly.cockpit = true;
        this.cams.fly.vel.set(0, 0, 0);
        return true;
      },
      /**
       * Stand near the nearest street practical so the still is the pool, not the gap.
       * `aside` slides the camera to its right, in metres, when a second lamp crowds the frame.
       */
      lampShot: (back = 12, pitchDeg = -8, aside = 0) => {
        const origin = this.cams.walk.pos;
        let best: { x: number; y: number; z: number } | null = null;
        let bestD = 1e9;
        for (const L of allLights()) {
          if (L.preset !== 'street-sodium' && L.preset !== 'street-led' && L.preset !== 'beacon-white') continue;
          const d = Math.hypot(L.x - origin.x, L.z - origin.z);
          if (d < 3 || d > 160 || d >= bestD) continue;
          best = L;
          bestD = d;
        }
        if (!best) return false;
        const dx = origin.x - best.x;
        const dz = origin.z - best.z;
        const len = Math.hypot(dx, dz) || 1;
        const fx = dx / len;
        const fz = dz / len;
        // Camera looks back at the head. Right is cross(forward, up).
        const x = best.x + fx * back + fz * aside;
        const z = best.z + fz * back - fx * aside;
        const y = best.y - 2.6;
        const heading = Math.atan2(best.x - x, -(best.z - z));
        this.cams.fly.cockpit = true;
        if (this.cams.mode !== 'fly') this.cams.setMode('fly');
        this.cams.setPose({ position: new Vector3(x, y, z), heading, pitch: pitchDeg * DEG });
        this.cams.fly.cockpit = true;
        this.cams.fly.vel.set(0, 0, 0);
        return true;
      },
      /** Street-level camera on a real carriageway. `id` is a district id from `roadPoses()`. */
      roadView: (id = 'historic-core') => {
        const pose = roadPoses().find((p) => p.id === id);
        if (!pose) return false;
        return this.applyDistrictPose({
          x: pose.x, y: pose.y, z: pose.z,
          heading: pose.yaw * DEG, pitch: pose.pitch * DEG,
          mode: 'walk',
          feet: { x: pose.x, y: pose.y - 1.7, z: pose.z },
        });
      },
      setTime: (h: number) => (this.atmosphere.dayNight.hours = h),
      setWeather: (w: WeatherId, instant = true) => this.atmosphere.weather.set(w, instant),
      cut: () => this.cams.cine.cut(),
      holdShot: (on: boolean) => (this.cams.cine.hold = on),
      tour: {
        beats: () => this.cams.cine.beatList(),
        show: (index: number) => {
          this.cams.setMode('cine');
          return this.cams.cine.showBeat(index);
        },
        restart: () => {
          this.cams.setMode('cine');
          this.cams.cine.restartTour();
        },
        lens: () => this.cams.cine.lens,
      },
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
      holoSpec: (id: string) => hologramById(id) ?? null,
      /** Frame a showcase hologram: street (market), aerial (megatower face), cine (canyon crane). */
      holoView: (kind: 'street' | 'aerial' | 'cine') => {
        const id = kind === 'street' ? 'market-coil' : kind === 'aerial' ? 'megatower-1-holo-a' : 'financial-canyon-crane';
        const spec = hologramById(id);
        if (!spec) return false;
        if (kind === 'cine') {
          this.cams.setMode('cine');
          const dist = Math.max(64, Math.min(84, Math.max(spec.w, spec.h) * 1.7));
          this.cams.cine.frameFace(spec.id, new Vector3(spec.x, spec.y, spec.z), spec.yaw, dist, spec.y + 6);
          return true;
        }
        const dist = kind === 'street' ? 12 : Math.max(spec.w, spec.h) * 1.12;
        const nx = Math.sin(spec.yaw);
        const nz = Math.cos(spec.yaw);
        const x = spec.x + nx * dist;
        const z = spec.z + nz * dist;
        const ground = this.query.layout.heightAt(x, z);
        const eye = kind === 'street' ? ground + 1.7 : spec.y;
        const dx = spec.x - x;
        const dz = spec.z - z;
        const heading = Math.atan2(dx, -dz);
        const pitch = Math.atan2(spec.y - eye, Math.hypot(dx, dz) || 1);
        if (kind === 'aerial') this.cams.fly.cockpit = true;
        this.cams.setMode(kind === 'street' ? 'walk' : 'fly');
        const y = kind === 'street' ? ground : spec.y - 1.22;
        this.cams.setPose({ position: new Vector3(x, y, z), heading, pitch });
        if (kind === 'street') this.cams.walk.pitch = pitch;
        return true;
      },
      /** Stage 3 cameras: approach (Wallace), skyline, street (looking up MT-1), lanes, crown. */
      /** Stage 4 cameras: canyon street, a lit walkway, a spinner over a roof, an avenue lane, the MT-1 plaza. */
      /** Stage 5 cameras: spinner on a pad approach, the steps, City Hall, the lobby, the mall. */
      /** Stage 6 cameras: Broadway at street level, the footbridge, the Bradbury face, spinner height, the court. */
      /** X3 cameras: inside the Bradbury court, on the stair, the street door, the service template. */
      /** Stage 8 cameras: the slab, the market, the lobby, the corridor, the apartment, the roof pad. */
      /** Stage 7 cameras: the causeway, the plaza, the pyramid face, a satellite, the factories, a convoy, the old pyramids, the atrium. */
      /** Stage 10 cameras: crest, terraces, apron from the water, spray, drowned piers, coastal blocks, aerial. */
      /** X2 cameras: a signalled crossing, the 110 trench, Broadway, a night aerial, the same crossing in rain. */
      trafficView: (kind: TrafficView) => {
        const p = trafficCamera(this.query.layout, kind);
        if (!p) return false;
        this.query.fabricAt(p.x, p.z);
        this.cams.setMode(p.mode);
        if (p.mode === 'fly') this.cams.fly.cockpit = !!p.cockpit;
        this.cams.setPose({ position: new Vector3(p.x, p.y, p.z), heading: p.heading, pitch: p.pitch });
        if (p.mode === 'walk') {
          this.cams.walk.pitch = p.pitch;
          this.cams.walk.heading = p.heading;
          if (p.feet) {
            this.cams.walk.pos.set(p.feet.x, p.feet.y, p.feet.z);
            this.camera.position.set(p.feet.x, p.feet.y + 1.7, p.feet.z);
            this.camera.rotation.set(p.pitch, -p.heading, 0, 'YXZ');
            this.camera.updateMatrixWorld();
          }
        }
        return true;
      },
      coastView: (kind: CoastView) => {
        const pre = coastCamera(this.query.layout, kind);
        if (!pre) return false;
        this.query.fabricAt(pre.x, pre.z);
        let p = pre;
        if (kind === 'blocks') {
          const fab = this.query.fabricAt(pre.x, pre.z);
          let best: (typeof fab.blocks)[number] | null = null;
          let bd = Infinity;
          for (const b of fab.blocks) {
            const d = Math.hypot(b.cx - pre.x, b.cz - pre.z);
            if (d < bd) { bd = d; best = b; }
          }
          if (best) {
            const off = best.la / 2 + best.street / 2;
            const px = best.cx + best.ax * off;
            const pz = best.cz + best.az * off;
            p = {
              x: px,
              y: best.ground + 1.7,
              z: pz,
              heading: Math.atan2(best.bx, -best.bz),
              pitch: 0.06,
              mode: 'walk',
              feet: { x: px, y: best.ground, z: pz },
            };
          }
        }
        this.cams.setMode(p.mode);
        if (p.mode === 'fly') this.cams.fly.cockpit = !!p.cockpit;
        this.cams.setPose({ position: new Vector3(p.x, p.y, p.z), heading: p.heading, pitch: p.pitch });
        if (p.mode === 'walk') {
          this.cams.walk.pitch = p.pitch;
          this.cams.walk.heading = p.heading;
          if (p.feet) {
            this.cams.walk.pos.set(p.feet.x, p.feet.y, p.feet.z);
            this.camera.position.set(p.feet.x, p.feet.y + 1.7, p.feet.z);
            this.camera.rotation.set(p.pitch, -p.heading, 0, 'YXZ');
            this.camera.updateMatrixWorld();
          }
        }
        return true;
      },
      wallaceView: (kind: WallaceView) => {
        const p = wallaceCamera(this.query.layout, kind);
        if (!p) return false;
        this.query.fabricAt(p.x, p.z);
        this.cams.setMode(p.mode);
        if (p.mode === 'fly') this.cams.fly.cockpit = !!p.cockpit;
        this.cams.setPose({ position: new Vector3(p.x, p.y, p.z), heading: p.heading, pitch: p.pitch });
        if (p.mode === 'walk') {
          this.cams.walk.pitch = p.pitch;
          this.cams.walk.heading = p.heading;
          if (p.feet) {
            this.cams.walk.pos.set(p.feet.x, p.feet.y, p.feet.z);
            this.camera.position.set(p.feet.x, p.feet.y + 1.7, p.feet.z);
            this.camera.rotation.set(p.pitch, -p.heading, 0, 'YXZ');
            this.camera.updateMatrixWorld();
          }
        }
        return true;
      },
      /** Stage 9 cameras: the works from the air, a stack, the pour door, a pipe rack, the river bank, a truck street, the foundry bay. */
      artsView: (kind: ArtsView) => {
        const p = artsCamera(this.query.layout, kind);
        if (!p) return false;
        this.query.fabricAt(p.x, p.z);
        this.cams.setMode(p.mode);
        if (p.mode === 'fly') this.cams.fly.cockpit = !!p.cockpit;
        this.cams.setPose({ position: new Vector3(p.x, p.y, p.z), heading: p.heading, pitch: p.pitch });
        if (p.mode === 'walk') {
          this.cams.walk.pitch = p.pitch;
          this.cams.walk.heading = p.heading;
          if (p.feet) {
            this.cams.walk.pos.set(p.feet.x, p.feet.y, p.feet.z);
            this.camera.position.set(p.feet.x, p.feet.y + 1.7, p.feet.z);
            this.camera.rotation.set(p.pitch, -p.heading, 0, 'YXZ');
            this.camera.updateMatrixWorld();
          }
        }
        return true;
      },
      /** Stage 16 cameras: the strip from a kilometre up, the boulevard, a giant figure, the hillside wordmark, the arcade lobby. */
      hollywoodView: async (kind: HollywoodView) => {
        const { hollywoodCamera } = await import('../districts/hollywood/view');
        await this.ensureFar();
        return this.applyDistrictPose(hollywoodCamera(this.query.layout, kind));
      },
      /** Stage 17 cameras. `downtown` and `burn` also arm a mid-ascent launch. */
      laxView: async (kind: LaxView) => {
        const [{ laxCamera, laxLaunchFor }, { requestLaunch }] = await Promise.all([
          import('../districts/lax-spaceport/view'),
          import('../districts/lax-spaceport/launch'),
        ]);
        await this.ensureFar();
        const arm = laxLaunchFor(kind);
        if (arm) requestLaunch(arm.phase, arm.pad);
        return this.applyDistrictPose(laxCamera(this.query.layout, kind));
      },
      /** Ignition now, or a phase 0..1 into the current burn. Optional pad index holds that gantry. */
      launch: (phase?: number, pad?: number) => requestFarLaunch(phase, pad),
      /** Stage 21 cameras: the carpet from a kilometre up, a junction, a market street, the river, the counter, a side street, the deck. */
      eastLaView: async (kind: EastLaView) => {
        const { eastLaCamera } = await import('../districts/east-la/view');
        await this.ensureFar();
        return this.applyDistrictPose(eastLaCamera(this.query.layout, kind));
      },
      /** Stage 20 cameras: the core from a kilometre up, the skyline from the harbor wall, the canyon, the Lakewood edge, the concourse, the freight lane. */
      longBeachView: async (kind: LongBeachView) => {
        const { longBeachCamera } = await import('../districts/long-beach/view');
        await this.ensureFar();
        return this.applyDistrictPose(longBeachCamera(this.query.layout, kind));
      },
      /** Stage 19 cameras: the quay from a kilometre up, cranes over the harbor wall, stacks, a hull, the street, the control room, the port from LAX. */
      harborView: async (kind: HarborView) => {
        const { harborCamera } = await import('../districts/harbor/view');
        await this.ensureFar();
        return this.applyDistrictPose(harborCamera(this.query.layout, kind));
      },
      /** Stage 18 cameras: the coast from a kilometre up, the flare field from LAX, tanks, spheres, the sea-wall edge, a stack, the door, the control room, downtown. */
      southBayView: async (kind: SouthBayView) => {
        const { southBayCamera } = await import('../districts/south-bay-refineries/view');
        await this.ensureFar();
        return this.applyDistrictPose(southBayCamera(this.query.layout, kind));
      },
      /** Stage 15 cameras: the belt from a kilometre up, a flare, a tank farm, a pipe canyon, the pump door, the control room, downtown. */
      southeastView: async (kind: SoutheastView) => {
        const { southeastCamera } = await import('../districts/southeast-industrial/view');
        await this.ensureFar();
        return this.applyDistrictPose(southeastCamera(this.query.layout, kind));
      },
      /** Stage 14 cameras: seams from a kilometre up, a quiet street, a strip, a roof. */
      basinView: async (kind: BasinView) => {
        const { basinCamera } = await import('../districts/basin-sprawl/view');
        await this.ensureFar();
        return this.applyDistrictPose(basinCamera(this.query.layout, kind));
      },
      /** Stage 13 cameras: the sector from a kilometre up, a quiet street, a strip, a roof, the 10, the yard, the diner, a Wilshire-side tower. */
      westsideView: async (kind: WestsideView) => {
        const { westsideCamera } = await import('../districts/westside/view');
        await this.ensureFar();
        return this.applyDistrictPose(westsideCamera(this.query.layout, kind));
      },
      /** Stage 12 cameras: street, court, market, spine, hub, signal, the 110, Wallace, the sector, the Lakewood seam, the laundry hall. */
      southLaView: async (kind: SouthLaView) => {
        const { southLaCamera } = await import('../districts/south-la-megablocks/view');
        await this.ensureFar();
        return this.applyDistrictPose(southLaCamera(this.query.layout, kind));
      },
      /** Stage 11 cameras: a residential street, a courtyard, a corner market, laundry, a signal, K's edge, the river, the sector, the shop, the yard. */
      lakewoodView: async (kind: LakewoodView) => {
        const { lakewoodCamera } = await import('../districts/lakewood-megablocks/view');
        await this.ensureFar();
        return this.applyDistrictPose(lakewoodCamera(this.query.layout, kind));
      },
      kView: (kind: KView) => {
        const p = kCamera(this.query.layout, kind);
        if (!p) return false;
        this.query.fabricAt(p.x, p.z);
        this.cams.setMode(p.mode);
        if (p.mode === 'fly') this.cams.fly.cockpit = !!p.cockpit;
        this.cams.setPose({ position: new Vector3(p.x, p.y, p.z), heading: p.heading, pitch: p.pitch });
        if (p.mode === 'walk') {
          this.cams.walk.pitch = p.pitch;
          this.cams.walk.heading = p.heading;
          if (p.feet) {
            this.cams.walk.pos.set(p.feet.x, p.feet.y, p.feet.z);
            this.camera.position.set(p.feet.x, p.feet.y + 1.7, p.feet.z);
            this.camera.rotation.set(p.pitch, -p.heading, 0, 'YXZ');
            this.camera.updateMatrixWorld();
          }
        }
        return true;
      },
      interiorView: (kind: InteriorView) => {
        const p = interiorCamera(this.query.layout, kind);
        if (!p) return false;
        this.query.fabricAt(p.x, p.z);
        this.cams.setMode('walk');
        this.cams.setPose({ position: new Vector3(p.x, p.y, p.z), heading: p.heading, pitch: p.pitch });
        this.cams.walk.pitch = p.pitch;
        this.cams.walk.heading = p.heading;
        this.cams.walk.pos.set(p.feet.x, p.feet.y, p.feet.z);
        this.camera.position.set(p.feet.x, p.feet.y + 1.7, p.feet.z);
        this.camera.rotation.set(p.pitch, -p.heading, 0, 'YXZ');
        this.camera.updateMatrixWorld();
        return true;
      },
      broadwayView: (kind: BroadwayView) => {
        const p = broadwayCamera(this.query.layout, kind);
        if (!p) return false;
        this.query.fabricAt(p.x, p.z);
        this.cams.setMode(p.mode);
        if (p.mode === 'fly') this.cams.fly.cockpit = !!p.cockpit;
        this.cams.setPose({ position: new Vector3(p.x, p.y, p.z), heading: p.heading, pitch: p.pitch });
        if (p.mode === 'walk') {
          this.cams.walk.pitch = p.pitch;
          if (p.feet) this.cams.walk.pos.set(p.feet.x, p.feet.y, p.feet.z);
        }
        return true;
      },
      civicView: (kind: CivicView) => {
        const p = civicCamera(this.query.layout, kind, this.lanes.lanes);
        if (!p) return false;
        this.query.fabricAt(p.x, p.z);
        this.cams.setMode(p.mode);
        if (p.mode === 'fly') this.cams.fly.cockpit = !!p.cockpit;
        this.cams.setPose({ position: new Vector3(p.x, p.y, p.z), heading: p.heading, pitch: p.pitch });
        if (p.mode === 'walk') {
          this.cams.walk.pitch = p.pitch;
          if (p.feet) this.cams.walk.pos.set(p.feet.x, p.feet.y, p.feet.z);
        }
        return true;
      },
      dtlaView: (kind: DtlaView) => {
        const p = dtlaCamera(this.query.layout, kind, this.lanes.lanes);
        if (!p) return false;
        this.query.fabricAt(p.x, p.z);
        this.cams.setMode(p.mode);
        if (p.mode === 'fly') this.cams.fly.cockpit = !!p.cockpit;
        this.cams.setPose({ position: new Vector3(p.x, p.y, p.z), heading: p.heading, pitch: p.pitch });
        if (p.mode === 'walk') {
          this.cams.walk.pitch = p.pitch;
          if (p.feet) this.cams.walk.pos.set(p.feet.x, p.feet.y, p.feet.z);
        }
        return true;
      },
      megaView: (kind: MegaView) => {
        const p = megaCamera(this.query.layout, kind, this.lanes.lanes);
        if (!p) return false;
        this.cams.setMode(p.mode);
        if (p.mode === 'fly') this.cams.fly.cockpit = !!p.cockpit;
        this.cams.setPose({ position: new Vector3(p.x, p.y, p.z), heading: p.heading, pitch: p.pitch });
        if (p.mode === 'walk') this.cams.walk.pitch = p.pitch;
        return true;
      },
      marketView: (kind: MarketView) => {
        const p = marketCamera(this.query.layout, kind);
        if (!p) return false;
        this.cams.setMode(p.mode);
        if (p.mode === 'fly') this.cams.fly.cockpit = !!p.cockpit;
        this.cams.setPose({ position: new Vector3(p.x, p.y, p.z), heading: p.heading, pitch: p.pitch });
        // Walk enter forces a street pitch. Put the requested one back for interior / crowd shots.
        if (p.mode === 'walk') this.cams.walk.pitch = p.pitch;
        return true;
      },
      windows: windowsApi(this.query.layout),
      air: {
        toggle: (layer: 'ground' | 'mid' | 'deck' | 'halos' | 'shafts' | 'rain' | 'breath', on?: boolean) => {
          airFlags[layer] = on ?? !airFlags[layer];
          return this.air.snapshot();
        },
        searchlights: (n?: number) => {
          if (n !== undefined) airFlags.shaftCap = n < 0 ? -1 : Math.max(0, Math.min(4, n | 0));
          return airFlags.shaftCap < 0 ? shaftCapFor(this.quality.tier) : airFlags.shaftCap;
        },
        heights: (h?: { groundY?: number; groundW?: number; deckY?: number; deckW?: number; layerY?: number }) => {
          if (h) {
            if (h.groundY !== undefined) airFlags.groundY = h.groundY;
            if (h.groundW !== undefined) airFlags.groundW = h.groundW;
            if (h.deckY !== undefined) airFlags.deckY = h.deckY;
            if (h.deckW !== undefined) airFlags.deckW = h.deckW;
            if (h.layerY !== undefined) airFlags.layerY = h.layerY;
          }
          const s = this.air.snapshot();
          return { groundY: s.groundY, groundW: s.groundW, deckY: s.deckY, deckW: s.deckW, layerY: s.layerY };
        },
        state: () => this.air.snapshot(),
      },
      storm: {
        on: (v?: boolean) => {
          if (v !== undefined) stormCtl.force = v;
          return stormSnap.on;
        },
        intensity: (v?: number) => {
          if (v !== undefined) stormCtl.intensity = Math.max(0, Math.min(1, v));
          return stormSnap.intensity;
        },
        phase: () => stormSnap.phase,
        spray: () => stormSnap.spray,
        overtop: (v?: boolean) => {
          if (v !== undefined) stormCtl.overtop = v;
          return stormSnap.overtop;
        },
        gentle: (v?: boolean) => {
          if (v !== undefined) stormCtl.gentle = v;
          return stormCtl.gentle;
        },
        state: () => ({ ...stormSnap }),
      },
      stats: () => ({
        ...this.streamer.stats,
        fps: this.hud.fps,
        frameMs: this.hud.frameMs,
        worstMs: this.hud.worstMs,
        backend: this.backend,
        tier: this.quality.tier,
        mode: this.cams.mode,
        shot: this.cams.cine.label,
        drawCalls: this.renderer.info.render.drawCalls,
        triangles: this.renderer.info.render.triangles,
        crowd: this.crowd.count,
        crowdAnimated: this.crowd.animated,
        crowdStatic: this.crowd.staticCount,
        crowdIdle: this.crowd.idle,
        crowdTris: this.crowd.tris,
        holo: this.holos.shown,
        holoCandidates: this.holos.candidates,
        holoCards: this.holos.cards,
        laneCars: this.lanes.count,
        lanes: this.lanes.lanes.length,
        groundCars: this.ground.count,
        freewayCars: this.ground.freewayCount,
        streaks: this.ground.streakCount,
        viewSignal: this.ground.viewSignal,
        trafficQueued: this.ground.queued,
        trafficBed: this.ground.bed,
        voices: this.marketAudio.voices,
        voiceCap: this.marketAudio.voiceCap,
        audioDistrict: this.marketAudio.districtId,
        landmarkLods: this.landmarks.lods.active.join('/'),
        beacons: this.landmarks.beacons.count,
        launch: farLaunchPhase(),
        launchPad: farLaunchPad(),
        gantryTris: farGantryTris(),
        farMs: this.boot.farMs,
        querySyncs: this.query.syncCount,
        queryUnpacks: this.query.unpackCount,
        queryUnpackMs: this.query.lastUnpackMs,
        queryPending: this.query.pending,
        pixelRatio: this.renderer.getPixelRatio(),
        canvasWidth: this.canvas.width,
        canvasHeight: this.canvas.height,
        canvasPixels: this.canvas.width * this.canvas.height,
        gpuGeomBytes: geometryBytes(this.scene),
        jsHeap: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
        sessionWorstMs: this.sessionWorstMs,
        photo: this.photoMod?.active ?? false,
        lighting: lightingStats(),
        windows: windowState(),
        air: this.air.snapshot(),
        storm: { ...stormSnap },
        qualityChoice: this.qualityChoice,
        autoTier: this.autoTier,
        autoReason: this.autoReason,
        atlas: atlasMode(),
        initMs: this.boot.initMs,
        firstFrameMs: this.boot.firstFrameMs,
        interactiveMs: this.boot.interactiveMs,
        streakBins: this.ground.streakBins,
        streakBinsDrawn: this.ground.streakBinsDrawn,
        streakDrawn: this.ground.streakDrawn,
        refl: this.wet.enabled,
        ...this.interiors.stats,
        faceSectors: wallaceFaceSectorCount(),
        coastSegments: coastSegmentCount(),
        coastImpact: coastImpact(),
      }),
    };
  }
}

/** Geometry buffers plus instanced matrix buffers. Not the framebuffer, not textures. */
function geometryBytes(root: { traverse(cb: (o: object) => void): void }): number {
  const seen = new Set<object>();
  let bytes = 0;
  const add = (array: ArrayBufferView | undefined, key: object) => {
    if (!array || seen.has(key)) return;
    seen.add(key);
    bytes += array.byteLength;
  };
  root.traverse((o) => {
    const mesh = o as {
      geometry?: { attributes: Record<string, { array?: ArrayBufferView }>; index?: { array?: ArrayBufferView } | null };
      instanceMatrix?: { array?: ArrayBufferView };
    };
    const g = mesh.geometry;
    if (g && !seen.has(g)) {
      seen.add(g);
      for (const attr of Object.values(g.attributes)) add(attr?.array, attr);
      if (g.index) add(g.index.array, g.index);
    }
    if (mesh.instanceMatrix) add(mesh.instanceMatrix.array, mesh.instanceMatrix);
  });
  return bytes;
}
