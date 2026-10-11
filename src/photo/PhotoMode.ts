// Photo mode. Constructed on the first toggle so the post chain stays out of the first load.
import { Raycaster, Vector2, Vector3, type Object3D } from 'three/webgpu';
import { U } from '../atmosphere/uniforms';
import { applyAirLayers } from '../atmosphere/airState';
import { frameSize, visibleFraction } from './limits';
import { GRADES } from './grades';
import { POSTCARDS, postcardById } from './postcards';
import { PhotoCamera } from './PhotoCamera';
import { createPhotoPipeline, type PhotoPipeline } from './pipeline';
import { captureShot, imageDataUrl } from './capture';
import type { CaptureRequest, CaptureResult, GradeId, LetterboxId, PhotoHost, PhotoState } from './types';

const LETTERS: Array<[LetterboxId, string]> = [
  ['off', 'Full frame'],
  ['16:9', '16:9'],
  ['2.39', '2.39:1'],
  ['9:19.5', '9:19.5 wallpaper'],
  ['1:1', '1:1'],
];

const SIZES: Array<[PhotoState['size'], string]> = [
  ['screen', 'Screen'],
  ['1080', '1920×1080'],
  ['1440', '2560×1440'],
  ['wallpaper', 'Phone wallpaper'],
];

export class PhotoMode {
  active = false;
  private busy = false;
  private pipeline: PhotoPipeline | null = null;
  private readonly cam: PhotoCamera;
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly scale = new Vector3(1, 1, 1);
  private grainSeed = 0;
  private lastImageUrl: string | null = null;
  private postcardId = '';
  private saved = { weatherFrozen: false, dayFrozen: false, snowCover: 0, wetness: 0, hours: 22, fov: 60 };
  private savedMatrix = new Array<number>(16).fill(0);
  private readonly state: PhotoState = {
    focal: 35, focus: 12, aperture: 0.35, roll: 0, exposure: 1,
    grade: 'plain', grain: 0.12, vignette: 0.28, bloom: 0.28,
    letterbox: 'off', rain: 0, fog: 0.0016, snow: 0, hours: 22,
    orbit: false, guide: 'off', size: '1080', postcard: '',
  };

  private readonly root: HTMLDivElement;
  private readonly sheet: HTMLDivElement;
  private readonly readout: HTMLDivElement;
  private readonly bars: HTMLDivElement;
  private readonly guide: SVGSVGElement;
  private readonly safeRect: SVGRectElement;
  private readonly sliders = new Map<string, HTMLInputElement>();
  private gradeSel!: HTMLSelectElement;
  private boxSel!: HTMLSelectElement;
  private sizeSel!: HTMLSelectElement;
  private orbitBtn!: HTMLButtonElement;
  private guideBtn!: HTMLButtonElement;

  constructor(private host: PhotoHost) {
    this.cam = new PhotoCamera(host.canvas, host.layout);
    this.cam.onTap = (x, y) => this.focusAt(x, y);
    this.raycaster.far = 2000;
    this.root = el('div', 'photo-ui');
    this.bars = el('div', 'photo-bars');
    this.bars.append(el('div', 'bar t'), el('div', 'bar b'), el('div', 'bar l'), el('div', 'bar r'));
    this.guide = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.guide.setAttribute('class', 'photo-guide');
    this.guide.setAttribute('viewBox', '0 0 160 90');
    this.guide.setAttribute('preserveAspectRatio', 'none');
    this.safeRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    this.drawGuide();
    const bar = el('div', 'photo-bar');
    bar.append(
      button('Exit', () => this.exit()),
      button('Lens', () => { this.sheet.hidden = !this.sheet.hidden; }),
      (this.orbitBtn = button('Orbit', () => {
        this.cam.setOrbit(!this.cam.orbit);
        this.orbitBtn.classList.toggle('on', this.cam.orbit);
      })),
      (this.guideBtn = button('Guide', () => this.cycleGuide())),
      button('Shutter', () => { void this.capture({ kind: this.state.size }); }),
    );
    this.readout = el('div', 'photo-readout');
    this.sheet = el('div', 'photo-sheet');
    this.sheet.hidden = matchMedia('(pointer: coarse)').matches;
    this.buildSheet();
    const veil = el('div', 'photo-veil', 'Exposing');
    this.root.append(this.bars, this.guide, bar, this.readout, this.sheet, veil);
    this.root.hidden = true;
    document.body.appendChild(this.root);
  }

  enter(): void {
    if (this.active) return;
    const cam = this.host.camera;
    this.saved.fov = cam.fov;
    this.savedMatrix = Array.from(cam.matrixWorld.elements);
    this.saved.weatherFrozen = this.host.weather.frozen;
    this.saved.dayFrozen = this.host.dayNight.frozen;
    this.saved.snowCover = this.host.weather.snowCover;
    this.saved.wetness = this.host.weather.wetness;
    this.saved.hours = this.host.dayNight.hours;
    this.host.dayNight.frozen = true;
    this.host.weather.frozen = true;
    this.host.input.suspendPointer = true;
    this.host.input.pointerLockWanted = false;
    if (document.pointerLockElement) document.exitPointerLock();
    const touch = this.host.input.touch;
    touch.moveX = touch.moveY = touch.lookX = touch.lookY = 0;
    touch.up = touch.down = touch.boost = false;
    this.host.ambience.setDuck(0.2);
    this.cam.grab(cam);
    const tier = this.host.tier();
    this.state.focal = this.cam.focal;
    this.state.focus = this.cam.focus;
    this.state.roll = this.cam.roll;
    this.state.aperture = 0.35;
    this.state.exposure = 1;
    this.state.grade = 'plain';
    this.state.grain = 0.12;
    this.state.vignette = 0.28;
    this.state.bloom = tier === 'low' ? 0.2 : tier === 'medium' ? 0.28 : 0.4;
    this.state.letterbox = 'off';
    this.state.guide = 'off';
    this.state.rain = this.host.weather.params.rain;
    this.state.snow = this.host.weather.params.snow;
    this.state.fog = this.host.weather.params.fog;
    this.state.hours = this.host.dayNight.hours;
    this.state.orbit = false;
    this.state.postcard = '';
    this.postcardId = '';
    this.cam.setOrbit(false);
    this.rebuild();
    this.pullSliders();
    this.active = true;
    this.root.hidden = false;
    document.body.classList.add('photo-on');
    this.cam.attach();
    this.placeOverlays();
  }

  exit(): void {
    if (!this.active || this.busy) return;
    this.active = false;
    this.cam.detach();
    this.pipeline?.dispose();
    this.pipeline = null;
    this.host.dayNight.frozen = this.saved.dayFrozen;
    this.host.dayNight.hours = this.saved.hours;
    this.host.weather.frozen = this.saved.weatherFrozen;
    this.host.weather.snowCover = this.saved.snowCover;
    this.host.weather.wetness = this.saved.wetness;
    this.host.ambience.setDuck(1);
    this.host.input.suspendPointer = false;
    this.host.input.pointerLockWanted = this.host.mode() === 'fly' || this.host.mode() === 'walk';
    const cam = this.host.camera;
    cam.matrix.fromArray(this.savedMatrix);
    cam.matrix.decompose(cam.position, cam.quaternion, this.scale);
    cam.matrixAutoUpdate = true;
    this.host.restoreView(this.saved.fov);
    document.body.classList.remove('photo-on', 'photo-busy');
    this.root.hidden = true;
  }

  /** Hours, before the sky is evaluated, so the shot's clock is the one the sun uses. */
  preAtmosphere(): void {
    if (!this.active) return;
    this.host.dayNight.hours = this.state.hours;
  }

  /** Particle and fog overrides. The weather machine still rewrites its blend; this puts the shot back on top. */
  postAtmosphere(): void {
    if (!this.active) return;
    const w = this.host.weather;
    w.params.rain = this.state.rain;
    w.params.snow = this.state.snow;
    w.params.fog = this.state.fog;
    w.wetness = this.state.rain > 0.2
      ? Math.max(this.saved.wetness, Math.min(1, 0.35 + this.state.rain * 0.65))
      : this.saved.wetness;
    w.snowCover = this.state.snow > 0.05 ? Math.max(this.saved.snowCover, this.state.snow) : this.saved.snowCover;
    U.wetness.value = w.wetness;
    U.snow.value = w.snowCover;
    U.fogDensity.value = this.state.fog * (1 + Number(U.streetFog.value));
    U.haze.value = 0.00003 + this.state.fog * 0.02;
    applyAirLayers(
      this.state.fog, w.params.layer, w.params.layerY, w.params.smogTint,
      Number(U.night.value), Number(U.daylight.value),
    );
    this.host.renderer.toneMappingExposure = this.host.exposure() * this.state.exposure;
  }

  update(dt: number): void {
    if (!this.active || this.busy) return;
    const input = this.host.input;
    if (input.wasPressed('BracketLeft')) this.state.hours = (this.state.hours + 23) % 24;
    if (input.wasPressed('BracketRight')) this.state.hours = (this.state.hours + 1) % 24;
    this.cam.update(dt, input);
    this.cam.apply(this.host.camera);
    this.state.focal = this.cam.focal;
    this.state.focus = this.cam.focus;
    this.state.roll = this.cam.roll;
    this.state.orbit = this.cam.orbit;
    this.orbitBtn.classList.toggle('on', this.cam.orbit);
    this.placeOverlays();
  }

  render(): void {
    if (!this.active || !this.pipeline || this.busy) return;
    this.grainSeed = (this.grainSeed + 1) % 997;
    this.pipeline.shade(this.shade());
    this.pipeline.render();
  }

  focusPoints(): Vector3[] {
    return this.cam.focusPoints();
  }

  onResize(): void {
    if (this.active) this.placeOverlays();
  }

  retier(): void {
    if (this.active) this.rebuild();
  }

  setLens(p: Partial<Pick<PhotoState, 'focal' | 'focus' | 'aperture' | 'roll'>>): void {
    if (!this.active) return;
    if (p.focal != null) this.cam.focal = clamp(p.focal, 18, 200);
    if (p.focus != null) this.cam.focus = clamp(p.focus, 0.4, 400);
    if (p.aperture != null) this.state.aperture = clamp(p.aperture, 0, 1);
    if (p.roll != null) this.cam.roll = clamp(p.roll, -Math.PI / 6, Math.PI / 6);
    if (this.cam.orbit) this.cam.captureTarget();
    this.pullSliders();
  }

  setLook(p: Partial<Pick<PhotoState, 'grade' | 'grain' | 'vignette' | 'bloom' | 'exposure' | 'letterbox'>>): void {
    if (!this.active) return;
    if (p.grade) this.state.grade = p.grade;
    if (p.grain != null) this.state.grain = clamp(p.grain, 0, 1);
    if (p.vignette != null) this.state.vignette = clamp(p.vignette, 0, 1);
    if (p.bloom != null) this.state.bloom = clamp(p.bloom, 0, 1.5);
    if (p.exposure != null) this.state.exposure = clamp(p.exposure, 0.4, 2.2);
    if (p.letterbox) this.state.letterbox = p.letterbox;
    this.pullSliders();
    this.placeOverlays();
  }

  setShot(p: Partial<Pick<PhotoState, 'rain' | 'fog' | 'snow' | 'hours'>>): void {
    if (!this.active) return;
    if (p.rain != null) this.state.rain = clamp(p.rain, 0, 1);
    if (p.fog != null) this.state.fog = clamp(p.fog, 0.0002, 0.006);
    if (p.snow != null) this.state.snow = clamp(p.snow, 0, 1);
    if (p.hours != null) this.state.hours = ((p.hours % 24) + 24) % 24;
    this.pullSliders();
  }

  postcard(id: string): boolean {
    if (!this.active) return false;
    const card = postcardById(id);
    if (!card) return false;
    const pose = card.pose(this.host.layout, this.host.query);
    if (!pose) {
      this.host.flash('That view is not in this city.');
      return false;
    }
    this.cam.setPose(pose);
    this.cam.focal = card.focal;
    this.cam.focus = card.focus;
    this.cam.roll = card.roll;
    this.state.aperture = card.aperture;
    this.state.grade = card.grade;
    this.state.grain = card.grain;
    this.state.vignette = card.vignette;
    this.state.bloom = card.bloom;
    this.state.exposure = card.exposure;
    this.state.letterbox = card.letterbox;
    this.state.rain = card.rain;
    this.state.fog = card.fog;
    this.state.snow = card.snow;
    this.state.hours = card.hours;
    this.state.postcard = id;
    this.postcardId = id;
    if (this.cam.orbit) this.cam.captureTarget();
    void this.host.query.prime(pose.x, pose.z);
    this.cam.apply(this.host.camera);
    this.pullSliders();
    this.placeOverlays();
    return true;
  }

  async capture(req: CaptureRequest = {}): Promise<CaptureResult> {
    const empty: CaptureResult = {
      ok: false, width: 0, height: 0, kind: req.kind ?? this.state.size, ms: 0, renderMs: 0, tiles: 0,
      bytes: 0, heapBefore: null, heapPeak: null, method: 'none', readback: false, capped: false,
      filename: '', center: [0, 0, 0, 0], error: 'not in photo mode',
    };
    if (!this.active || !this.pipeline || this.busy) return empty;
    this.busy = true;
    document.body.classList.add('photo-busy');
    this.pipeline.shade(this.shade());
    try {
      const file = await captureShot({
        renderer: this.host.renderer,
        camera: this.host.camera,
        pipeline: this.pipeline,
        tier: this.host.tier(),
        letterbox: this.state.letterbox,
        focal: this.cam.focal,
        backend: this.host.backend(),
        lock: this.host.lock,
      }, { kind: this.state.size, ...req }, this.postcardId || 'frame');
      if (file.blob) this.lastImageUrl = await imageDataUrl(file.blob);
      if (file.result.error) this.host.flash(file.result.error);
      return file.result;
    } finally {
      this.busy = false;
      document.body.classList.remove('photo-busy');
      if (this.active) this.cam.apply(this.host.camera);
    }
  }

  snapshot(): PhotoState {
    return { ...this.state, focal: this.cam.focal, focus: this.cam.focus, roll: this.cam.roll, orbit: this.cam.orbit };
  }

  lastImage(): string | null {
    return this.lastImageUrl;
  }

  private shade() {
    return {
      focus: this.cam.focus,
      aperture: this.state.aperture,
      bloom: this.state.bloom,
      grain: this.state.grain,
      vignette: this.state.vignette,
      grade: this.state.grade,
      grainSeed: this.grainSeed,
    };
  }

  private rebuild(): void {
    this.pipeline?.dispose();
    this.pipeline = createPhotoPipeline(this.host.renderer, this.host.scene, this.host.camera, this.host.tier());
  }

  private cycleGuide(): void {
    this.state.guide = this.state.guide === 'off' ? 'left' : this.state.guide === 'left' ? 'right' : 'off';
    this.guideBtn.classList.toggle('on', this.state.guide !== 'off');
    this.guideBtn.textContent = this.state.guide === 'off' ? 'Guide' : this.state.guide === 'left' ? 'Guide L' : 'Guide R';
    this.placeOverlays();
  }

  private focusAt(clientX: number, clientY: number): void {
    const rect = this.host.canvas.getBoundingClientRect();
    this.ndc.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.host.camera);
    const hits = this.raycaster.intersectObjects(this.host.scene.children, true);
    for (const hit of hits) {
      if (skipObject(hit.object)) continue;
      this.cam.focus = Math.max(0.4, hit.distance);
      if (this.cam.orbit) this.cam.captureTarget();
      this.pullSliders();
      return;
    }
    const { origin, direction } = this.raycaster.ray;
    if (Math.abs(direction.y) < 1e-4) return;
    const t0 = -origin.y / direction.y;
    if (t0 < 0.4) return;
    const g = this.host.layout.heightAt(origin.x + direction.x * t0, origin.z + direction.z * t0);
    const t = (g - origin.y) / direction.y;
    if (t > 0.4) {
      this.cam.focus = t;
      if (this.cam.orbit) this.cam.captureTarget();
      this.pullSliders();
    }
  }

  private placeOverlays(): void {
    const vw = innerWidth;
    const vh = innerHeight;
    const frac = visibleFraction(vw, vh, this.state.letterbox);
    const nodes = this.bars.children;
    const top = nodes[0] as HTMLElement;
    const bottom = nodes[1] as HTMLElement;
    const left = nodes[2] as HTMLElement;
    const right = nodes[3] as HTMLElement;
    top.style.height = `${frac.y * 100}%`;
    bottom.style.height = `${(1 - frac.y - frac.h) * 100}%`;
    left.style.width = `${frac.x * 100}%`;
    right.style.width = `${(1 - frac.x - frac.w) * 100}%`;
    const show = this.state.guide !== 'off';
    this.guide.style.display = show ? '' : 'none';
    if (show) {
      const vx = frac.x * vw;
      const vy = frac.y * vh;
      const fw = frac.w * vw;
      const fh = frac.h * vh;
      const target = 16 / 9;
      const region = fw / Math.max(1, fh);
      let gw = fw, gh = fh, gx = vx, gy = vy;
      if (region > target) {
        gw = fh * target;
        gx = vx + (fw - gw) / 2;
      } else {
        gh = fw / target;
        gy = vy + (fh - gh) / 2;
      }
      this.guide.style.left = `${gx}px`;
      this.guide.style.top = `${gy}px`;
      this.guide.style.width = `${gw}px`;
      this.guide.style.height = `${gh}px`;
      const leftSide = this.state.guide !== 'right';
      this.safeRect.setAttribute('x', leftSide ? '8' : '100');
    }
    const size = frameSize(this.state.size, this.state.size === 'wallpaper' ? '9:19.5' : this.state.letterbox, this.host.tier(), vw, vh);
    const roll = Math.round(this.cam.roll * 180 / Math.PI);
    this.readout.textContent = `${Math.round(this.cam.focal)} mm · ${this.cam.focus.toFixed(1)} m · roll ${roll}° · save ${size.w}×${size.h}${size.capped ? ' (capped)' : ''}`;
  }

  private buildSheet(): void {
    this.slider('Focal', 'focal', 0, 1000, 1, () => logTo(18, 200, this.cam.focal), (v) => { this.cam.focal = fromLog(18, 200, v); }, () => `${Math.round(this.cam.focal)} mm`);
    this.slider('Focus', 'focus', 0, 1000, 1, () => logTo(0.4, 400, this.cam.focus), (v) => {
      this.cam.focus = fromLog(0.4, 400, v);
      if (this.cam.orbit) this.cam.captureTarget();
    }, () => `${this.cam.focus.toFixed(1)} m`);
    this.slider('Aperture', 'aperture', 0, 100, 1, () => this.state.aperture * 100, (v) => { this.state.aperture = v / 100; }, () => this.state.aperture.toFixed(2));
    this.slider('Roll', 'roll', -30, 30, 1, () => this.cam.roll * 180 / Math.PI, (v) => { this.cam.roll = v * Math.PI / 180; }, () => `${Math.round(this.cam.roll * 180 / Math.PI)}°`);
    this.slider('Exposure', 'exposure', 40, 220, 1, () => this.state.exposure * 100, (v) => { this.state.exposure = v / 100; }, () => this.state.exposure.toFixed(2));
    this.slider('Grain', 'grain', 0, 100, 1, () => this.state.grain * 100, (v) => { this.state.grain = v / 100; }, () => this.state.grain.toFixed(2));
    this.slider('Vignette', 'vignette', 0, 100, 1, () => this.state.vignette * 100, (v) => { this.state.vignette = v / 100; }, () => this.state.vignette.toFixed(2));
    this.slider('Bloom', 'bloom', 0, 100, 1, () => this.state.bloom * 100, (v) => { this.state.bloom = v / 100; }, () => this.state.bloom.toFixed(2));
    this.slider('Rain', 'rain', 0, 100, 1, () => this.state.rain * 100, (v) => { this.state.rain = v / 100; }, () => this.state.rain.toFixed(2));
    this.slider('Fog', 'fog', 2, 60, 1, () => this.state.fog * 10000, (v) => { this.state.fog = v / 10000; }, () => this.state.fog.toFixed(4));
    this.slider('Snow', 'snow', 0, 100, 1, () => this.state.snow * 100, (v) => { this.state.snow = v / 100; }, () => this.state.snow.toFixed(2));
    this.slider('Hour', 'hours', 0, 240, 1, () => this.state.hours * 10, (v) => { this.state.hours = v / 10; }, () => this.state.hours.toFixed(1));

    this.gradeSel = document.createElement('select');
    for (const g of GRADES) this.gradeSel.append(new Option(g.name, g.id));
    this.gradeSel.addEventListener('change', () => { this.state.grade = this.gradeSel.value as GradeId; });
    this.boxSel = document.createElement('select');
    for (const [id, name] of LETTERS) this.boxSel.append(new Option(name, id));
    this.boxSel.addEventListener('change', () => {
      this.state.letterbox = this.boxSel.value as LetterboxId;
      this.placeOverlays();
    });
    this.sizeSel = document.createElement('select');
    for (const [id, name] of SIZES) this.sizeSel.append(new Option(name, id));
    this.sizeSel.addEventListener('change', () => {
      this.state.size = this.sizeSel.value as PhotoState['size'];
      this.placeOverlays();
    });
    const cards = document.createElement('select');
    cards.append(new Option('Postcard…', ''));
    for (const card of POSTCARDS) cards.append(new Option(card.name, card.id));
    cards.addEventListener('change', () => {
      if (cards.value) this.postcard(cards.value);
      cards.value = '';
    });
    const row = el('div', 'photo-picks');
    row.append(this.gradeSel, this.boxSel, this.sizeSel, cards);
    this.sheet.append(row);
  }

  private slider(label: string, key: string, min: number, max: number, step: number, read: () => number, write: (v: number) => void, text: () => string): void {
    const wrap = el('label', 'photo-slider');
    const name = el('span', 'k', label);
    const val = el('span', 'v');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const paint = () => { val.textContent = text(); };
    input.addEventListener('input', () => {
      write(Number(input.value));
      paint();
    });
    wrap.append(name, input, val);
    this.sheet.append(wrap);
    this.sliders.set(key, input);
    input.value = String(read());
    paint();
  }

  private pullSliders(): void {
    const set = (key: string, value: number) => {
      const input = this.sliders.get(key);
      if (!input) return;
      input.value = String(value);
      input.dispatchEvent(new Event('input'));
    };
    set('focal', logTo(18, 200, this.cam.focal));
    set('focus', logTo(0.4, 400, this.cam.focus));
    set('aperture', this.state.aperture * 100);
    set('roll', this.cam.roll * 180 / Math.PI);
    set('exposure', this.state.exposure * 100);
    set('grain', this.state.grain * 100);
    set('vignette', this.state.vignette * 100);
    set('bloom', this.state.bloom * 100);
    set('rain', this.state.rain * 100);
    set('fog', this.state.fog * 10000);
    set('snow', this.state.snow * 100);
    set('hours', this.state.hours * 10);
    this.gradeSel.value = this.state.grade;
    this.boxSel.value = this.state.letterbox;
    this.sizeSel.value = this.state.size;
    this.orbitBtn.classList.toggle('on', this.cam.orbit);
  }

  private drawGuide(): void {
    const ink = 'rgba(255,255,255,0.72)';
    const line = (x1: number, y1: number, x2: number, y2: number) => {
      const n = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      n.setAttribute('x1', String(x1));
      n.setAttribute('y1', String(y1));
      n.setAttribute('x2', String(x2));
      n.setAttribute('y2', String(y2));
      n.setAttribute('stroke', ink);
      n.setAttribute('stroke-width', '0.4');
      this.guide.append(n);
    };
    line(160 / 3, 0, 160 / 3, 90);
    line((160 / 3) * 2, 0, (160 / 3) * 2, 90);
    line(0, 30, 160, 30);
    line(0, 60, 160, 60);
    this.safeRect.setAttribute('x', '8');
    this.safeRect.setAttribute('y', '10');
    this.safeRect.setAttribute('width', '52');
    this.safeRect.setAttribute('height', '70');
    this.safeRect.setAttribute('fill', 'none');
    this.safeRect.setAttribute('stroke', 'rgba(255,154,46,0.9)');
    this.safeRect.setAttribute('stroke-width', '0.6');
    this.guide.append(this.safeRect);
  }
}

function skipObject(object: Object3D): boolean {
  let node: Object3D | null = object;
  while (node) {
    const name = node.name;
    if (name.startsWith('precip-') || name === 'wet-reflector' || name === 'ground-haze') return true;
    node = node.parent;
  }
  return false;
}

function el(tag: string, cls: string, text = ''): HTMLDivElement {
  const node = document.createElement(tag);
  node.className = cls;
  if (text) node.textContent = text;
  return node as HTMLDivElement;
}

function button(label: string, fn: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    fn();
    b.blur();
  });
  return b;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function logTo(min: number, max: number, value: number): number {
  const t = (Math.log(clamp(value, min, max)) - Math.log(min)) / (Math.log(max) - Math.log(min));
  return t * 1000;
}

function fromLog(min: number, max: number, slider: number): number {
  const t = clamp(slider, 0, 1000) / 1000;
  return Math.exp(Math.log(min) + t * (Math.log(max) - Math.log(min)));
}
