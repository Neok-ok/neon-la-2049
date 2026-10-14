#!/usr/bin/env python3
"""Overlap the orthographic silhouette render with the traced K outlines.

Uniform scale, in metres. The render is not stretched to the reference box.
Side and front traces are perspective estimates. The top trace is the published top view, notch included.

  python3 tools/model-harness/scripts/iou.py \
    --render tools/model-harness/reviews/m2/round0-mask.png \
    --meta tools/model-harness/reviews/m2/round0-mask.json \
    --out tools/model-harness/reviews/m2/round0-iou.json \
    --overlay tools/model-harness/reviews/m2/round0-iou.png
"""
import argparse
import json
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
HARNESS = os.path.dirname(HERE)
TRACE = os.path.join(HARNESS, 'silhouettes', 'k-spinner.json')
FRUSTUM = os.path.join(HARNESS, 'silhouettes', 'frustum.json')


def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def raster(points, project, size):
    img = Image.new('L', size, 0)
    draw = ImageDraw.Draw(img)
    draw.polygon([project(p) for p in points], fill=255)
    return img


def proj_xz(bounds, key_x0, key_x1, key_z0, key_z1, size):
    w, h = size
    span_x = bounds[key_x1] - bounds[key_x0]
    span_z = bounds[key_z1] - bounds[key_z0]

    def project(point):
        x, z = point
        u = (x - bounds[key_x0]) / span_x * w
        v = (bounds[key_z1] - z) / span_z * h
        return (u, v)

    return project


def proj_top(bounds, size):
    w, h = size
    span_x = bounds['x1'] - bounds['x0']
    span_y = bounds['y1'] - bounds['y0']

    def project(point):
        x, y = point
        u = (x - bounds['x0']) / span_x * w
        v = (bounds['y1'] - y) / span_y * h
        return (u, v)

    return project


def model_mask(crop, thresh):
    gray = crop.convert('L')
    return gray.point(lambda p: 255 if p >= thresh else 0)


def iou(ref, model):
    r = ref.tobytes()
    m = model.tobytes()
    if len(r) != len(m):
        raise SystemExit(f'mask size mismatch {len(r)} vs {len(m)}')
    inter = union = 0
    only_ref = only_model = 0
    for a, b in zip(r, m):
        inside_a = a > 127
        inside_b = b > 127
        if inside_a and inside_b:
            inter += 1
            union += 1
        elif inside_a or inside_b:
            union += 1
            if inside_a:
                only_ref += 1
            else:
                only_model += 1
    return {
        'iou': (inter / union) if union else 0.0,
        'intersection': inter,
        'union': union,
        'onlyRef': only_ref,
        'onlyModel': only_model,
    }


def overlay(ref, model):
    w, h = ref.size
    out = Image.new('RGB', (w, h), (8, 8, 10))
    rp, mp = ref.load(), model.load()
    px = out.load()
    for y in range(h):
        for x in range(w):
            a = rp[x, y] > 127
            b = mp[x, y] > 127
            if a and b:
                px[x, y] = (236, 232, 220)
            elif a:
                px[x, y] = (196, 64, 54)
            elif b:
                px[x, y] = (64, 168, 196)
    return out


def landmark_frame(bounds, ppm):
    w = max(1, round((bounds['x1'] - bounds['x0']) * ppm))
    h = max(1, round((bounds['y1'] - bounds['y0']) * ppm))
    return {**bounds, 'w': w, 'h': h, 'ppm': ppm}


def landmark_frames(trace):
    b = trace['bounds']
    pad = trace.get('pad', 8)
    ppm = trace['ppm']
    side = landmark_frame({
        'x0': -(b['maxZ'] + pad), 'x1': -(b['minZ'] - pad),
        'y0': b['minY'] - pad, 'y1': b['maxY'] + pad,
    }, ppm)
    front = landmark_frame({
        'x0': b['minX'] - pad, 'x1': b['maxX'] + pad,
        'y0': b['minY'] - pad, 'y1': b['maxY'] + pad,
    }, ppm)
    top = landmark_frame({
        'x0': -(b['maxZ'] + pad), 'x1': -(b['minZ'] - pad),
        'y0': -(b['maxX'] + pad), 'y1': -(b['minX'] - pad),
    }, ppm)
    return {'side': side, 'front': front, 'top': top}


def to_pix(frame, u, v):
    return ((u - frame['x0']) * frame['ppm'], (frame['y1'] - v) * frame['ppm'])


def paint_part(draw, frame, part, view):
    if part['type'] == 'frustum':
        rings = (
            (part['w0'], part['d0'], part['y']),
            (part['w1'], part['d1'], part['y'] + part['h']),
        )
    else:
        rings = (
            (part['w'], part['d'], part['y']),
            (part['w'], part['d'], part['y'] + part['h']),
        )
    if view == 'top':
        for w, d, _y in rings:
            corners = []
            for sx in (-1, 1):
                for sz in (-1, 1):
                    x = part['cx'] + sx * w * 0.5
                    z = part['cz'] + sz * d * 0.5
                    corners.append(to_pix(frame, -z, -x))
            # rectangle order
            ordered = [corners[0], corners[1], corners[3], corners[2]]
            draw.polygon(ordered, fill=255)
        return
    if view == 'side':
        (w0, d0, y0), (w1, d1, y1) = rings
        pts = [
            to_pix(frame, -(part['cz'] - d0 * 0.5), y0),
            to_pix(frame, -(part['cz'] + d0 * 0.5), y0),
            to_pix(frame, -(part['cz'] + d1 * 0.5), y1),
            to_pix(frame, -(part['cz'] - d1 * 0.5), y1),
        ]
    else:
        (w0, d0, y0), (w1, d1, y1) = rings
        pts = [
            to_pix(frame, part['cx'] - w0 * 0.5, y0),
            to_pix(frame, part['cx'] + w0 * 0.5, y0),
            to_pix(frame, part['cx'] + w1 * 0.5, y1),
            to_pix(frame, part['cx'] - w1 * 0.5, y1),
        ]
    draw.polygon(pts, fill=255)


def raster_landmark(trace, view, size):
    frame = landmark_frames(trace)[view]
    if (frame['w'], frame['h']) != size:
        raise SystemExit(f'{view} panel {size} != silhouette frame {(frame["w"], frame["h"])}')
    img = Image.new('L', size, 0)
    draw = ImageDraw.Draw(img)
    for part in trace['parts']:
        paint_part(draw, frame, part, view)
    return img


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--render', required=True)
    parser.add_argument('--meta', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--overlay', required=True)
    parser.add_argument('--thresh', type=int, default=40)
    parser.add_argument('--trace', default=TRACE)
    parser.add_argument('--frustum', default=FRUSTUM)
    args = parser.parse_args()

    trace = load_json(args.trace)
    frustum = load_json(args.frustum) if not trace.get('parts') else None
    meta = load_json(args.meta)
    render = Image.open(args.render).convert('RGB')
    panels = {panel['id']: panel for panel in meta['panels']}
    if render.size[0] < 32:
        raise SystemExit(f'render is unexpectedly small: {render.size}')

    views = {}
    strips = []
    for name, bounds_key, projector in (
        ('side', 'side', lambda b, s: proj_xz(b, 'x0', 'x1', 'z0', 'z1', s)),
        ('front', 'front', lambda b, s: proj_xz(b, 'x0', 'x1', 'z0', 'z1', s)),
        ('top', 'top', lambda b, s: proj_top(b, s)),
    ):
        panel = panels[name]
        size = (panel['w'], panel['h'])
        crop = render.crop((panel['x'], panel['y'], panel['x'] + panel['w'], panel['y'] + panel['h']))
        if crop.size != size:
            raise SystemExit(f'{name} crop {crop.size} != panel {size}. The mask screenshot is not the canvas.')
        if name == 'top' and trace.get('strayHullOnly'):
            # The part boxes are the stray hull. They are not the plan.
            ref = Image.new('L', size, 0)
            note = trace.get('source', '')
            photo = True
            model = model_mask(crop, args.thresh)
            views[name] = {
                'iou': None,
                'source': 'photographed or surveyed plan, scored by film_iou.mjs',
                'photo': True,
                'note': note,
                'skipped': 'source boxes are not a plan',
            }
            strips.append(overlay(ref, model))
            print(f"{name:5} plan is not these boxes")
            continue
        if trace.get('parts'):
            ref = raster_landmark(trace, name, size)
            note = trace.get('source', '')
            photo = False
        else:
            ref = raster(trace['views'][name]['points'], projector(frustum[bounds_key], size), size)
            note = trace['views'][name].get('orthographic') or trace['views'][name].get('note') or ''
            photo = bool(trace['views'][name].get('photo'))
        model = model_mask(crop, args.thresh)
        score = iou(ref, model)
        score['source'] = trace.get('source') if trace.get('parts') else trace['views'][name].get('source')
        score['photo'] = photo
        score['note'] = note
        views[name] = score
        strips.append(overlay(ref, model))
        print(f"{name:5} IoU {score['iou']:.3f}  ref-only {score['onlyRef']}  model-only {score['onlyModel']}")

    gap = 8
    width = max(im.width for im in strips)
    height = sum(im.height for im in strips) + gap * (len(strips) - 1)
    sheet = Image.new('RGB', (width, height), (12, 12, 14))
    y = 0
    for im in strips:
        sheet.paste(im, (0, y))
        y += im.height + gap
    os.makedirs(os.path.dirname(os.path.abspath(args.overlay)) or '.', exist_ok=True)
    sheet.save(args.overlay)
    payload = {
        'views': views,
        'targets': {'side': 0.85, 'front': 0.80, 'top': 0.80},
        'legend': 'White is overlap. Red is reference only. Cyan is model only.',
        'alignment': trace.get('alignment') or trace.get('source') or '',
        # True only when the top mask was rasterised from the mesh's own boxes.
        'topIsReconstructed': bool(trace.get('parts')) and not trace.get('strayHullOnly') and not (trace.get('views') or {}).get('top', {}).get('plan'),
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)) or '.', exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=2)
    print('WROTE', args.out)
    print('WROTE', args.overlay)


if __name__ == '__main__':
    main()
