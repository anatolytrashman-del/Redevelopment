"""Обложки для скрытых ТЦ без фото: rembg → белый квадрат 1200×1200.

Источники:
  - Купаловский / Глобус Парк / Лобанка 26 — URL владельца с megapolis-real.by
  - остальные — megapolis / сайты ТЦ / Яндекс.Карты (Поле чудес — вывеска)

Запуск (нужны rembg, pillow, numpy; исходники в /tmp/tc-covers/src):
  python3 scripts/make-tc-covers-missing.py
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from rembg import remove

SRC = Path("/tmp/tc-covers/src")
OUT_PUBLIC = Path("public/images/business-centers")
OUT_TMP = Path("/tmp/tc-covers/out")
SIZE = 1200
PAD = 0.06

# slug -> (файл, scrub_megapolis_watermark, optional crop box LTRB fractions)
SOURCES: dict[str, tuple[str, bool, tuple[float, float, float, float] | None]] = {
    "kupalovskiy": ("kupalovskiy-owner.jpg", True, None),
    "globus-park": ("globus-park-owner.jpg", True, None),
    "lobanka-26": ("lobanka-26-owner.jpg", True, None),
    "korona-siti": ("korona-siti-hero.jpg", True, None),
    "talisman-tc": ("talisman-tc1.jpg", False, None),
    "green-time": ("green-time-84.586ac5511231fe7d0ba69d79339a26f11.jpg", False, None),
    "stepyanka": ("stepyanka-mega-0.jpg", True, (0.42, 0.08, 0.98, 0.72)),
    "pole-chudes": ("pole-yandex-0.jpg", False, (0.18, 0.05, 0.92, 0.62)),
}


def scrub_watermark(im: Image.Image) -> Image.Image:
    arr = np.asarray(im.convert("RGB")).copy()
    h, w, _ = arr.shape
    x0, y0 = int(w * 0.70), 0
    x1, y1 = w, int(h * 0.16)
    patch = arr[y0:y1, x0:x1]
    g = patch.astype(np.int16)
    is_green = (g[:, :, 1] > 120) & (g[:, :, 1] > g[:, :, 0] + 40) & (g[:, :, 1] > g[:, :, 2] + 40)
    if is_green.any():
        left = arr[y0:y1, max(0, x0 - 40) : x0]
        fill = (
            np.median(left.reshape(-1, 3), axis=0).astype(np.uint8)
            if left.size
            else np.array([200, 200, 200], np.uint8)
        )
        patch[is_green] = fill
        arr[y0:y1, x0:x1] = patch
    return Image.fromarray(arr)


def compose_square(rgba: Image.Image, size: int = SIZE, pad: float = PAD) -> Image.Image:
    a = np.asarray(rgba.split()[-1])
    ys, xs = np.where(a > 12)
    if len(xs) == 0:
        raise RuntimeError("empty alpha after rembg")
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
    crop = rgba.crop((x0, y0, x1 + 1, y1 + 1))
    cw, ch = crop.size
    inner = int(size * (1 - 2 * pad))
    scale = min(inner / cw, inner / ch)
    nw, nh = max(1, int(round(cw * scale))), max(1, int(round(ch * scale)))
    resized = crop.resize((nw, nh), Image.LANCZOS)
    r, g, b, a = resized.split()
    a = a.filter(ImageFilter.GaussianBlur(radius=0.6))
    resized = Image.merge("RGBA", (r, g, b, a))
    canvas = Image.new("RGB", (size, size), (255, 255, 255))
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return canvas


def process(slug: str, src_name: str, scrub: bool, crop_frac) -> None:
    src = SRC / src_name
    if not src.exists():
        raise FileNotFoundError(src)
    im = Image.open(src).convert("RGB")
    if crop_frac:
        l, t, r, b = crop_frac
        w, h = im.size
        im = im.crop((int(w * l), int(h * t), int(w * r), int(h * b)))
    if scrub:
        im = scrub_watermark(im)
    if max(im.size) > 1800:
        s = 1800 / max(im.size)
        im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    cut = remove(im).convert("RGBA")
    out = compose_square(cut)
    OUT_PUBLIC.mkdir(parents=True, exist_ok=True)
    OUT_TMP.mkdir(parents=True, exist_ok=True)
    jpg = OUT_PUBLIC / f"tc-{slug}.jpg"
    out.save(jpg, "JPEG", quality=90, optimize=True)
    out.save(OUT_TMP / f"{slug}.webp", "WEBP", quality=88, method=6)
    print(f"{slug}: {src_name} -> {jpg} ({jpg.stat().st_size} B)")


def main() -> None:
    for slug, (src_name, scrub, crop) in SOURCES.items():
        process(slug, src_name, scrub, crop)


if __name__ == "__main__":
    main()
