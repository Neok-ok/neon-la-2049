// Small painted preview of a graphics tier. Same skyline at every tier; detail follows settingsFor.
import { settingsFor, type Tier } from '../core/quality';

const W = 160;
const H = 90;

interface Tower {
  x: number;
  w: number;
  h: number;
  tone: string;
}

const TOWERS: Tower[] = [
  { x: 6, w: 26, h: 58, tone: '#141824' },
  { x: 34, w: 18, h: 42, tone: '#10141e' },
  { x: 54, w: 36, h: 68, tone: '#18141e' },
  { x: 92, w: 22, h: 46, tone: '#121722' },
  { x: 116, w: 20, h: 54, tone: '#16141c' },
  { x: 138, w: 16, h: 36, tone: '#10131c' },
];

export function paintTierPreview(canvas: HTMLCanvasElement, tier: Tier, badge = false): void {
  const s = settingsFor(tier);
  const mul = tier === 'low' ? 1 : tier === 'medium' ? 1.5 : 2;
  canvas.width = Math.round(W * mul);
  canvas.height = Math.round(H * mul);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(mul, 0, 0, mul, 0, 0);
  ctx.imageSmoothingEnabled = tier !== 'low';

  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#05060f');
  sky.addColorStop(0.62, '#120e16');
  sky.addColorStop(1, '#1a100c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const street = H - 14;
  for (const b of TOWERS) {
    const top = street - b.h;
    ctx.fillStyle = b.tone;
    ctx.fillRect(b.x, top, b.w, b.h);
    paintWindows(ctx, b, top, s.detailScale);
  }

  paintSign(ctx, s.holoDetail, s.bloom);
  if (s.bloom) paintBloom(ctx, s.pixelRatio >= 3 ? 0.55 : 0.32);
  paintRain(ctx, s.rainCount, street);
  ctx.fillStyle = '#07080c';
  ctx.fillRect(0, street, W, H - street);
  if (s.groundTraffic > 0) paintCar(ctx, street);
  else paintStreaks(ctx, street);
  if (s.holoCards > 0) {
    ctx.fillStyle = 'rgba(41, 216, 255, 0.16)';
    ctx.fillRect(58, street + 2, 28, 2);
  }

  if (badge) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(4, 4, 36, 12);
    ctx.fillStyle = '#ff9a2e';
    ctx.font = '7px Helvetica, Arial, sans-serif';
    ctx.fillText('AUTO', 8, 13);
  }
}

function paintWindows(ctx: CanvasRenderingContext2D, b: Tower, top: number, detail: number): void {
  const gap = detail >= 0.8 ? 3.2 : detail >= 0.5 ? 4.6 : 7;
  const size = detail >= 0.8 ? 1.6 : detail >= 0.5 ? 2.1 : 3.2;
  const lit = detail >= 0.8 ? 0.72 : detail >= 0.5 ? 0.5 : 0.34;
  ctx.fillStyle = '#ff9a2e';
  let n = 0;
  for (let y = top + 4; y < top + b.h - 4; y += gap) {
    for (let x = b.x + 2; x < b.x + b.w - 3; x += gap) {
      n++;
      if (((n * 17) % 10) / 10 > lit) continue;
      ctx.globalAlpha = 0.35 + ((n * 13) % 5) * 0.12;
      ctx.fillRect(x, y, size, size);
    }
  }
  ctx.globalAlpha = 1;
}

function paintSign(ctx: CanvasRenderingContext2D, holoDetail: number, bloom: boolean): void {
  const x = 60;
  const y = 28;
  ctx.fillStyle = bloom ? '#ff2d8c' : '#c41e6a';
  ctx.fillRect(x, y, 24, 8);
  ctx.fillStyle = '#29d8ff';
  const bands = holoDetail <= 0 ? 2 : 4;
  for (let i = 0; i < bands; i++) ctx.fillRect(x + 2 + i * 5, y + 2, 3, 4);
  if (holoDetail >= 2) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#29d8ff';
    ctx.fillRect(x + 2, y - 3, 24, 8);
    ctx.globalAlpha = 1;
  }
  if (holoDetail >= 3) {
    ctx.globalAlpha = 0.22;
    ctx.fillRect(x - 2, y + 3, 24, 8);
    ctx.globalAlpha = 1;
  }
}

function paintBloom(ctx: CanvasRenderingContext2D, alpha: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(72, 32, 2, 72, 32, 28);
  glow.addColorStop(0, `rgba(255, 45, 140, ${alpha})`);
  glow.addColorStop(1, 'rgba(255, 45, 140, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(40, 8, 64, 48);
  const cyan = ctx.createRadialGradient(78, 32, 1, 78, 32, 16);
  cyan.addColorStop(0, `rgba(41, 216, 255, ${alpha * 0.8})`);
  cyan.addColorStop(1, 'rgba(41, 216, 255, 0)');
  ctx.fillStyle = cyan;
  ctx.fillRect(56, 16, 40, 36);
  ctx.restore();
}

function paintRain(ctx: CanvasRenderingContext2D, rainCount: number, street: number): void {
  const n = Math.round(8 + (rainCount / 24000) * 34);
  ctx.strokeStyle = 'rgba(190, 210, 230, 0.45)';
  ctx.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    const x = (i * 47) % W;
    const y = (i * 29) % (street - 6);
    const len = 4 + (i % 5);
    ctx.globalAlpha = 0.25 + (i % 4) * 0.15;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 1.2, y + len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function paintCar(ctx: CanvasRenderingContext2D, street: number): void {
  ctx.fillStyle = '#1b1e28';
  ctx.fillRect(18, street - 5, 16, 4);
  ctx.fillStyle = '#ff9a2e';
  ctx.fillRect(19, street - 4, 2, 1.5);
  ctx.fillStyle = '#29d8ff';
  ctx.fillRect(31, street - 4, 2, 1.5);
}

function paintStreaks(ctx: CanvasRenderingContext2D, street: number): void {
  ctx.strokeStyle = 'rgba(255, 154, 46, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(14, street - 2);
  ctx.lineTo(36, street - 2);
  ctx.moveTo(108, street - 3);
  ctx.lineTo(132, street - 3);
  ctx.stroke();
}
