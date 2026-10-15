// URL parameters (handy for debugging, screenshots and sharing a view).
//   ?mode=fly|walk|cine  &at=<landmark|poi id>  &x=&y=&z=&yaw=&pitch=  (yaw/pitch in degrees)
//   &time=22.5  &weather=rain  &quality=low|medium|high|ultra  &webgl=1  &hud=1  &ui=0  &freeze=1
//   &seed=123  pins weather, precipitation, traffic and the env map, and holds the sim clock at 48s
//   &capture=1  visual capture: freezes time and wind, then stops streaming and unloading after the initial load
//   &frame=k:street  applies one authored debug camera (name:kind) before the first frame
//   &tonemap=agx|aces|neutral  &ev=4.26  locks the camera exposure value
//   &smoke=live draws the plume. &smoke=off hides it. Capture stays on the baseline plates unless live is set.
//   &surf=1 holds the sea-wall breaker at impact (screenshots)
//   &refl=1 forces the planar wet-street mirror; &refl=0 keeps the cheap fake pools only
const q = new URLSearchParams(location.search);

const num = (k: string): number | undefined => {
  const v = q.get(k);
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export const params = {
  mode: q.get('mode') ?? undefined,
  at: q.get('at') ?? undefined,
  x: num('x'),
  y: num('y'),
  z: num('z'),
  yaw: num('yaw'),
  pitch: num('pitch'),
  time: num('time'),
  weather: q.get('weather') ?? undefined,
  quality: q.get('quality') ?? undefined,
  forceWebGL: q.get('webgl') === '1',
  hud: q.get('hud') === '1',
  ui: q.get('ui') !== '0',
  freeze: q.get('freeze') === '1',
  /** Hold the sea-wall breaker at the impact phase. Screenshots only. */
  surf: q.get('surf') === '1',
  /** `full` turns off the reduced coastal lightning. Default is gentle. */
  flash: q.get('flash') === 'full' ? 'full' as const : 'gentle' as const,
  seed: num('seed'),
  /** Visual capture. Freezes time and wind, and stops streaming once the initial meshes are up. */
  capture: q.get('capture') === '1',
  /** Authored debug camera, `name:kind` (for example `k:street`). Absent unless the URL sets it. */
  frame: q.get('frame') ?? undefined,
  /** 1 force planar reflector, 0 force off, undefined = auto (high/ultra, real GPU, in the market). */
  refl: q.get('refl') === '1' ? 1 : q.get('refl') === '0' ? 0 : undefined,
  /** Memory overlay. Does not change the picture by itself. */
  mem: q.get('mem') === '1',
  /** Throw if a texture, geometry, render target or material is constructed outside the resource manager. */
  memguard: q.get('memguard') === '1',
  /** Record each WebGL program link on `window.__shaderLinks` for the load budget. */
  loadprobe: q.get('loadprobe') === '1',
  /** `android` | `ios` | `desktop`, or a tab budget in megabytes. */
  budget: q.get('budget') ?? undefined,
  tonemap: q.get('tonemap') ?? undefined,
  ev: num('ev'),
  /** `live` draws smoke and steam. `off` hides them. Absent uses the build default. */
  smoke: q.get('smoke') ?? undefined,
};
