// Headless screenshots of the running app (dev server or `vite preview`).
//   npm run dev  (in another terminal)   then   npm run screenshots
// Env: BASE_URL (default http://localhost:5173/), OUT (default ./screenshots-tmp), CHROME (executable path),
//      GPU=1 to try the real GPU / WebGPU instead of the SwiftShader WebGL2 fallback, ONLY=<shot name>.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/';
const OUT = process.env.OUT ?? 'screenshots-tmp';
const GPU = process.env.GPU === '1';
mkdirSync(OUT, { recursive: true });

const common = 'freeze=1&ui=0&quality=high' + (GPU ? '' : '&webgl=1');
const desktop = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
const iphone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

const only = new Set((process.env.ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean));

const shots = [
  // above Little Tokyo / Bunker Hill looking south-east over downtown toward the Wallace pyramid
  { name: 'fly-downtown', ctx: desktop, q: `mode=fly&x=-900&y=330&z=-900&yaw=140&pitch=-9&time=21.5&weather=rain&${common}` },
  // street level in the Little Tokyo night market
  { name: 'walk-street', ctx: desktop, q: `mode=walk&at=noodle-bar&time=22&weather=rain&${common}`, after: () => window.__nla.streetView('noodle-bar', 0, -20) },
  // cinematic camera (random shot; letterboxed)
  { name: 'cinematic', ctx: desktop, q: `mode=cine&time=20&weather=drizzle&freeze=1&ui=0&quality=high${GPU ? '' : '&webgl=1'}`, cine: true },
  // phone-sized viewport with touch controls, flying past LAPD HQ
  { name: 'iphone-fly', ctx: iphone, q: `mode=fly&at=lapd-hq&time=21&weather=rain&freeze=1&quality=medium&touch=1${GPU ? '' : '&webgl=1'}` },
  // daytime smog toward the pyramid
  { name: 'day-smog-pyramid', ctx: desktop, q: `mode=fly&at=wallace-pyramid&time=15&weather=smog&${common}` },
  // Stage 2 — Little Tokyo night market. Cameras come from __nla.marketView.
  { name: 'market-street', ctx: desktop, q: `mode=walk&at=noodle-bar&time=22.5&weather=rain&${common}`, after: () => window.__nla.marketView('street') },
  { name: 'market-roof', ctx: desktop, q: `mode=fly&at=noodle-bar&time=22.5&weather=rain&${common}`, after: () => window.__nla.marketView('roof') },
  { name: 'market-interior', ctx: desktop, q: `mode=walk&at=noodle-bar&time=22.5&weather=rain&${common}`, after: () => window.__nla.marketView('interior') },
  { name: 'market-crowd', ctx: desktop, q: `mode=walk&at=noodle-bar&time=22.5&weather=rain&${common}`, after: () => window.__nla.marketView('crowd') },
  { name: 'market-medium', ctx: desktop, q: `mode=walk&at=noodle-bar&time=22.5&weather=rain&freeze=1&ui=0&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.marketView('street') },
  { name: 'market-iphone', ctx: { ...iphone, deviceScaleFactor: 1 }, q: `mode=walk&at=noodle-bar&time=22.5&weather=rain&freeze=1&ui=0&quality=medium&touch=1${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.marketView('street') },
  { name: 'market-low', ctx: desktop, q: `mode=walk&at=noodle-bar&time=22.5&weather=rain&freeze=1&ui=0&quality=low${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.marketView('street') },
  { name: 'market-ultra', ctx: desktop, q: `mode=walk&at=noodle-bar&time=22.5&weather=rain&freeze=1&ui=0&quality=ultra${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.marketView('street') },
  // X4 — holograms at night. Cameras come from __nla.holoView.
  { name: 'holo-street', ctx: desktop, q: `mode=walk&at=noodle-bar&time=22.5&weather=rain&${common}`, after: () => window.__nla.holoView('street'), holo: 'street' },
  { name: 'holo-aerial', ctx: desktop, q: `mode=fly&at=megatower-1&time=22&weather=rain&${common}`, after: () => window.__nla.holoView('aerial'), holo: 'aerial' },
  { name: 'holo-cine', ctx: desktop, q: `mode=cine&time=22&weather=rain&freeze=1&ui=0&quality=high${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.holoView('cine'), holo: 'cine' },
  // Stage 3 — Financial District megatowers. Cameras come from __nla.megaView.
  { name: 'mega-approach-night', ctx: desktop, q: `mode=fly&at=megatower-1&time=22&weather=rain&${common}`, after: () => window.__nla.megaView('approach') },
  { name: 'mega-skyline-day', ctx: desktop, q: `mode=fly&at=megatower-1&time=14&weather=clear&${common}`, after: () => window.__nla.megaView('skyline') },
  { name: 'mega-street-up', ctx: desktop, q: `mode=walk&at=megatower-1&time=22&weather=rain&${common}`, after: () => window.__nla.megaView('street') },
  { name: 'mega-lanes', ctx: desktop, q: `mode=fly&at=megatower-1&time=22&weather=drizzle&${common}`, after: () => window.__nla.megaView('lanes') },
  { name: 'mega-crown', ctx: desktop, q: `mode=fly&at=megatower-1&time=21&weather=rain&${common}`, after: () => window.__nla.megaView('crown') },
  { name: 'mega-iphone', ctx: { ...iphone, deviceScaleFactor: 1 }, q: `mode=fly&at=megatower-1&time=22&weather=rain&freeze=1&ui=0&quality=medium&touch=1${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.megaView('crown') },
  { name: 'mega-low', ctx: desktop, q: `mode=fly&at=megatower-1&time=22&weather=drizzle&freeze=1&ui=0&quality=low${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.megaView('lanes') },
  { name: 'mega-medium', ctx: desktop, q: `mode=fly&at=megatower-1&time=22&weather=drizzle&freeze=1&ui=0&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.megaView('lanes') },
  { name: 'mega-ultra', ctx: desktop, q: `mode=fly&at=megatower-1&time=22&weather=drizzle&freeze=1&ui=0&quality=ultra${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.megaView('lanes') },
  { name: 'holo-medium', ctx: desktop, q: `mode=walk&at=noodle-bar&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.holoView('street'), holo: 'street' },
  // Stage 4 — Downtown megablocks. Cameras come from __nla.dtlaView.
  { name: 'dtla-street-rain', ctx: desktop, q: `mode=walk&at=dtla-canyon&time=22.5&weather=rain&${common}`, after: () => window.__nla.dtlaView('street'), near: true },
  { name: 'dtla-walkway', ctx: desktop, q: `mode=walk&at=dtla-canyon&time=22&weather=rain&${common}`, after: () => window.__nla.dtlaView('walkway'), near: true },
  { name: 'dtla-roof', ctx: desktop, q: `mode=fly&at=dtla-canyon&time=22&weather=rain&${common}`, after: () => window.__nla.dtlaView('roof') },
  { name: 'dtla-lanes', ctx: desktop, q: `mode=fly&at=dtla-canyon&time=22&weather=drizzle&${common}`, after: () => window.__nla.dtlaView('lanes') },
  { name: 'dtla-plaza', ctx: desktop, q: `mode=walk&at=megatower-1&time=22&weather=rain&${common}`, after: () => window.__nla.dtlaView('plaza'), near: true },
  { name: 'dtla-iphone', ctx: { ...iphone, deviceScaleFactor: 1 }, q: `mode=walk&at=dtla-canyon&time=22.5&weather=rain&freeze=1&ui=0&quality=medium&touch=1${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.dtlaView('street'), near: true },
  { name: 'dtla-low', ctx: desktop, q: `mode=walk&at=dtla-canyon&time=22.5&weather=rain&freeze=1&ui=0&quality=low${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.dtlaView('street'), near: true },
  { name: 'dtla-medium', ctx: desktop, q: `mode=walk&at=dtla-canyon&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.dtlaView('street'), near: true },
  { name: 'dtla-ultra', ctx: desktop, q: `mode=walk&at=dtla-canyon&time=22.5&weather=rain&freeze=1&ui=0&quality=ultra${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.dtlaView('street'), near: true },
  // Stage 5 — Civic Center and LAPD. Cameras come from __nla.civicView.
  { name: 'civic-approach-night', ctx: desktop, q: `mode=fly&at=lapd-deck&time=22&weather=rain&${common}`, after: () => window.__nla.civicView('approach'), near: true },
  { name: 'civic-steps-rain', ctx: desktop, q: `mode=walk&at=lapd-steps&time=22.5&weather=rain&${common}`, after: () => window.__nla.civicView('steps'), near: true },
  { name: 'civic-city-hall', ctx: desktop, q: `mode=walk&at=city-hall-steps&time=22&weather=rain&${common}`, after: () => window.__nla.civicView('hall'), near: true },
  { name: 'civic-lobby', ctx: desktop, q: `mode=walk&at=lapd-lobby&time=22.5&weather=rain&${common}`, after: () => window.__nla.civicView('lobby'), near: true },
  { name: 'civic-plaza', ctx: desktop, q: `mode=walk&at=civic-plaza&time=22.5&weather=rain&${common}`, after: () => window.__nla.civicView('plaza'), near: true },
  { name: 'civic-iphone', ctx: { ...iphone, deviceScaleFactor: 1 }, q: `mode=walk&at=lapd-steps&time=22.5&weather=rain&freeze=1&ui=0&quality=medium&touch=1${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.civicView('steps'), near: true },
  { name: 'civic-low', ctx: desktop, q: `mode=walk&at=lapd-steps&time=22.5&weather=rain&freeze=1&ui=0&quality=low${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.civicView('steps'), near: true },
  { name: 'civic-medium', ctx: desktop, q: `mode=walk&at=lapd-steps&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.civicView('steps'), near: true },
  { name: 'civic-ultra', ctx: desktop, q: `mode=walk&at=lapd-steps&time=22.5&weather=rain&freeze=1&ui=0&quality=ultra${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.civicView('steps'), near: true },
  // Stage 6 — Broadway Neon Canyon. Cameras come from __nla.broadwayView.
  { name: 'broadway-street-rain', ctx: desktop, q: `mode=walk&at=bradbury&time=22.5&weather=rain&${common}`, after: () => window.__nla.broadwayView('street'), near: true },
  { name: 'broadway-bridge', ctx: desktop, q: `mode=walk&at=joi-bridge&time=22.5&weather=rain&${common}`, after: () => window.__nla.broadwayView('bridge'), near: true },
  { name: 'broadway-bradbury', ctx: desktop, q: `mode=walk&at=bradbury&time=22.5&weather=rain&${common}`, after: () => window.__nla.broadwayView('bradbury'), near: true },
  { name: 'broadway-spinner', ctx: desktop, q: `mode=fly&at=bradbury&time=22.5&weather=rain&${common}`, after: () => window.__nla.broadwayView('spinner'), near: true },
  { name: 'broadway-iphone', ctx: { ...iphone, deviceScaleFactor: 1 }, q: `mode=walk&at=bradbury&time=22.5&weather=rain&freeze=1&ui=0&quality=medium&touch=1${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.broadwayView('street'), near: true },
  { name: 'broadway-low', ctx: desktop, q: `mode=walk&at=bradbury&time=22.5&weather=rain&freeze=1&ui=0&quality=low${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.broadwayView('street'), near: true },
  { name: 'broadway-medium', ctx: desktop, q: `mode=walk&at=bradbury&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.broadwayView('street'), near: true },
  { name: 'broadway-ultra', ctx: desktop, q: `mode=walk&at=bradbury&time=22.5&weather=rain&freeze=1&ui=0&quality=ultra${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.broadwayView('street'), near: true },
  // X3 — interior stream. Cameras come from __nla.interiorView.
  { name: 'interior-court', ctx: desktop, q: `mode=walk&at=bradbury&time=22.5&weather=rain&${common}`, after: () => window.__nla.interiorView('court'), near: true },
  { name: 'interior-stair', ctx: desktop, q: `mode=walk&at=bradbury&time=22.5&weather=rain&${common}`, after: () => window.__nla.interiorView('stair'), near: true },
  { name: 'interior-door', ctx: desktop, q: `mode=walk&at=bradbury&time=22.5&weather=rain&${common}`, after: () => window.__nla.interiorView('door'), near: true },
  { name: 'interior-test', ctx: desktop, q: `mode=walk&at=bradbury&time=22.5&weather=rain&${common}`, after: () => window.__nla.interiorView('service'), near: true },
  { name: 'interior-iphone', ctx: { ...iphone, deviceScaleFactor: 1 }, q: `mode=walk&at=bradbury&time=22.5&weather=rain&freeze=1&ui=0&quality=medium&touch=1${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.interiorView('court'), near: true },
  { name: 'interior-low', ctx: desktop, q: `mode=walk&at=bradbury&time=22.5&weather=rain&freeze=1&ui=0&quality=low${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.interiorView('court'), near: true },
  { name: 'interior-medium', ctx: desktop, q: `mode=walk&at=bradbury&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.interiorView('court'), near: true },
  { name: 'interior-ultra', ctx: desktop, q: `mode=walk&at=bradbury&time=22.5&weather=rain&freeze=1&ui=0&quality=ultra${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.interiorView('court'), near: true },
  { name: 'interior-out-low', ctx: desktop, q: `mode=walk&at=bradbury&time=22.5&weather=rain&freeze=1&ui=0&quality=low${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.interiorView('door'), near: true },
  { name: 'interior-out-medium', ctx: desktop, q: `mode=walk&at=bradbury&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.interiorView('door'), near: true },
  { name: 'interior-out-ultra', ctx: desktop, q: `mode=walk&at=bradbury&time=22.5&weather=rain&freeze=1&ui=0&quality=ultra${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.interiorView('door'), near: true },
  // Stage 8 — K's megablock. Cameras come from __nla.kView.
  { name: 'k-aerial', ctx: desktop, q: `mode=fly&at=k-megablock-tower&time=22&weather=rain&${common}`, after: () => window.__nla.kView('aerial'), near: true },
  { name: 'k-street', ctx: desktop, q: `mode=walk&at=k-megablock-tower&time=22.5&weather=rain&${common}`, after: () => window.__nla.kView('street'), near: true },
  { name: 'k-market-rain', ctx: desktop, q: `mode=walk&at=k-megablock-tower&time=22.5&weather=rain&${common}`, after: () => window.__nla.kView('market'), near: true },
  { name: 'interior-k-lobby', ctx: desktop, q: `mode=walk&at=k-megablock-tower&time=22.5&weather=rain&${common}`, after: () => window.__nla.kView('lobby'), near: true },
  { name: 'interior-k-corridor', ctx: desktop, q: `mode=walk&at=k-megablock-tower&time=22.5&weather=rain&${common}`, after: () => window.__nla.kView('corridor'), near: true },
  { name: 'interior-k-apartment', ctx: desktop, q: `mode=walk&at=k-megablock-tower&time=22.5&weather=rain&${common}`, after: () => window.__nla.kView('apartment'), near: true },
  { name: 'k-roof', ctx: desktop, q: `mode=fly&at=k-megablock-tower&time=22&weather=rain&${common}`, after: () => window.__nla.kView('roof'), near: true },
  { name: 'k-iphone', ctx: { ...iphone, deviceScaleFactor: 1 }, q: `mode=walk&at=k-megablock-tower&time=22.5&weather=rain&freeze=1&ui=0&quality=medium&touch=1${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.kView('market'), near: true },
  { name: 'k-low', ctx: desktop, q: `mode=walk&at=k-megablock-tower&time=22.5&weather=rain&freeze=1&ui=0&quality=low${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.kView('market'), near: true },
  { name: 'k-medium', ctx: desktop, q: `mode=walk&at=k-megablock-tower&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.kView('market'), near: true },
  { name: 'k-ultra', ctx: desktop, q: `mode=walk&at=k-megablock-tower&time=22.5&weather=rain&freeze=1&ui=0&quality=ultra${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.kView('market'), near: true },
  { name: 'interior-k-low', ctx: desktop, q: `mode=walk&at=k-megablock-tower&time=22.5&weather=rain&freeze=1&ui=0&quality=low${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.kView('apartment'), near: true },
  { name: 'interior-k-medium', ctx: desktop, q: `mode=walk&at=k-megablock-tower&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.kView('apartment'), near: true },
  { name: 'interior-k-ultra', ctx: desktop, q: `mode=walk&at=k-megablock-tower&time=22.5&weather=rain&freeze=1&ui=0&quality=ultra${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.kView('apartment'), near: true },
  // Stage 7 — Wallace Precinct. Cameras come from __nla.wallaceView.
  { name: 'wallace-approach-dusk', ctx: desktop, q: `mode=fly&at=wallace-pyramid&time=17.8&weather=drizzle&${common}`, after: () => window.__nla.wallaceView('approach'), near: true },
  { name: 'wallace-plaza-rain', ctx: desktop, q: `mode=walk&at=wallace-plaza&time=22.5&weather=rain&${common}`, after: () => window.__nla.wallaceView('plaza'), near: true },
  { name: 'wallace-face', ctx: desktop, q: `mode=walk&at=wallace-pyramid&time=22&weather=rain&${common}`, after: () => window.__nla.wallaceView('face'), near: true, face: true },
  { name: 'wallace-satellite', ctx: desktop, q: `mode=fly&at=wallace-satellite-a&time=21.5&weather=drizzle&${common}`, after: () => window.__nla.wallaceView('satellite'), near: true },
  { name: 'wallace-factories', ctx: desktop, q: `mode=fly&at=wallace-pyramid&time=22&weather=rain&${common}`, after: () => window.__nla.wallaceView('convoy'), near: true, settle: true },
  { name: 'wallace-old-pyramids', ctx: desktop, q: `mode=fly&at=old-pyramid-north&time=18.2&weather=smog&${common}`, after: () => window.__nla.wallaceView('oldpyramids'), near: true, settle: true },
  { name: 'interior-wallace-atrium', ctx: desktop, q: `mode=walk&at=wallace-atrium&time=22.5&weather=rain&${common}`, after: () => window.__nla.wallaceView('atrium'), near: true },
  { name: 'wallace-iphone', ctx: { ...iphone, deviceScaleFactor: 1 }, q: `mode=walk&at=wallace-plaza&time=22.5&weather=rain&freeze=1&ui=0&quality=medium&touch=1${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.wallaceView('plaza'), near: true },
  { name: 'wallace-low', ctx: desktop, q: `mode=walk&at=wallace-plaza&time=22.5&weather=rain&freeze=1&ui=0&quality=low${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.wallaceView('plaza'), near: true },
  { name: 'wallace-medium', ctx: desktop, q: `mode=walk&at=wallace-plaza&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.wallaceView('plaza'), near: true },
  { name: 'wallace-ultra', ctx: desktop, q: `mode=walk&at=wallace-plaza&time=22.5&weather=rain&freeze=1&ui=0&quality=ultra${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.wallaceView('plaza'), near: true },
  { name: 'wallace-factories-medium', ctx: desktop, q: `mode=fly&at=wallace-pyramid&time=22&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.wallaceView('factories'), near: true, settle: true },
  // Stage 10 — Grey Coast and the Sepulveda Sea Wall. Cameras come from __nla.coastView.
  { name: 'coast-crest-rain', ctx: desktop, q: `mode=walk&at=sea-wall-fight&time=22.2&weather=rain&${common}`, after: () => window.__nla.coastView('crest'), near: true, coast: true },
  { name: 'coast-terraces', ctx: desktop, q: `mode=walk&at=sea-wall-fight&time=21.5&weather=rain&${common}`, after: () => window.__nla.coastView('terraces'), near: true, coast: true },
  { name: 'coast-apron-storm', ctx: desktop, q: `mode=fly&at=sea-wall-fight&time=22&weather=downpour&surf=1&${common}`, after: () => window.__nla.coastView('apron'), near: true, coast: true },
  { name: 'coast-spray', ctx: desktop, q: `mode=walk&at=sea-wall-fight&time=22&weather=downpour&surf=1&${common}`, after: () => window.__nla.coastView('spray'), near: true, coast: true },
  { name: 'coast-piers-dusk', ctx: desktop, q: `mode=fly&at=sea-wall-fight&time=18.2&weather=drizzle&${common}`, after: () => window.__nla.coastView('piers'), near: true, coast: true, settle: true },
  { name: 'coast-blocks', ctx: desktop, q: `mode=walk&at=sea-wall-fight&time=22&weather=rain&${common}`, after: () => window.__nla.coastView('blocks'), near: true, coast: true },
  { name: 'coast-aerial', ctx: desktop, q: `mode=fly&at=sea-wall-fight&time=21&weather=rain&${common}`, after: () => window.__nla.coastView('aerial'), near: true, coast: true },
  { name: 'coast-low', ctx: desktop, q: `mode=walk&at=sea-wall-fight&time=22&weather=downpour&freeze=1&ui=0&hud=1&quality=low${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.coastView('apron'), near: true, coast: true },
  { name: 'coast-iphone', ctx: { ...iphone, deviceScaleFactor: 1 }, q: `mode=walk&at=sea-wall-fight&time=22&weather=downpour&surf=1&freeze=1&ui=0&hud=1&quality=medium&touch=1${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.coastView('spray'), near: true, coast: true },
  { name: 'coast-medium', ctx: desktop, q: `mode=fly&at=sea-wall-fight&time=22&weather=downpour&surf=1&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.coastView('apron'), near: true, coast: true },
  { name: 'coast-ultra', ctx: desktop, q: `mode=fly&at=sea-wall-fight&time=22&weather=downpour&surf=1&freeze=1&ui=0&hud=1&quality=ultra${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.coastView('apron'), near: true, coast: true },
  // X2 — ground traffic. Cameras come from __nla.trafficView.
  { name: 'traffic-intersection', ctx: desktop, q: `mode=walk&time=22&weather=drizzle&${common}`, after: () => window.__nla.trafficView('intersection'), near: true, signal: true },
  { name: 'traffic-freeway', ctx: desktop, q: `mode=fly&time=22&weather=rain&${common}`, after: () => window.__nla.trafficView('freeway'), near: true },
  { name: 'traffic-rain', ctx: desktop, q: `mode=walk&time=22.5&weather=rain&${common}`, after: () => window.__nla.trafficView('rain'), near: true, signal: true },
  { name: 'traffic-canyon', ctx: desktop, q: `mode=walk&at=bradbury&time=22.5&weather=rain&${common}`, after: () => window.__nla.trafficView('canyon'), near: true },
  { name: 'traffic-aerial', ctx: desktop, q: `mode=fly&time=22&weather=clear&${common}`, after: () => window.__nla.trafficView('aerial-night') },
  { name: 'traffic-low', ctx: desktop, q: `mode=fly&time=22&weather=rain&freeze=1&ui=0&hud=1&quality=low${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.trafficView('freeway'), near: true },
  { name: 'traffic-medium', ctx: desktop, q: `mode=walk&time=22&weather=drizzle&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.trafficView('intersection'), near: true, signal: true },
  { name: 'traffic-freeway-medium', ctx: desktop, q: `mode=fly&time=22&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.trafficView('freeway'), near: true },
  { name: 'traffic-iphone', ctx: { ...iphone, deviceScaleFactor: 1 }, q: `mode=walk&time=22&weather=drizzle&freeze=1&ui=0&hud=1&quality=medium&touch=1${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.trafficView('intersection'), near: true, signal: true },
  { name: 'traffic-ultra', ctx: desktop, q: `mode=walk&time=22&weather=drizzle&freeze=1&ui=0&hud=1&quality=ultra${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.trafficView('intersection'), near: true, signal: true },
  // Stage 11 — Lakewood / Downey residential megablocks. Cameras come from __nla.lakewoodView.
  { name: 'lakewood-street-rain', ctx: desktop, q: `mode=walk&at=lakewood-market&time=22.5&weather=rain&${common}`, after: () => window.__nla.lakewoodView('street'), near: true, settle: true },
  { name: 'lakewood-courtyard', ctx: desktop, q: `mode=walk&at=lakewood-market&time=22.5&weather=rain&${common}`, after: () => window.__nla.lakewoodView('courtyard'), near: true, settle: true },
  { name: 'lakewood-market', ctx: desktop, q: `mode=walk&at=lakewood-market&time=22.5&weather=rain&${common}`, after: () => window.__nla.lakewoodView('market'), near: true, settle: true },
  { name: 'lakewood-laundry', ctx: desktop, q: `mode=walk&at=lakewood-market&time=22.5&weather=rain&${common}`, after: () => window.__nla.lakewoodView('laundry'), near: true, settle: true },
  { name: 'lakewood-traffic', ctx: desktop, q: `mode=walk&at=lakewood-market&time=22.5&weather=rain&${common}`, after: () => window.__nla.lakewoodView('traffic'), near: true, signal: true },
  { name: 'lakewood-k-edge', ctx: desktop, q: `mode=walk&at=lakewood-market&time=22.5&weather=rain&${common}`, after: () => window.__nla.lakewoodView('k-edge'), near: true, settle: true },
  { name: 'lakewood-river', ctx: desktop, q: `mode=walk&at=lakewood-market&time=22&weather=rain&${common}`, after: () => window.__nla.lakewoodView('river'), near: true, settle: true },
  { name: 'lakewood-aerial-dusk', ctx: desktop, q: `mode=fly&at=lakewood-market&time=18.4&weather=drizzle&${common}`, after: () => window.__nla.lakewoodView('aerial'), settle: true },
  { name: 'lakewood-shop', ctx: desktop, q: `mode=walk&at=lakewood-market&time=22.5&weather=rain&${common}`, after: () => window.__nla.lakewoodView('shop'), near: true },
  { name: 'lakewood-hub', ctx: desktop, q: `mode=walk&at=lakewood-market&time=22.5&weather=rain&${common}`, after: () => window.__nla.lakewoodView('hub'), near: true },
  { name: 'lakewood-low', ctx: desktop, q: `mode=walk&at=lakewood-market&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=low${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.lakewoodView('street'), near: true, settle: true },
  { name: 'lakewood-medium', ctx: desktop, q: `mode=walk&at=lakewood-market&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.lakewoodView('street'), near: true, settle: true },
  { name: 'lakewood-courtyard-medium', ctx: desktop, q: `mode=walk&at=lakewood-market&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.lakewoodView('courtyard'), near: true, settle: true },
  { name: 'lakewood-hub-medium', ctx: desktop, q: `mode=walk&at=lakewood-market&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.lakewoodView('hub'), near: true },
  { name: 'lakewood-traffic-medium', ctx: desktop, q: `mode=walk&at=lakewood-market&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.lakewoodView('traffic'), near: true, signal: true },
  { name: 'lakewood-ultra', ctx: desktop, q: `mode=walk&at=lakewood-market&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=ultra${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.lakewoodView('street'), near: true, settle: true },
  { name: 'lakewood-iphone', ctx: { ...iphone, deviceScaleFactor: 1 }, q: `mode=walk&at=lakewood-market&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium&touch=1${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.lakewoodView('courtyard'), near: true, settle: true },
  // Stage 12 — South LA residential megablocks. Cameras come from __nla.southLaView.
  { name: 'southla-street-rain', ctx: desktop, q: `mode=walk&at=south-la-hub&time=22.5&weather=rain&${common}`, after: () => window.__nla.southLaView('street'), near: true, settle: true },
  { name: 'southla-courtyard', ctx: desktop, q: `mode=walk&at=south-la-hub&time=22.5&weather=rain&${common}`, after: () => window.__nla.southLaView('courtyard'), near: true, settle: true },
  { name: 'southla-market', ctx: desktop, q: `mode=walk&at=south-la-hub&time=22.5&weather=rain&${common}`, after: () => window.__nla.southLaView('market'), near: true, settle: true },
  { name: 'southla-spine', ctx: desktop, q: `mode=walk&at=south-la-hub&time=22.5&weather=rain&${common}`, after: () => window.__nla.southLaView('spine'), near: true, settle: true },
  { name: 'southla-hub', ctx: desktop, q: `mode=walk&at=south-la-hub&time=22.5&weather=rain&${common}`, after: () => window.__nla.southLaView('hub'), near: true, settle: true },
  { name: 'southla-traffic', ctx: desktop, q: `mode=walk&at=south-la-hub&time=22.5&weather=rain&${common}`, after: () => window.__nla.southLaView('traffic'), near: true, signal: true },
  { name: 'southla-trench', ctx: desktop, q: `mode=walk&at=south-la-hub&time=22&weather=rain&${common}`, after: () => window.__nla.southLaView('trench'), near: true, settle: true },
  { name: 'southla-wallace', ctx: desktop, q: `mode=walk&at=south-la-hub&time=22&weather=rain&${common}`, after: () => window.__nla.southLaView('wallace'), near: true, settle: true },
  { name: 'southla-aerial-dusk', ctx: desktop, q: `mode=fly&at=south-la-hub&time=18.4&weather=drizzle&${common}`, after: () => window.__nla.southLaView('aerial'), settle: true },
  { name: 'southla-seam-dusk', ctx: desktop, q: `mode=fly&at=south-la-hub&time=18.4&weather=drizzle&${common}`, after: () => window.__nla.southLaView('seam'), settle: true },
  { name: 'southla-room', ctx: desktop, q: `mode=walk&at=south-la-hub&time=22.5&weather=rain&${common}`, after: () => window.__nla.southLaView('room'), near: true },
  { name: 'southla-low', ctx: desktop, q: `mode=walk&at=south-la-hub&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=low${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.southLaView('street'), near: true, settle: true },
  { name: 'southla-medium', ctx: desktop, q: `mode=walk&at=south-la-hub&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.southLaView('street'), near: true, settle: true },
  { name: 'southla-spine-medium', ctx: desktop, q: `mode=walk&at=south-la-hub&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.southLaView('spine'), near: true, settle: true },
  { name: 'southla-hub-medium', ctx: desktop, q: `mode=walk&at=south-la-hub&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.southLaView('hub'), near: true, settle: true },
  { name: 'southla-courtyard-medium', ctx: desktop, q: `mode=walk&at=south-la-hub&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.southLaView('courtyard'), near: true, settle: true },
  { name: 'southla-traffic-medium', ctx: desktop, q: `mode=walk&at=south-la-hub&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.southLaView('traffic'), near: true, signal: true },
  { name: 'southla-ultra', ctx: desktop, q: `mode=walk&at=south-la-hub&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=ultra${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.southLaView('street'), near: true, settle: true },
  { name: 'southla-iphone', ctx: { ...iphone, deviceScaleFactor: 1 }, q: `mode=walk&at=south-la-hub&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium&touch=1${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.southLaView('spine'), near: true, settle: true },
  { name: 'arts-aerial-night', ctx: desktop, q: `mode=fly&at=arts-foundry&time=22&weather=drizzle&${common}`, after: () => window.__nla.artsView('aerial'), near: true, settle: true },
  { name: 'arts-stacks', ctx: desktop, q: `mode=fly&at=arts-foundry&time=22&weather=drizzle&${common}`, after: () => window.__nla.artsView('stacks'), near: true, settle: true },
  { name: 'arts-foundry', ctx: desktop, q: `mode=walk&at=arts-foundry&time=22.5&weather=rain&${common}`, after: () => window.__nla.artsView('foundry'), near: true, settle: true },
  { name: 'arts-pipes-rain', ctx: desktop, q: `mode=walk&at=arts-foundry&time=22.5&weather=rain&${common}`, after: () => window.__nla.artsView('pipes'), near: true, settle: true },
  { name: 'arts-river', ctx: desktop, q: `mode=walk&at=arts-river&time=22&weather=rain&${common}`, after: () => window.__nla.artsView('river'), near: true, settle: true },
  { name: 'arts-street', ctx: desktop, q: `mode=walk&at=arts-foundry&time=22.5&weather=rain&${common}`, after: () => window.__nla.artsView('street'), near: true, settle: true },
  { name: 'interior-arts-foundry', ctx: desktop, q: `mode=walk&at=arts-foundry&time=22.5&weather=rain&${common}`, after: () => window.__nla.artsView('interior'), near: true, settle: true },
  { name: 'arts-low', ctx: desktop, q: `mode=walk&at=arts-foundry&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=low${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.artsView('foundry'), near: true, settle: true },
  { name: 'arts-medium', ctx: desktop, q: `mode=walk&at=arts-foundry&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.artsView('foundry'), near: true, settle: true },
  { name: 'arts-high', ctx: desktop, q: `mode=walk&at=arts-foundry&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=high${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.artsView('foundry'), near: true, settle: true },
  { name: 'arts-ultra', ctx: desktop, q: `mode=walk&at=arts-foundry&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=ultra${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.artsView('foundry'), near: true, settle: true },
  { name: 'arts-iphone', ctx: { ...iphone, deviceScaleFactor: 1 }, q: `mode=walk&at=arts-foundry&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium&touch=1${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.artsView('foundry'), near: true, settle: true },
  // Stage 13 — Westside sprawl. Cameras come from __nla.westsideView.
  { name: 'westside-aerial-dusk', ctx: desktop, q: `mode=fly&at=westside-yard&time=18.4&weather=drizzle&${common}`, after: () => window.__nla.westsideView('aerial'), settle: true },
  { name: 'westside-street', ctx: desktop, q: `mode=walk&at=westside-yard&time=22.5&weather=drizzle&${common}`, after: () => window.__nla.westsideView('street'), near: true, settle: true },
  { name: 'westside-strip', ctx: desktop, q: `mode=walk&at=westside-yard&time=22.5&weather=drizzle&${common}`, after: () => window.__nla.westsideView('strip'), near: true, settle: true },
  { name: 'westside-roof', ctx: desktop, q: `mode=fly&at=westside-yard&time=22&weather=drizzle&${common}`, after: () => window.__nla.westsideView('roof'), near: true, settle: true },
  { name: 'westside-freeway', ctx: desktop, q: `mode=walk&at=westside-yard&time=22&weather=drizzle&${common}`, after: () => window.__nla.westsideView('freeway'), near: true, settle: true },
  { name: 'westside-hub', ctx: desktop, q: `mode=walk&at=westside-yard&time=22.5&weather=drizzle&${common}`, after: () => window.__nla.westsideView('hub'), near: true, settle: true },
  { name: 'interior-westside-diner', ctx: desktop, q: `mode=walk&at=westside-yard&time=22.5&weather=drizzle&${common}`, after: () => window.__nla.westsideView('interior'), near: true, settle: true },
  { name: 'westside-low', ctx: desktop, q: `mode=walk&at=westside-yard&time=22.5&weather=drizzle&freeze=1&ui=0&hud=1&quality=low${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.westsideView('street'), near: true, settle: true },
  { name: 'westside-medium', ctx: desktop, q: `mode=walk&at=westside-yard&time=22.5&weather=drizzle&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.westsideView('street'), near: true, settle: true },
  { name: 'westside-hub-medium', ctx: desktop, q: `mode=walk&at=westside-yard&time=22.5&weather=drizzle&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.westsideView('hub'), near: true, settle: true },
  { name: 'westside-towers-medium', ctx: desktop, q: `mode=walk&at=westside-yard&time=22.5&weather=drizzle&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.westsideView('towers'), near: true, settle: true },
  { name: 'westside-ultra', ctx: desktop, q: `mode=walk&at=westside-yard&time=22.5&weather=drizzle&freeze=1&ui=0&hud=1&quality=ultra${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.westsideView('street'), near: true, settle: true },
  { name: 'westside-iphone', ctx: { ...iphone, deviceScaleFactor: 1 }, q: `mode=walk&at=westside-yard&time=22.5&weather=drizzle&freeze=1&ui=0&hud=1&quality=medium&touch=1${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.westsideView('street'), near: true, settle: true },
  // Stage 14 — Basin sprawl, the default district. Cameras come from __nla.basinView.
  // Seam URLs match the before frames. `once` waits for idle on that pose, then the view only flips the cockpit.
  { name: 'basin-seam-west-dusk', ctx: desktop, q: `mode=fly&x=-16260.5&y=1000&z=7390.7&yaw=0&pitch=-36.9&time=18.4&weather=drizzle&${common}`, after: () => window.__nla.basinView('seam-west'), once: true },
  { name: 'basin-seam-west-night', ctx: desktop, q: `mode=fly&x=-16260.5&y=1000&z=7390.7&yaw=0&pitch=-36.9&time=22.5&weather=drizzle&${common}`, after: () => window.__nla.basinView('seam-west'), once: true },
  { name: 'basin-seam-south-dusk', ctx: desktop, q: `mode=fly&x=-9782&y=1000&z=7983.4&yaw=90&pitch=-36.9&time=18.4&weather=drizzle&${common}`, after: () => window.__nla.basinView('seam-south'), once: true },
  { name: 'basin-seam-south-night', ctx: desktop, q: `mode=fly&x=-9782&y=1000&z=7983.4&yaw=90&pitch=-36.9&time=22.5&weather=drizzle&${common}`, after: () => window.__nla.basinView('seam-south'), once: true },
  { name: 'basin-seam-lake-dusk', ctx: desktop, q: `mode=fly&x=16766.8&y=1000&z=21252.3&yaw=-90&pitch=-41.6&time=18.4&weather=drizzle&${common}`, after: () => window.__nla.basinView('seam-lake'), once: true },
  { name: 'basin-seam-lake-night', ctx: desktop, q: `mode=fly&x=16766.8&y=1000&z=21252.3&yaw=-90&pitch=-41.6&time=22.5&weather=drizzle&${common}`, after: () => window.__nla.basinView('seam-lake'), once: true },
  { name: 'basin-seam-arts-dusk', ctx: desktop, q: `mode=fly&x=894.6&y=1000&z=3188.4&yaw=0&pitch=-41.6&time=18.4&weather=drizzle&${common}`, after: () => window.__nla.basinView('seam-arts'), once: true },
  { name: 'basin-seam-arts-night', ctx: desktop, q: `mode=fly&x=894.6&y=1000&z=3188.4&yaw=0&pitch=-41.6&time=22.5&weather=drizzle&${common}`, after: () => window.__nla.basinView('seam-arts'), once: true },
  { name: 'basin-seam-dtla-dusk', ctx: desktop, q: `mode=fly&x=-581.1&y=1000&z=-2137.9&yaw=180&pitch=-39.1&time=18.4&weather=drizzle&${common}`, after: () => window.__nla.basinView('seam-dtla'), once: true },
  { name: 'basin-seam-dtla-night', ctx: desktop, q: `mode=fly&x=-581.1&y=1000&z=-2137.9&yaw=180&pitch=-39.1&time=22.5&weather=drizzle&${common}`, after: () => window.__nla.basinView('seam-dtla'), once: true },
  { name: 'basin-aerial-dusk', ctx: desktop, q: `mode=fly&x=-10250&y=1000&z=13080&yaw=8&pitch=-37.3&time=18.4&weather=drizzle&${common}`, after: () => window.__nla.basinView('aerial'), once: true },
  { name: 'basin-aerial-night', ctx: desktop, q: `mode=fly&x=-10250&y=1000&z=13080&yaw=8&pitch=-37.3&time=22.5&weather=drizzle&${common}`, after: () => window.__nla.basinView('aerial'), once: true },
  { name: 'basin-street', ctx: desktop, q: `mode=walk&at=basin-strip&time=22.5&weather=drizzle&${common}`, after: () => window.__nla.basinView('street'), near: true, settle: true },
  { name: 'basin-strip', ctx: desktop, q: `mode=walk&at=basin-strip&time=22.5&weather=drizzle&${common}`, after: () => window.__nla.basinView('strip'), near: true, settle: true },
  { name: 'basin-roof', ctx: desktop, q: `mode=fly&at=basin-strip&time=22&weather=drizzle&${common}`, after: () => window.__nla.basinView('roof'), near: true, settle: true },
  { name: 'basin-low', ctx: desktop, q: `mode=walk&at=basin-strip&time=22.5&weather=drizzle&freeze=1&ui=0&hud=1&quality=low${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.basinView('street'), near: true, settle: true },
  { name: 'basin-medium', ctx: desktop, q: `mode=walk&at=basin-strip&time=22.5&weather=drizzle&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.basinView('street'), near: true, settle: true },
  { name: 'basin-high', ctx: desktop, q: `mode=walk&at=basin-strip&time=22.5&weather=drizzle&freeze=1&ui=0&hud=1&quality=high${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.basinView('street'), near: true, settle: true },
  { name: 'basin-ultra', ctx: desktop, q: `mode=walk&at=basin-strip&time=22.5&weather=drizzle&freeze=1&ui=0&hud=1&quality=ultra${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.basinView('street'), near: true, settle: true },
  { name: 'basin-iphone', ctx: { ...iphone, deviceScaleFactor: 1 }, q: `mode=walk&at=basin-strip&time=22.5&weather=drizzle&freeze=1&ui=0&hud=1&quality=medium&touch=1${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.basinView('street'), near: true, settle: true },
  { name: 'basin-flyover', ctx: desktop, q: `mode=fly&at=basin-strip&time=22.5&weather=drizzle&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.basinView('aerial'), near: true, settle: true, flyover: true },
];

const args = GPU
  ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args, headless: true });

for (const s of shots) {
  if (only.size && !only.has(s.name)) continue;
  const ctx = await browser.newContext(s.ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const url = `${BASE}?${s.q}`;
  const t0 = Date.now();
  await page.goto(url);
  const market = s.name.startsWith('market-') || s.holo === 'street' || s.near;
  if (market) {
    // The whole basin rarely goes idle on SwiftShader. The market shot only needs the
    // blocks around the camera dressed.
    await page.waitForFunction(() => {
      const st = window.__nla?.stats?.();
      return st && st.lod0 >= 6 && st.queryPending === 0 && st.drawCalls > 40 && st.fps > 0;
    }, null, { timeout: 90_000, polling: 500 }).catch(() => console.warn(`${s.name}: market chunks not ready, shooting anyway`));
  } else {
    await page.waitForFunction(() => window.__nla?.isIdle?.(), null, { timeout: 240_000, polling: 1000 }).catch(() => console.warn(`${s.name}: streaming not idle, shooting anyway`));
  }
  if (s.after) {
    await page.evaluate(s.after);
    await page.waitForTimeout(market ? 2500 : 1500);
    if (!market && !s.once) await page.waitForFunction(() => window.__nla.isIdle(), null, { timeout: 120_000, polling: 1000 }).catch(() => {});
    // camera presets are idempotent; set it again in case a slow first frame swallowed the first call
    await page.evaluate(s.after);
    await page.waitForTimeout(1500);
    if (s.name.startsWith('interior-')) {
      await page.evaluate(s.after);
      await page.evaluate(() => new Promise((resolve) => {
        const t0 = performance.now();
        const step = () => (performance.now() - t0 >= 1400 ? resolve(0) : requestAnimationFrame(step));
        requestAnimationFrame(step);
      }));
    }
    if (s.settle) {
      // The preset can land kilometres from `at=`. Wait until that neighbourhood is dressed.
      await page.waitForFunction(() => {
        const st = window.__nla?.stats?.();
        // A kilometre-up seam never enters the lod0 radius. Settled draws are enough there.
        const dressed = st && (st.lod0 >= 6 || (st.drawCalls > 40 && st.lod0 === 0));
        return dressed && st.inFlight === 0 && st.readyQueue === 0 && st.fps > 0;
      }, null, { timeout: 120_000, polling: 500 }).catch(() => console.warn(`${s.name}: area still streaming`));
      await page.evaluate(s.after);
      await page.waitForTimeout(1800);
    }
    if (s.face) {
      await page.waitForFunction(() => (window.__nla?.stats?.().faceSectors ?? 0) >= 4, null, { timeout: 20_000, polling: 200 }).catch(() => {});
    }
    if (s.coast) {
      await page.waitForFunction(() => (window.__nla?.stats?.().coastSegments ?? 0) >= 1, null, { timeout: 20_000, polling: 200 }).catch(() => {});
    }
  }
  if (s.cine) {
    // cut until the director lands on a wide establishing shot, then let its area stream in
    for (let k = 0; k < 12; k++) {
      await page.evaluate(() => window.__nla.cut());
      await page.waitForTimeout(800);
      const shot = await page.evaluate(() => window.__nla.stats().shot);
      if (/^(orbit|telephoto|flyover) /.test(shot)) break;
    }
    await page.evaluate(() => window.__nla.holdShot(true));
    await page.waitForFunction(() => window.__nla.isIdle(), null, { timeout: 120_000, polling: 1000 }).catch(() => {});
  }
  await page.waitForTimeout(2500);
  if (s.signal) {
    await page.waitForFunction(() => {
      const st = window.__nla?.stats?.();
      return st && st.viewSignal === 'stop' && st.groundCars >= 2;
    }, null, { timeout: 45_000, polling: 250 }).catch(() => console.warn(`${s.name}: signal not red, shooting anyway`));
  }
  if (s.coast && s.q.includes('weather=downpour') && !s.q.includes('quality=low')) {
    await page.waitForFunction(() => (window.__nla?.stats?.().coastImpact ?? 0) > 0.55, null, { timeout: 12_000, polling: 40 }).catch(() => {});
  }
  if (s.flyover) {
    const samples = [];
    const x0 = -10070;
    const z0 = 11880;
    const y = 160;
    for (let i = 0; i <= 32; i++) {
      const x = x0 + i * 250;
      await page.evaluate(({ x, y, z }) => window.__nla.setPose(x, y, z, 90, -8), { x, y, z: z0 });
      await page.waitForTimeout(450);
      const st = await page.evaluate(() => {
        const s = window.__nla.stats();
        return { frameMs: s.frameMs, worstMs: s.worstMs, fps: s.fps, draws: s.drawCalls, tris: s.triangles, lod0: s.lod0 };
      });
      samples.push({ x: Math.round(x), ...st });
    }
    const ms = samples.map((s) => s.frameMs);
    const worst = samples.map((s) => s.worstMs);
    const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
    console.log(`flyover avg ${avg.toFixed(1)} ms, median ${ms.slice().sort((a, b) => a - b)[Math.floor(ms.length / 2)].toFixed(1)} ms, peak worst ${Math.max(...worst).toFixed(0)} ms`);
    console.log('flyover-samples', JSON.stringify(samples));
  }
  const stats = await page.evaluate(() => {
    const s = window.__nla?.stats?.() ?? null;
    const c = window.__nla?.app?.camera;
    if (s && c) s.cam = [c.position.x, c.position.y, c.position.z].map((n) => Math.round(n * 10) / 10);
    return s;
  });
  const file = join(OUT, `${s.name}.png`);
  await page.screenshot({ path: file, timeout: 180_000 });
  console.log(`${s.name}: ${((Date.now() - t0) / 1000).toFixed(1)} s`, JSON.stringify(stats), errors.length ? `\n  errors: ${errors.slice(0, 5).join('\n  ')}` : '');
  await ctx.close();
}
await browser.close();
