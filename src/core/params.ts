// URL parameters (handy for debugging, screenshots and sharing a view).
//   ?mode=fly|walk|cine  &at=<landmark|poi id>  &x=&y=&z=&yaw=&pitch=  (yaw/pitch in degrees)
//   &time=22.5  &weather=rain  &quality=low|medium|high|ultra  &webgl=1  &hud=1  &ui=0  &freeze=1  &seed=123
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
  seed: num('seed'),
};
