// Original room atlas. Six ordinary rooms plus one hero. No text, no logos, no figures.
// Figures, if any, are a shader silhouette, not pixels in this image.
// Layout: 7 columns (rooms) × 4 rows (back, side, floor, ceiling). v = 0 is the back row.

export const ATLAS_CELL = 32;
export const ATLAS_COLS = 7;
export const ATLAS_ROWS = 4;
export const ATLAS_W = ATLAS_COLS * ATLAS_CELL;
export const ATLAS_H = ATLAS_ROWS * ATLAS_CELL;

export const ROOM_APT = 0;
export const ROOM_KITCHEN = 1;
export const ROOM_OFFICE = 2;
export const ROOM_STAIR = 3;
export const ROOM_STORAGE = 4;
export const ROOM_EMPTY = 5;
export const ROOM_HERO = 6;

const FACE_BACK = 0;
const FACE_SIDE = 1;
const FACE_FLOOR = 2;
const FACE_CEIL = 3;

type RGB = [number, number, number];

/** Straight-on back wall, after this gain, matches the old ly gradient mean (0.875). */
export const ATLAS_GAIN: number = 0.875 / (198 / 255);

function paint(data: Uint8Array): void {
  const C = ATLAS_CELL;
  const set = (room: number, face: number, x: number, y: number, c: RGB) => {
    if (x < 0 || y < 0 || x >= C || y >= C) return;
    const px = room * C + x;
    const py = face * C + y;
    const i = (py * ATLAS_W + px) * 4;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
    data[i + 3] = 255;
  };
  const fill = (room: number, face: number, c: RGB) => {
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) set(room, face, x, y, c);
  };
  const rect = (room: number, face: number, x0: number, y0: number, x1: number, y1: number, c: RGB) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(room, face, x, y, c);
  };
  const disc = (room: number, face: number, cx: number, cy: number, rad: number, c: RGB) => {
    const r2 = rad * rad;
    for (let y = Math.floor(cy - rad); y <= cy + rad; y++) {
      for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r2) set(room, face, x, y, c);
      }
    }
  };

  const plaster: RGB = [186, 176, 162];
  const plasterD: RGB = [150, 140, 128];
  const tile: RGB = [198, 204, 196];
  const office: RGB = [176, 184, 196];
  const concrete: RGB = [142, 140, 134];
  const wood: RGB = [112, 78, 50];
  const lamp: RGB = [244, 228, 196];
  const screen: RGB = [42, 64, 108];

  // Apartment
  fill(ROOM_APT, FACE_BACK, plaster);
  rect(ROOM_APT, FACE_BACK, 0, 0, C, 4, [124, 104, 84]);
  rect(ROOM_APT, FACE_BACK, 0, 28, C, C, [214, 204, 188]);
  rect(ROOM_APT, FACE_BACK, 5, 9, 16, 19, screen);
  rect(ROOM_APT, FACE_BACK, 0, 8, C, 10, plasterD);
  fill(ROOM_APT, FACE_SIDE, [168, 158, 146]);
  rect(ROOM_APT, FACE_SIDE, 0, 0, 6, C, plasterD);
  fill(ROOM_APT, FACE_FLOOR, wood);
  fill(ROOM_APT, FACE_CEIL, [214, 206, 190]);
  disc(ROOM_APT, FACE_CEIL, 16, 18, 5, lamp);

  // Kitchen
  fill(ROOM_KITCHEN, FACE_BACK, tile);
  rect(ROOM_KITCHEN, FACE_BACK, 0, 0, C, 12, [96, 112, 106]);
  rect(ROOM_KITCHEN, FACE_BACK, 4, 14, 12, 22, [70, 130, 138]);
  rect(ROOM_KITCHEN, FACE_BACK, 18, 16, 28, 24, [160, 150, 130]);
  fill(ROOM_KITCHEN, FACE_SIDE, [180, 186, 178]);
  fill(ROOM_KITCHEN, FACE_FLOOR, [150, 148, 140]);
  fill(ROOM_KITCHEN, FACE_CEIL, [220, 224, 218]);
  rect(ROOM_KITCHEN, FACE_CEIL, 6, 14, 26, 18, [236, 240, 232]);

  // Office
  fill(ROOM_OFFICE, FACE_BACK, office);
  rect(ROOM_OFFICE, FACE_BACK, 0, 0, C, 11, [96, 104, 118]);
  rect(ROOM_OFFICE, FACE_BACK, 6, 12, 15, 20, [150, 176, 210]);
  rect(ROOM_OFFICE, FACE_BACK, 18, 13, 27, 21, [150, 176, 210]);
  fill(ROOM_OFFICE, FACE_SIDE, [164, 172, 184]);
  fill(ROOM_OFFICE, FACE_FLOOR, [78, 82, 90]);
  fill(ROOM_OFFICE, FACE_CEIL, [198, 204, 214]);
  for (let x = 2; x < C; x += 8) rect(ROOM_OFFICE, FACE_CEIL, x, 6, x + 5, 26, [230, 234, 240]);

  // Stairwell
  fill(ROOM_STAIR, FACE_BACK, concrete);
  for (let i = 0; i < C; i++) {
    const y0 = Math.max(0, i - 4);
    rect(ROOM_STAIR, FACE_BACK, i, y0, i + 3, Math.min(C, y0 + 3), [108, 106, 100]);
  }
  fill(ROOM_STAIR, FACE_SIDE, [128, 126, 120]);
  rect(ROOM_STAIR, FACE_SIDE, 4, 0, 7, C, [96, 94, 88]);
  fill(ROOM_STAIR, FACE_FLOOR, [90, 88, 84]);
  fill(ROOM_STAIR, FACE_CEIL, [120, 118, 112]);
  disc(ROOM_STAIR, FACE_CEIL, 16, 16, 2, [180, 170, 140]);

  // Storage
  fill(ROOM_STORAGE, FACE_BACK, [62, 56, 48]);
  for (let y = 4; y < C; y += 7) rect(ROOM_STORAGE, FACE_BACK, 2, y, 30, y + 2, [108, 96, 74]);
  fill(ROOM_STORAGE, FACE_SIDE, [54, 50, 44]);
  fill(ROOM_STORAGE, FACE_FLOOR, [48, 42, 36]);
  fill(ROOM_STORAGE, FACE_CEIL, [70, 64, 56]);
  disc(ROOM_STORAGE, FACE_CEIL, 16, 20, 2, [160, 120, 70]);

  // Empty
  fill(ROOM_EMPTY, FACE_BACK, [158, 156, 150]);
  rect(ROOM_EMPTY, FACE_BACK, 8, 6, 14, 18, [140, 136, 128]);
  fill(ROOM_EMPTY, FACE_SIDE, [150, 148, 142]);
  fill(ROOM_EMPTY, FACE_FLOOR, [120, 116, 108]);
  fill(ROOM_EMPTY, FACE_CEIL, [168, 166, 160]);

  // Hero: a furnished apartment. Plant and screen are abstract shapes, not a person.
  fill(ROOM_HERO, FACE_BACK, [196, 180, 158]);
  rect(ROOM_HERO, FACE_BACK, 0, 0, C, 5, [130, 100, 72]);
  rect(ROOM_HERO, FACE_BACK, 3, 8, 18, 20, [48, 78, 130]);
  disc(ROOM_HERO, FACE_BACK, 24, 12, 4, [46, 92, 58]);
  disc(ROOM_HERO, FACE_BACK, 24, 16, 2.5, [70, 120, 72]);
  rect(ROOM_HERO, FACE_BACK, 8, 5, 22, 8, [110, 78, 52]);
  fill(ROOM_HERO, FACE_SIDE, [176, 158, 140]);
  rect(ROOM_HERO, FACE_SIDE, 0, 0, 10, C, [120, 72, 58]);
  fill(ROOM_HERO, FACE_FLOOR, [100, 70, 48]);
  rect(ROOM_HERO, FACE_FLOOR, 6, 8, 26, 24, [86, 48, 44]);
  fill(ROOM_HERO, FACE_CEIL, [220, 208, 186]);
  disc(ROOM_HERO, FACE_CEIL, 16, 16, 6, lamp);

  // Pull every back wall to the same mean so a room change does not lift the night.
  const target = 198;
  for (let room = 0; room < ATLAS_COLS; room++) {
    let sum = 0;
    let n = 0;
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const i = ((FACE_BACK * C + y) * ATLAS_W + room * C + x) * 4;
        sum += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
        n++;
      }
    }
    const mean = sum / Math.max(1, n);
    const s = target / Math.max(1, mean);
    for (let face = 0; face < ATLAS_ROWS; face++) {
      for (let y = 0; y < C; y++) {
        for (let x = 0; x < C; x++) {
          const i = ((face * C + y) * ATLAS_W + room * C + x) * 4;
          data[i] = Math.max(0, Math.min(255, Math.round(data[i]! * s)));
          data[i + 1] = Math.max(0, Math.min(255, Math.round(data[i + 1]! * s)));
          data[i + 2] = Math.max(0, Math.min(255, Math.round(data[i + 2]! * s)));
        }
      }
    }
  }
}

let cached: Uint8Array | null = null;

export function windowAtlasBytes(): Uint8Array {
  if (cached) return cached;
  const data = new Uint8Array(ATLAS_W * ATLAS_H * 4);
  paint(data);
  cached = data;
  return data;
}
