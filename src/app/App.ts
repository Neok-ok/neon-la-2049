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
import { LaneTraffic } from '../vehicles/LaneTraffic';
import { GroundTraffic } from '../vehicles/groundTraffic';
import { trafficCamera, type TrafficView } from '../vehicles/trafficView';
import { megaCamera, type MegaView } from '../districts/financial-megatowers/view';
import { dtlaCamera, type DtlaView } from '../districts/dtla/view';
import { installDtlaHolos } from '../districts/dtla/holos';
import { civicCamera, type CivicView } from '../districts/civic-center/view';
import { broadwayCamera, type BroadwayView } from '../districts/historic-core/view';
import { interiorCamera, type InteriorView } from '../districts/historic-core/interior';
import { kCamera, type KView } from '../districts/k-megablock/view';
import { lakewoodCamera, type LakewoodView } from '../districts/lakewood-megablocks/view';
import { installLakewoodHolos } from '../districts/lakewood-megablocks/holos';
import { southLaCamera, type SouthLaView } from '../districts/south-la-megablocks/view';
import { installSouthLaHolos } from '../districts/south-la-megablocks/holos';
import { artsCamera, type ArtsView } from '../districts/arts-district/view';
import { westsideCamera, type WestsideView } from '../districts/westside/view';
import { basinCamera, type BasinView } from '../districts/basin-sprawl/view';
import { southeastCamera, type SoutheastView } from '../districts/southeast-industrial/view';
import { hollywoodCamera, type HollywoodView } from '../districts/hollywood/view';
import { installHollywoodHolos } from '../districts/hollywood/holos';
import { laxCamera, laxLaunchFor, type LaxView } from '../districts/lax-spaceport/view';
import { installLaxHolos } from '../districts/lax-spaceport/holos';
import { launchPad, launchPhase, launchRumble, mountLaunch, requestLaunch, updateLaunch } from '../districts/lax-spaceport/launch';
import { gantryTris } from '../districts/lax-spaceport/gantry';
import { mountSoutheastFlares } from '../districts/southeast-industrial/field';
import { southBayCamera, type SouthBayView } from '../districts/south-bay-refineries/view';
import { installSouthBayHolos } from '../districts/south-bay-refineries/holos';
import { mountSouthBayFlares, southBayHum } from '../districts/south-bay-refineries/field';
import { harborCamera, type HarborView } from '../districts/harbor/view';
import { installHarborHolos } from '../districts/harbor/holos';
import { longBeachCamera, type LongBeachView } from '../districts/long-beach/view';
import { installLongBeachHolos } from '../districts/long-beach/holos';
import { eastLaCamera, type EastLaView } from '../districts/east-la/view';
import { installEastLaHolos } from '../districts/east-la/holos';
import { mountEastLaInterchanges } from '../districts/east-la/interchange';
import { eastLaMachinery } from '../districts/east-la/crossings';
import { marketPin } from '../districts/east-la/locate';
import { harborHum, mountHarbor, updateHarbor } from '../districts/harbor/field';
import { setRefineryFlame } from '../districts/_shared/refinery/flames';
import { installArtsHolos } from '../districts/arts-district/holos';
import { artsRiverBoost } from '../districts/arts-district/plan';
import { eastDistance } from '../districts/south-la-megablocks/spec';
import { wallaceCamera, type WallaceView } from '../districts/wallace-vernon/view';
import { updateWallace } from '../districts/wallace-vernon/live';
import { wallaceFaceSectorCount } from '../districts/wallace-vernon/faceDetail';
import { coastCamera, type CoastView } from '../districts/coastal-strip/view';
import { coastImpact, coastSegmentCount, installCoast, updateCoast } from '../districts/coastal-strip/live';
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
import { U } from '../atmosphere/uniforms';
import { GroundHaze } from '../atmosphere/GroundHaze';
import { WetReflector } from '../atmosphere/WetReflector';
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
  readonly wet: WetReflector;
  private readonly software: boolean;
  private lastCam = new Vector3();

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
    this.software = /swiftshader|llvmpipe|software|basic render/.test(dev.gpu.toLowerCase());
    const auto = autoTier(dev);
    this.autoTier = auto.tier;
    this.autoReason = auto.reason;
    const urlTier = (TIERS as string[]).includes(params.quality ?? '') ? (params.quality as Tier) : null;
    this.qualityChoice = urlTier ?? storedTier();
    this.quality = settingsFor(this.qualityChoice === 'auto' ? auto.tier : this.qualityChoice);
    this.marketAudio = new MarketAudio(this.ambience);
    this.wet = new WetReflector(this.scene);
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
    this.landmarks = new Landmarks(this.query);
    this.scene.add(this.landmarks.root);
    mountSoutheastFlares(this.scene, this.query.layout);
    mountSouthBayFlares(this.scene, this.query.layout);
    mountHarbor(this.scene, this.query.layout, this.query);
    mountLaunch(this.scene, this.query.layout);
    installCoast(this.scene, this.query, this.quality.tier);
    installShowcase(this.query.layout);
    installDtlaHolos(this.query.layout);
    installCivicHolos(this.query.layout);
    installLakewoodHolos(this.query.layout);
    installSouthLaHolos(this.query.layout);
    installArtsHolos(this.query.layout);
    installHollywoodHolos(this.query.layout);
    installLaxHolos(this.query.layout);
    installSouthBayHolos(this.query.layout);
    installHarborHolos(this.query.layout);
    installLongBeachHolos(this.query.layout);
    installEastLaHolos(this.query.layout);
    const eastDeck = mountEastLaInterchanges(this.query.layout);
    if (eastDeck) this.scene.add(eastDeck);
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

    const spots = marketSpots(this.query.layout);
    setSeats([...(spots.noodle?.seats ?? []), ...(spots.bibi?.seats ?? [])]);

    this.input = new Input(this.canvas);
    if (TouchControls.wanted()) this.touch = new TouchControls(this.input.touch);
    this.hud = new HUD(params.hud);

    const fly = new FlyController(this.camera, this.input, this.query, this.scene);
    fly.blocksExtra = (x, y, z) => this.interiors.blocksFly(x, y, z);
    this.interiors.bind({
      toggle: [this.streamer.root, this.holos.group, this.crowd.mesh, ...this.traffic.nodes, ...this.ground.nodes],
      suppress: [this.rain.mesh, this.snow.mesh, this.haze.group, this.wet.mesh, ...this.lanes.nodes, fly.spinner],
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
    this.streamer.invalidateLod0();
    this.interiors.setTier(tier);
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
    const ground = this.query.groundHeight(cam.x, cam.z);
    const alt = cam.y - ground;
    const districtNow = this.query.district(cam.x, cam.z);
    const inMarket = districtNow.id === 'little-tokyo-market';
    const inDtla = districtNow.id === 'dtla';
    const inHistoric = districtNow.id === 'historic-core';
    const inK = districtNow.id === 'k-megablock';
    const inLake = districtNow.id === 'lakewood-megablocks';
    const inSouth = districtNow.id === 'south-la-megablocks';
    const inArts = districtNow.id === 'arts-district';
    const inSoutheast = districtNow.id === 'southeast-industrial';
    const inSouthBay = districtNow.id === 'south-bay-refineries';
    const inHarbor = districtNow.id === 'harbor';
    const inLong = districtNow.id === 'long-beach';
    const inEast = districtNow.id === 'east-la';
    const southAmber = inSouth ? Math.max(0, 1 - eastDistance(cam.x, cam.z) / 1500) : 0;
    const walLm = this.query.layout.landmarkById('wallace-pyramid');
    const inWallace = districtNow.id === 'wallace-vernon'
      || (!!walLm && Math.hypot(cam.x - walLm.x, cam.z - walLm.z) < walLm.reserveRadius + 40);
    const coast = updateCoast(cam, this.quality.tier, dt, this.elapsed, this.atmosphere.weather.params.rain, this.atmosphere.weather.params.wind, this.query.layout, params.surf);
    const inCoast = districtNow.id === 'coastal-strip' || coast.near > 0.45;
    const inCanyon = inDtla || (districtNow.id === 'financial-megatowers' && alt < 40);
    U.neonWet.value = inMarket && alt < 140 ? 0.92
      : inHistoric && alt < 120 ? 0.88
        : inCanyon && alt < 90 ? 0.62
          : inK && alt < 48 ? 0.5
            : inSouth && alt < 46 ? 0.42 + southAmber * 0.14
              : inLake && alt < 46 ? 0.38
                : inLong && alt < 72 ? 0.46
                  : inEast && alt < 40 ? 0.4
                    : inArts && alt < 50 ? 0.26
                    : inSouthBay && alt < 60 ? 0.16
                      : inHarbor && alt < 55 ? 0.14
                        : inCoast ? 0.06
                          : 0.22;
    const districtFog = inMarket ? Math.max(0, Math.min(1, 1 - alt / 70)) * 0.8
      : inHistoric && alt < 90 ? 0.42 * (1 - alt / 90)
        : inDtla && alt < 80 ? 0.28 * (1 - alt / 80)
          : inK && alt < 40 ? 0.36 * (1 - alt / 40)
            : inSouth && alt < 40 ? 0.34 * (1 - alt / 40)
              : inLake && alt < 40 ? 0.30 * (1 - alt / 40)
                : inWallace && alt < 110 ? 0.78 * (1 - alt / 110)
                  : 0;
    const artsFogK = this.quality.tier === 'low' ? 0.25
      : this.quality.tier === 'medium' ? 0.55
        : this.quality.tier === 'high' ? 0.85
          : 1;
    const artsFog = inArts && alt < 42
      ? (0.46 + artsRiverBoost(this.query.layout, cam.x, cam.z) * 0.28) * (1 - alt / 42) * artsFogK
      : 0;
    const sbFogK = this.quality.tier === 'low' ? 0.35
      : this.quality.tier === 'medium' ? 0.6
        : this.quality.tier === 'high' ? 0.85
          : 1;
    const sbFog = inSouthBay && alt < 80 ? 0.4 * (1 - alt / 80) * sbFogK : 0;
    const harborFog = inHarbor && alt < 90 ? 0.46 * (1 - alt / 90) * sbFogK : 0;
    const longFog = inLong && alt < 70 ? 0.22 * (1 - alt / 70) * sbFogK : 0;
    U.streetFog.value = Math.max(districtFog, coast.fog, artsFog, sbFog, harborFog, longFog);
    const dtSafe = Math.max(dt, 1e-4);
    this.query.warm(cam.x, cam.z, cam.x + ((cam.x - this.lastCam.x) / dtSafe) * 0.45, cam.z + ((cam.z - this.lastCam.z) / dtSafe) * 0.45);
    this.lastCam.copy(cam);

    const foci = [cam];
    if (this.cams.mode === 'cine' && this.cams.cine.prefetch) foci.push(this.cams.cine.prefetch);
    this.streamer.update(foci);
    this.landmarks.update(cam, this.quality.landmarkLod);
    updateWallace(cam, this.quality.tier, dt);
    this.holos.update(this.camera, this.quality, this.streamer.billboards());
    this.traffic.update(dt, this.camera, this.quality.traffic);
    this.lanes.update(dt, this.camera, this.quality.laneTraffic);
    this.ground.update(dt, this.camera, this.quality.groundTraffic, this.quality.freewayTraffic, this.quality.tier, this.elapsed);
    this.atmosphere.update(dt, this.elapsed, this.renderer);
    this.crowd.update(dt, cam.x, cam.z, this.query, this.quality, this.atmosphere.weather.params.rain);
    this.haze.update(cam.x, cam.z, ground, alt, this.quality.tier);
    const wantRefl = params.refl === 1 || (
      params.refl !== 0 && !this.software && (this.quality.tier === 'high' || this.quality.tier === 'ultra')
      && inMarket && alt < 28 && this.atmosphere.weather.wetness > 0.35
    );
    this.wet.place(cam.x, ground, cam.z, wantRefl);
    // depth precision fallback when reversed-Z is unavailable (WebGL2 without EXT_clip_control)
    const near = this.renderer.reversedDepthBuffer ? 0.1 : MathUtils.clamp(alt * 0.004, 0.15, 6);
    if (Math.abs(near - this.camera.near) > 0.01) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }

    const w = this.atmosphere.weather;
    const aboveClouds = MathUtils.clamp(1 - (cam.y - 1400) / 600, 0, 1);
    this.rain.update(dt, cam, w.params.rain * aboveClouds, w.params.wind * (1 + coast.crest * 0.85), w.windDir, this.quality.rainCount);
    this.snow.update(dt, cam, w.params.snow * aboveClouds, w.params.wind, w.windDir, this.quality.snowCount);
    const at = this.cams.mode === 'walk' ? this.cams.walk.pos : cam;
    this.interiors.update(dt, this.cams.mode, at.x, at.y, at.z, w.params.rain);
    const ride = this.interiors.consumeRide();
    if (ride && this.cams.mode === 'walk') {
      this.cams.walk.pos.set(ride.x, ride.y, ride.z);
      this.cams.walk.heading = ride.heading;
      this.camera.position.set(ride.x, ride.y + 1.7, ride.z);
      this.camera.rotation.set(this.cams.walk.pitch, -ride.heading, 0, 'YXZ');
    }
    this.ambience.setInterior(this.interiors.blend);
    this.ambience.setHum(this.interiors.humAmount);
    updateLaunch(this.elapsed, this.quality.tier, w.windDir, w.params.wind);
    const districtMach = inWallace
      ? Math.max(0, 1 - alt / 140) * 0.82
      : inArts ? Math.max(0, 1 - alt / 90) * 0.66
        : inSoutheast ? Math.max(0, 1 - alt / 110) * 0.5 : 0;
    this.ambience.setMachinery(Math.min(1, districtMach + launchRumble(cam.x, cam.y, cam.z) + southBayHum(cam.x, cam.y, cam.z, this.query.layout) + harborHum(cam.x, cam.y, cam.z, this.query.layout) + eastLaMachinery(cam.x, cam.y, cam.z, this.query.layout)));
    updateHarbor(this.elapsed, cam.x, cam.y, cam.z);
    setRefineryFlame(this.quality.tier, w.windDir, w.params.wind);
    this.ambience.setTraffic(this.ground.bed);
    this.ambience.setSurf(coast.surf, coast.impact, coast.crest);
    this.ambience.update(w.params.rain, w.params.snow, w.params.wind, alt);
    this.camera.updateMatrixWorld();
    const e = this.camera.matrixWorld.elements;
    const cook = marketSpots(this.query.layout).noodle?.cook ?? null;
    const hall = marketPin(this.query.layout);
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
    );

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
      ['draw', `${info.drawCalls} calls · ${(info.triangles / 1e6).toFixed(2)} M tris · crowd ${this.crowd.count} · holo ${this.holos.shown} · ground ${this.ground.streetCount}+${this.ground.freewayCount}`],
      ['query', `sync ${this.query.syncCount} · pending ${this.query.pending} · cell ${this.query.lastQueryMs.toFixed(0)} ms`],
      ['chunks', `far ${s.supersFar} · near ${s.chunksNear} · lod0 ${s.lod0} · jobs ${s.inFlight} · queue ${s.readyQueue} · gen ${s.lastGenMs.toFixed(0)} ms`],
      ['pos', `${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)} m · ${alt.toFixed(0)} m AGL`],
      ['geo', `${lat.toFixed(4)}, ${lon.toFixed(4)}`],
      ['district', `${d.name} (stage ${d.stage})`],
      ['sky', `${a.dayNight.label} · ${a.weather.label} · wet ${a.weather.wetness.toFixed(2)}`],
      ['mode', this.cams.mode === 'cine' ? `cinematic · ${this.cams.cine.label}` : this.cams.mode],
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
      hollywoodView: (kind: HollywoodView) => {
        const p = hollywoodCamera(this.query.layout, kind);
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
      /** Stage 17 cameras. `downtown` and `burn` also arm a mid-ascent launch. */
      laxView: (kind: LaxView) => {
        const arm = laxLaunchFor(kind);
        if (arm) requestLaunch(arm.phase, arm.pad);
        const p = laxCamera(this.query.layout, kind);
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
      /** Ignition now, or a phase 0..1 into the current burn. Optional pad index holds that gantry. */
      launch: (phase?: number, pad?: number) => {
        requestLaunch(phase ?? 0, pad);
        return { phase: phase ?? 0, pad: pad ?? launchPad() };
      },
      /** Stage 21 cameras: the carpet from a kilometre up, a junction, a market street, the river, the counter, a side street, the deck. */
      eastLaView: (kind: EastLaView) => {
        const p = eastLaCamera(this.query.layout, kind);
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
      /** Stage 20 cameras: the core from a kilometre up, the skyline from the harbor wall, the canyon, the Lakewood edge, the concourse, the freight lane. */
      longBeachView: (kind: LongBeachView) => {
        const p = longBeachCamera(this.query.layout, kind);
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
      /** Stage 19 cameras: the quay from a kilometre up, cranes over the harbor wall, stacks, a hull, the street, the control room, the port from LAX. */
      harborView: (kind: HarborView) => {
        const p = harborCamera(this.query.layout, kind);
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
      /** Stage 18 cameras: the coast from a kilometre up, the flare field from LAX, tanks, spheres, the sea-wall edge, a stack, the door, the control room, downtown. */
      southBayView: (kind: SouthBayView) => {
        const p = southBayCamera(this.query.layout, kind);
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
      /** Stage 15 cameras: the belt from a kilometre up, a flare, a tank farm, a pipe canyon, the pump door, the control room, downtown. */
      southeastView: (kind: SoutheastView) => {
        const p = southeastCamera(this.query.layout, kind);
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
      /** Stage 14 cameras: seams from a kilometre up, a quiet street, a strip, a roof. */
      basinView: (kind: BasinView) => {
        const p = basinCamera(this.query.layout, kind);
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
      /** Stage 13 cameras: the sector from a kilometre up, a quiet street, a strip, a roof, the 10, the yard, the diner, a Wilshire-side tower. */
      westsideView: (kind: WestsideView) => {
        const p = westsideCamera(this.query.layout, kind);
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
      /** Stage 12 cameras: street, court, market, spine, hub, signal, the 110, Wallace, the sector, the Lakewood seam, the laundry hall. */
      southLaView: (kind: SouthLaView) => {
        const p = southLaCamera(this.query.layout, kind);
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
      /** Stage 11 cameras: a residential street, a courtyard, a corner market, laundry, a signal, K's edge, the river, the sector, the shop, the yard. */
      lakewoodView: (kind: LakewoodView) => {
        const p = lakewoodCamera(this.query.layout, kind);
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
        landmarkLods: this.landmarks.lods.active.join('/'),
        beacons: this.landmarks.beacons.count,
        launch: launchPhase(),
        launchPad: launchPad(),
        gantryTris: gantryTris.join('/'),
        querySyncs: this.query.syncCount,
        queryPending: this.query.pending,
        refl: this.wet.enabled,
        ...this.interiors.stats,
        faceSectors: wallaceFaceSectorCount(),
        coastSegments: coastSegmentCount(),
        coastImpact: coastImpact(),
      }),
    };
  }
}
