"""Обложки ТЦ без фона для hero каталога ТЦ (владелец, 2026-09-30: «без фона и крупнее»).

Обложки в стиле O нарисованы на ровном светлом фоне. Фон заливкой от краёв
(только то, что связано с краем кадра, — светлые окна внутри здания не
трогаются) становится прозрачным с мягким переходом, цвет полупрозрачных
пикселей очищается от фона, картинка обрезается по зданию. Пишет рядом с
обложкой <имя>-cutout.webp и копии -cutout-w480/-w720.

Запуск (нужны Pillow и numpy, список ТЦ — из собранного dist/data):
  python3 scripts/cutout-tc-covers.py            # все ТЦ каталога
  python3 scripts/cutout-tc-covers.py tc-zamok   # отдельные обложки по имени файла
"""
import sys, numpy as np
from PIL import Image
from collections import deque
def cutout(src, dst, lo=8, hi=48, pad=0.03):
    im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
    h, w, _ = im.shape
    border = np.concatenate([im[0], im[-1], im[:,0], im[:,-1]])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((im - bg) ** 2).sum(-1))
    cand = dist < hi
    # flood from borders through candidate pixels
    reach = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if cand[y, x] and not reach[y, x]: reach[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if cand[y, x] and not reach[y, x]: reach[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny, nx = y+dy, x+dx
            if 0 <= ny < h and 0 <= nx < w and cand[ny, nx] and not reach[ny, nx]:
                reach[ny, nx] = True; q.append((ny, nx))
    a = np.ones((h, w), np.float32)
    ramp = np.clip((dist - lo) / (hi - lo), 0, 1)
    a[reach] = ramp[reach]
    # unmix background from partially transparent pixels
    out = im.copy()
    m = reach & (a > 0.02)
    out[m] = (im[m] - (1 - a[m, None]) * bg) / a[m, None]
    out = np.clip(out, 0, 255)
    ys, xs = np.where(a > 0.1)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    p = int(max(y1 - y0, x1 - x0) * pad)
    y0, x0 = max(0, y0 - p), max(0, x0 - p); y1, x1 = min(h - 1, y1 + p), min(w - 1, x1 + p)
    rgba = np.dstack([out, a * 255]).astype(np.uint8)[y0:y1+1, x0:x1+1]
    Image.fromarray(rgba, 'RGBA').save(dst, 'WEBP', quality=86, method=6)
    return bg, (x1-x0+1, y1-y0+1)

if __name__ == '__main__':
    import json, sys
    names = sys.argv[1:] or [r['photos'][0].rsplit('/', 1)[1].rsplit('.', 1)[0]
                             for r in json.load(open('dist/data/trade-centers.json'))['rows'] if r.get('photos')]
    for name in names:
        src = f'public/images/business-centers/{name}.webp'
        dst = f'public/images/business-centers/{name}-cutout.webp'
        cutout(src, dst)
        im = Image.open(dst)
        for w in (480, 720):
            small = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS) if im.width > w else im
            small.save(dst.replace('-cutout.webp', f'-cutout-w{w}.webp'), 'WEBP', quality=84, method=6)
        print(name)
