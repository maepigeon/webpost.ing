#!/usr/bin/env python3
"""Pixel comparison for the visual tester.

  compare.py compare manifest.json   -> prints JSON results
      manifest: [{"name","new","base","diff"}...]
  compare.py sheet out.png frame1.png frame2.png ...   -> contact sheet
  compare.py burst frame1.png frame2.png ...           -> JSON: consecutive frame change stats

A pixel counts as changed when any channel differs by more than TOL.
Changed pixels are grouped (32px cells, connected) into boxed regions.
"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw

TOL = 16
CELL = 32

def load(p):
    return Image.open(p).convert('RGB')

def regions(mask):
    h, w = mask.shape
    gh, gw = (h + CELL - 1) // CELL, (w + CELL - 1) // CELL
    grid = np.zeros((gh, gw), bool)
    ys, xs = np.nonzero(mask)
    grid[ys // CELL, xs // CELL] = True
    seen = np.zeros_like(grid)
    boxes = []
    for gy in range(gh):
        for gx in range(gw):
            if grid[gy, gx] and not seen[gy, gx]:
                stack = [(gy, gx)]; seen[gy, gx] = True
                x0 = x1 = gx; y0 = y1 = gy
                while stack:
                    cy, cx = stack.pop()
                    x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < gh and 0 <= nx < gw and grid[ny, nx] and not seen[ny, nx]:
                                seen[ny, nx] = True; stack.append((ny, nx))
                boxes.append([x0 * CELL, y0 * CELL, min(w, (x1 + 1) * CELL), min(h, (y1 + 1) * CELL)])
    return boxes

def diff_arrays(a, b):
    d = np.abs(a.astype(int) - b.astype(int)).max(axis=2)
    return d > TOL

def compare(item):
    new, base = load(item['new']), load(item['base'])
    if new.size != base.size:
        return {'name': item['name'], 'status': 'size', 'pct': 100.0, 'new_size': new.size, 'base_size': base.size, 'regions': []}
    a, b = np.asarray(new), np.asarray(base)
    mask = diff_arrays(a, b)
    n = int(mask.sum())
    pct = 100.0 * n / mask.size
    out = {'name': item['name'], 'status': 'same' if n == 0 else 'diff', 'pct': round(pct, 4), 'regions': []}
    if n:
        boxes = regions(mask)
        out['regions'] = boxes
        dim = Image.blend(new, Image.new('RGB', new.size, (255, 255, 255)), 0.55)
        # show changed pixels in full colour over the dimmed new image
        arr = np.asarray(dim).copy()
        arr[mask] = a[mask]
        img = Image.fromarray(arr)
        dr = ImageDraw.Draw(img)
        for bx in boxes:
            dr.rectangle(bx, outline=(255, 0, 0), width=2)
        img.save(item['diff'])
    return out

def sheet(out, frames):
    ims = [load(f) for f in frames]
    n = len(ims)
    cols = min(n, 3 if ims[0].width > 600 else 6)
    rows = (n + cols - 1) // cols
    scale = min(1.0, 1500 / (cols * ims[0].width))
    tw, th = int(ims[0].width * scale), int(ims[0].height * scale)
    S = Image.new('RGB', (cols * tw + (cols + 1) * 4, rows * th + (rows + 1) * 4), (40, 40, 40))
    for i, im in enumerate(ims):
        S.paste(im.resize((tw, th)), (4 + (i % cols) * (tw + 4), 4 + (i // cols) * (th + 4)))
    S.save(out)

def burst(frames):
    ims = [np.asarray(load(f)) for f in frames]
    res = []
    for i in range(1, len(ims)):
        if ims[i].shape != ims[i - 1].shape:
            res.append({'pct': 100.0, 'regions': []}); continue
        m = diff_arrays(ims[i], ims[i - 1])
        res.append({'pct': round(100.0 * m.sum() / m.size, 4), 'regions': regions(m) if m.any() else []})
    return res

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'compare':
        items = json.load(open(sys.argv[2]))
        print(json.dumps([compare(i) for i in items]))
    elif cmd == 'sheet':
        sheet(sys.argv[2], sys.argv[3:])
    elif cmd == 'burst':
        print(json.dumps(burst(sys.argv[2:])))
