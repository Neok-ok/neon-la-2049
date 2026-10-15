# Build the human kit: palettes, atlas, silhouette sheets, Blender glTF, meshopt.
#   python3 tools/human-harness/build.py
# Reference photos stay out of git. This writes derived notes and the runtime files.
import json
import os
import struct
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools' / 'human-harness'))

from lib.crowd import build_crowd
from lib.dancer import build_dancer, dancer_palette
from lib.gait import BONES, CLIPS, FRAMES, STRIDE, palette_bytes
from lib.score import save_overlap, score_crowd, score_dancer

OUT = ROOT / 'public' / 'models' / 'humans'
SHEETS = ROOT / 'tools' / 'human-harness' / 'sheets'
RAW = ROOT / 'tools' / 'human-harness' / 'build'


def _noise(x, y, salt):
    n = (x * 374761393 + y * 668265263 + salt * 1442695041) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return (n & 255) / 255.0


def write_atlas(path: Path):
    """512 atlas. Skin, wool, vinyl, leather. No face, no logo, no text."""
    w = h = 512
    img = Image.new('RGBA', (w, h), (0, 0, 0, 255))
    px = img.load()
    for y in range(h):
        for x in range(w):
            u, v = x / w, y / h
            n = _noise(x, y, 3)
            n2 = _noise(x // 2, y // 2, 9)
            if v >= 0.5 and u < 0.5:
                # Skin. Warm, low frequency, pores as a multiply. Not a portrait.
                base = (196, 154, 132)
                pore = 0.92 + 0.08 * n
                veins = 0.97 + 0.03 * _noise(x // 8, y // 8, 2)
                px[x, y] = tuple(int(c * pore * veins) for c in base) + (255,)
            elif v >= 0.5:
                # Wool. A twill, slightly warm, soot in the valleys.
                twill = 0.75 + 0.25 * (1 if ((x // 3 + y // 2) & 3) == 0 else 0.15 + 0.2 * n)
                soot = 0.82 + 0.18 * n2
                px[x, y] = (int(168 * twill * soot), int(160 * twill * soot), int(150 * twill * soot), 255)
            elif u < 0.5:
                # Vinyl rainwear. Smooth, a broad highlight band, no print.
                band = 0.55 + 0.45 * abs((y % 64) / 32.0 - 1.0)
                px[x, y] = (int(210 * band), int(206 * band), int(198 * band), 255)
            else:
                # Leather. Grain, darker.
                grain = 0.55 + 0.45 * n
                px[x, y] = (int(92 * grain), int(74 * grain), int(58 * grain), 255)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)


def write_mask(path: Path):
    """Front silhouette in the 15 m × 68 m quad's UV.

    Medium, not the low shell. The low shell is one filled polygon, and that
    mask was painting the skirt gaps shut on the far quad.
    """
    mesh = build_dancer('medium')
    w, h = 256, 512
    img = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(img)
    panel_w, panel_h = 15.0, 68.0
    for i in range(0, len(mesh.idx), 3):
        pts = []
        for k in range(3):
            p = mesh.pos[mesh.idx[i + k]]
            u = 0.5 + p[0] / panel_w
            v = 0.02 + p[1] / panel_h
            pts.append((u * (w - 1), (1.0 - v) * (h - 1)))
        draw.polygon(pts, fill=255)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)


def write_scores():
    SHEETS.mkdir(parents=True, exist_ok=True)
    report = {'crowd': {}, 'dancer': {}}
    for lod in ('low', 'medium', 'high'):
        c = score_crowd(lod)
        save_overlap(c['masks'], SHEETS / f'crowd-{lod}-iou.png')
        report['crowd'][lod] = {
            'triangles': c['triangles'],
            'iou': {k: round(v, 4) for k, v in c['iou'].items()},
            'anthro': c['anthro'],
            'plant': {k: (round(v, 5) if isinstance(v, float) else v) for k, v in c['plant'].items()},
        }
        d = score_dancer(lod)
        save_overlap(d['masks'], SHEETS / f'dancer-{lod}-iou.png')
        report['dancer'][lod] = {
            'triangles': d['triangles'],
            'iou': {k: round(v, 4) for k, v in d['iou'].items()},
        }
    (SHEETS / 'scores.json').write_text(json.dumps(report, indent=2))
    return report


def write_palettes():
    OUT.mkdir(parents=True, exist_ok=True)
    raw, width, height, lo, hi = palette_bytes()
    (OUT / 'crowd-palette.bin').write_bytes(raw)
    draw, dwidth, dheight, dlo, dhi = dancer_palette()
    (OUT / 'dancer-palette.bin').write_bytes(draw)
    manifest = {
        'crowd': {
            'bones': BONES,
            'clips': CLIPS,
            'frames': FRAMES,
            'stride': STRIDE,
            'palette': {'width': width, 'height': height, 'min': lo, 'max': hi, 'file': 'crowd-palette.bin'},
            'parts': {
                'torso': 0, 'head': 1, 'legL': 2, 'legR': 3, 'armL': 4, 'armR': 5,
                'coat': 6, 'canopy': 7, 'shaft': 8, 'hood': 9, 'hat': 10, 'bag': 11,
                'shortCoat': 12, 'rainArm': 15, 'respirator': 16,
            },
        },
        'dancer': {
            'frames': 32,
            'period': 6.28318530718 / 1.2,
            'palette': {'width': dwidth, 'height': dheight, 'min': dlo, 'max': dhi, 'file': 'dancer-palette.bin'},
        },
        'textures': {
            'atlas': 'crowd-atlas.ktx2',
            'atlasFallback': 'crowd-atlas.png',
            'mask': 'dancer-mask.ktx2',
            'maskFallback': 'dancer-mask.png',
        },
    }
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    # Touch the struct import so a future packed header can reuse it.
    assert struct.calcsize('<4B') == 4


def run(cmd):
    print(' ', ' '.join(cmd))
    subprocess.check_call(cmd, cwd=ROOT)


def main():
    write_atlas(OUT / 'crowd-atlas.png')
    write_mask(OUT / 'dancer-mask.png')
    run(['node', str(ROOT / 'scripts' / 'encode-human-ktx2.mjs')])
    write_palettes()
    report = write_scores()
    print(json.dumps({k: {lod: v['iou'] for lod, v in d.items()} for k, d in report.items()}, indent=2))
    raw = RAW
    raw.mkdir(parents=True, exist_ok=True)
    blender = os.environ.get('BLENDER', 'blender')
    run([
        blender, '-b', '--python', str(ROOT / 'tools' / 'human-harness' / 'blender' / 'export_humans.py'),
        '--', str(ROOT), str(raw),
    ])
    for name in ('crowd-low', 'crowd-medium', 'crowd-high', 'dancer-low', 'dancer-medium', 'dancer-high'):
        src = raw / f'{name}.raw.glb'
        dst = OUT / f'{name}.glb'
        # -vtf keeps part and bone ids in TEXCOORD_1. Integer quantization
        # without a material transform wrote that set as zeros.
        run(['gltfpack', '-i', str(src), '-o', str(dst), '-c', '-kn', '-kv', '-vp', '16', '-vt', '14', '-vtf'])
    print('humans built', OUT)


if __name__ == '__main__':
    main()
