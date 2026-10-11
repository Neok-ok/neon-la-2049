#!/usr/bin/env python3
"""Download the comparison stills listed in refs/manifest.json into .refs/.

The images stay gitignored. Re-run this on a fresh checkout before a contact sheet.
"""
import json
import os
import urllib.request

from PIL import Image
import io

HERE = os.path.dirname(os.path.abspath(__file__))
HARNESS = os.path.dirname(HERE)
MANIFEST = os.path.join(HARNESS, 'refs', 'manifest.json')
CACHE = os.path.join(HARNESS, '.refs')


def main():
    with open(MANIFEST, encoding='utf-8') as f:
        manifest = json.load(f)
    os.makedirs(CACHE, exist_ok=True)
    for still in manifest['stills']:
        dest = os.path.join(CACHE, still['file'])
        if os.path.isfile(dest) and os.path.getsize(dest) > 1000:
            print('have', dest)
            continue
        print('get', still['id'], still['url'])
        req = urllib.request.Request(still['url'], headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
        crop = still.get('crop')
        if crop:
            image = Image.open(io.BytesIO(data))
            x, y, w, h = crop
            image = image.crop((x, y, x + w, y + h))
            if dest.lower().endswith('.png'):
                image.save(dest)
            else:
                image.convert('RGB').save(dest, quality=90)
            print('wrote', dest, 'crop', crop, os.path.getsize(dest))
        else:
            with open(dest, 'wb') as f:
                f.write(data)
            print('wrote', dest, len(data))


if __name__ == '__main__':
    main()
