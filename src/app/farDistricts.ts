// Far-district scene mounts and per-frame hooks. The entry chunk starts this download
// immediately; the opening downtown view does not wait on it.
import type { Object3D } from 'three/webgpu';
import type { CityQuery } from '../world/CityQuery';
import type { CityLayout } from '../world/layout';
import type { Tier } from '../core/quality';
import { farInteriorsReady } from '../districts/interior-index';

export interface FarFrame {
  rumble: number;
  southBay: number;
  harbor: number;
  east: number;
  hall: { x: number; y: number; z: number } | null;
}

interface FarMods {
  mountSoutheastFlares: (parent: Object3D, layout: CityLayout) => void;
  mountSouthBayFlares: (parent: Object3D, layout: CityLayout) => void;
  southBayHum: (x: number, y: number, z: number, layout: CityLayout) => number;
  mountHarbor: (parent: Object3D, layout: CityLayout, query: CityQuery) => void;
  updateHarbor: (elapsed: number, x: number, y: number, z: number) => void;
  harborHum: (x: number, y: number, z: number, layout: CityLayout) => number;
  mountLaunch: (parent: Object3D, layout: CityLayout) => void;
  updateLaunch: (elapsed: number, tier: Tier, windRad: number, wind: number) => void;
  launchRumble: (x: number, y: number, z: number) => number;
  launchPhase: () => number;
  launchPad: () => number;
  requestLaunch: (phase?: number, pad?: number) => void;
  gantryTris: number[];
  installLakewoodHolos: (layout: CityLayout) => void;
  installSouthLaHolos: (layout: CityLayout) => void;
  installHollywoodHolos: (layout: CityLayout) => void;
  installLaxHolos: (layout: CityLayout) => Object3D;
  installSouthBayHolos: (layout: CityLayout) => void;
  installHarborHolos: (layout: CityLayout) => void;
  installLongBeachHolos: (layout: CityLayout) => void;
  installEastLaHolos: (layout: CityLayout) => void;
  mountEastLaInterchanges: (layout: CityLayout) => Object3D | null;
  eastLaMachinery: (x: number, y: number, z: number, layout: CityLayout) => number;
  marketPin: (layout: CityLayout) => { x: number; y: number; z: number } | null;
}

const EMPTY: FarFrame = { rumble: 0, southBay: 0, harbor: 0, east: 0, hall: null };

let mods: FarMods | null = null;
let mounted = false;
let hallCache: { x: number; y: number; z: number } | null | undefined;

export function farDistrictsReady(): boolean {
  return mods !== null;
}

export const farDistrictsPromise: Promise<void> = Promise.all([
  import('../districts/southeast-industrial/field'),
  import('../districts/south-bay-refineries/field'),
  import('../districts/harbor/field'),
  import('../districts/lax-spaceport/launch'),
  import('../districts/lax-spaceport/gantry'),
  import('../districts/lax-spaceport/holos'),
  import('../districts/lakewood-megablocks/holos'),
  import('../districts/south-la-megablocks/holos'),
  import('../districts/hollywood/holos'),
  import('../districts/hollywood/sign'),
  import('../districts/south-bay-refineries/holos'),
  import('../districts/harbor/holos'),
  import('../districts/long-beach/holos'),
  import('../districts/east-la/holos'),
  import('../districts/east-la/interchange'),
  import('../districts/east-la/crossings'),
  import('../districts/east-la/locate'),
  farInteriorsReady,
]).then((loaded) => {
  const se = loaded[0];
  const sb = loaded[1];
  const harbor = loaded[2];
  const launch = loaded[3];
  const gantry = loaded[4];
  const laxHolos = loaded[5];
  const lake = loaded[6];
  const south = loaded[7];
  const hw = loaded[8];
  const sbHolos = loaded[10];
  const harborHolos = loaded[11];
  const lb = loaded[12];
  const elHolos = loaded[13];
  const elDeck = loaded[14];
  const elCross = loaded[15];
  const elLocate = loaded[16];
  mods = {
    mountSoutheastFlares: se.mountSoutheastFlares,
    mountSouthBayFlares: sb.mountSouthBayFlares,
    southBayHum: sb.southBayHum,
    mountHarbor: harbor.mountHarbor,
    updateHarbor: harbor.updateHarbor,
    harborHum: harbor.harborHum,
    mountLaunch: launch.mountLaunch,
    updateLaunch: launch.updateLaunch,
    launchRumble: launch.launchRumble,
    launchPhase: launch.launchPhase,
    launchPad: launch.launchPad,
    requestLaunch: launch.requestLaunch,
    gantryTris: gantry.gantryTris,
    installLakewoodHolos: lake.installLakewoodHolos,
    installSouthLaHolos: south.installSouthLaHolos,
    installHollywoodHolos: hw.installHollywoodHolos,
    installLaxHolos: laxHolos.installLaxHolos,
    installSouthBayHolos: sbHolos.installSouthBayHolos,
    installHarborHolos: harborHolos.installHarborHolos,
    installLongBeachHolos: lb.installLongBeachHolos,
    installEastLaHolos: elHolos.installEastLaHolos,
    mountEastLaInterchanges: elDeck.mountEastLaInterchanges,
    eastLaMachinery: elCross.eastLaMachinery,
    marketPin: elLocate.marketPin,
  };
}).catch((err) => {
  console.error('far districts failed to load', err);
});

export function mountFarDistricts(parent: Object3D, layout: CityLayout, query: CityQuery): void {
  if (!mods || mounted) return;
  mounted = true;
  mods.mountSoutheastFlares(parent, layout);
  mods.mountSouthBayFlares(parent, layout);
  mods.mountHarbor(parent, layout, query);
  mods.mountLaunch(parent, layout);
  mods.installLakewoodHolos(layout);
  mods.installSouthLaHolos(layout);
  mods.installHollywoodHolos(layout);
  parent.add(mods.installLaxHolos(layout));
  mods.installSouthBayHolos(layout);
  mods.installHarborHolos(layout);
  mods.installLongBeachHolos(layout);
  mods.installEastLaHolos(layout);
  const deck = mods.mountEastLaInterchanges(layout);
  if (deck) parent.add(deck);
}

export function sampleFarFrame(a: {
  elapsed: number;
  tier: Tier;
  windDir: number;
  wind: number;
  x: number;
  y: number;
  z: number;
  layout: CityLayout;
}): FarFrame {
  if (!mods) return EMPTY;
  mods.updateLaunch(a.elapsed, a.tier, a.windDir, a.wind);
  mods.updateHarbor(a.elapsed, a.x, a.y, a.z);
  if (hallCache === undefined) hallCache = mods.marketPin(a.layout);
  return {
    rumble: mods.launchRumble(a.x, a.y, a.z),
    southBay: mods.southBayHum(a.x, a.y, a.z, a.layout),
    harbor: mods.harborHum(a.x, a.y, a.z, a.layout),
    east: mods.eastLaMachinery(a.x, a.y, a.z, a.layout),
    hall: hallCache,
  };
}

export function farLaunchPhase(): number {
  return mods ? mods.launchPhase() : 0;
}

export function farLaunchPad(): number {
  return mods ? mods.launchPad() : 0;
}

export function farGantryTris(): string {
  return mods ? mods.gantryTris.join('/') : '';
}

export async function requestFarLaunch(phase?: number, pad?: number): Promise<{ phase: number; pad: number }> {
  await farDistrictsPromise;
  if (!mods) return { phase: phase ?? 0, pad: pad ?? 0 };
  mods.requestLaunch(phase ?? 0, pad);
  return { phase: phase ?? 0, pad: pad ?? mods.launchPad() };
}
