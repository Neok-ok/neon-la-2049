// Matched stills for the before/after visual check.
//   BEFORE=http://127.0.0.1:4173/ AFTER=http://127.0.0.1:4174/ node tools/memory/shots.mjs
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BEFORE = process.env.BEFORE ?? 'http://127.0.0.1:4173/';
const AFTER = process.env.AFTER ?? 'http://127.0.0.1:4174/';
const OUT = process.env.OUT ?? 'tools/memory/out/shots';
const TIERS = (process.env.TIERS ?? 'low,medium,high,ultra').split(',');
const SHOT_TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 90000);
const SHOT_SCALE = process.env.SHOT_SCALE === 'device' ? 'device' : 'css';
const CHROME = process.env.CHROME ?? '/opt/google/chrome/chrome';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';

const POSES = ['street', 'skyline', 'court'];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function shoot(page, dir, tier, pose) {
  const path = join(dir, `${tier}-${pose}.png`);
  if (existsSync(path)) {
    process.stdout.write(`skip ${path}\n`);
    return;
  }
  await page.evaluate(async (pose) => {
    const nla = window.__nla;
    if (!nla) return;
    if (pose === 'street') nla.marketView?.('street');
    else if (pose === 'skyline') nla.megaView?.('skyline');
    else if (pose === 'court') nla.interiorView?.('court');
  }, pose);
  const born = Date.now();
  while (Date.now() - born < 12000) {
    const idle = await page.evaluate(() => !!window.__nla?.isIdle?.()).catch(() => false);
    if (idle) break;
    await sleep(400);
  }
  await sleep(800);
  await page.evaluate(() => {
    for (const sel of ['.mem-overlay', '.touch-ui']) {
      const el = document.querySelector(sel);
      if (el) el.style.display = 'none';
    }
  }).catch(() => {});
  await page.screenshot({ path, timeout: SHOT_TIMEOUT, animations: 'disabled', scale: SHOT_SCALE }).catch((err) => {
    process.stdout.write(`shot failed ${tier} ${pose} ${err.message}\n`);
  });
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=swiftshader', '--disable-dev-shm-usage', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
});

for (const [label, base] of [['before', BEFORE], ['after', AFTER]]) {
  const dir = join(OUT, label);
  mkdirSync(dir, { recursive: true });
  for (const tier of TIERS) {
    const context = await browser.newContext({
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2.625,
      isMobile: true,
      hasTouch: true,
      userAgent: ANDROID_UA,
    });
    await context.addInitScript(() => {
      try { Object.defineProperty(navigator, 'deviceMemory', { get: () => 4, configurable: true }); } catch { /* locked */ }
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => process.stdout.write(`pageerror ${label} ${tier} ${e.message}\n`));
    const url = new URL(base);
    url.search = `webgl=1&ui=0&hud=0&freeze=1&quality=${tier}&mode=fly&time=22&weather=clear`;
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const born = Date.now();
    let ready = false;
    while (Date.now() - born < 90000) {
      ready = await page.evaluate(() => !!window.__nla?.app).catch(() => false);
      if (ready) break;
      await sleep(400);
    }
    if (!ready) {
      process.stdout.write(`${label} ${tier} did not boot\n`);
      await context.close();
      continue;
    }
    await sleep(5000);
    for (const pose of POSES) {
      await shoot(page, dir, tier, pose);
      process.stdout.write(`${label} ${tier} ${pose}\n`);
    }
    await context.close();
  }
}
await browser.close();
process.stdout.write('shots done\n');
