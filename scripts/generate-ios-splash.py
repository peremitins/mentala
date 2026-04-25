#!/usr/bin/env python3
"""
Генерация splash-screen ассетов для iOS и Android из assets/splash-icon.png.

Использование:
    python3 scripts/generate-ios-splash.py

Исходник (положить в корень проекта):
    assets/splash-icon.png  — логотип (PNG с прозрачностью, мин. 1024x1024)
"""

import os
import sys
from PIL import Image, ImageFilter, ImageDraw

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SCRIPT_DIR)
ASSETS_DIR = os.path.join(ROOT, "assets")
IOS_ASSETS = os.path.join(ROOT, "ios", "App", "App", "Assets.xcassets")
ANDROID_RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

ICON_SRC = os.path.join(ASSETS_DIR, "splash-icon.png")

# iOS SplashMark (логотип): 1x / 2x / 3x
MARK_SIZES = {
    "splash-mark.png": 340,
    "splash-mark-1.png": 680,
    "splash-mark-2.png": 1020,
}

# iOS SplashBackdrop (фон): 1x / 2x / 3x
BACKDROP_SIZES = {
    "splash-backdrop.png": 320,
    "splash-backdrop-1.png": 640,
    "splash-backdrop-2.png": 1242,
}

# Android splash — все drawable-* папки со своими размерами (ширина, высота)
ANDROID_SPLASH_DIRS = {
    "drawable":                    (320,  480),
    "drawable-night":              (320,  480),
    "drawable-land-ldpi":          (426,  320),
    "drawable-land-mdpi":          (470,  320),
    "drawable-land-hdpi":          (640,  480),
    "drawable-land-xhdpi":         (960,  720),
    "drawable-land-xxhdpi":        (1280, 960),
    "drawable-land-xxxhdpi":       (1920, 1280),
    "drawable-land-night-ldpi":    (426,  320),
    "drawable-land-night-mdpi":    (470,  320),
    "drawable-land-night-hdpi":    (640,  480),
    "drawable-land-night-xhdpi":   (960,  720),
    "drawable-land-night-xxhdpi":  (1280, 960),
    "drawable-land-night-xxxhdpi": (1920, 1280),
    "drawable-port-ldpi":          (320,  426),
    "drawable-port-mdpi":          (320,  470),
    "drawable-port-hdpi":          (480,  800),
    "drawable-port-xhdpi":         (720,  960),
    "drawable-port-xxhdpi":        (960,  1280),
    "drawable-port-xxxhdpi":       (1280, 1920),
    "drawable-port-night-ldpi":    (320,  426),
    "drawable-port-night-mdpi":    (320,  470),
    "drawable-port-night-hdpi":    (480,  800),
    "drawable-port-night-xhdpi":   (720,  960),
    "drawable-port-night-xxhdpi":  (960,  1280),
    "drawable-port-night-xxxhdpi": (1280, 1920),
}

# Размер логотипа относительно меньшей стороны сплэша
LOGO_RATIO = 0.45


def make_gradient_bg(width: int, height: int) -> Image.Image:
    """Тёмный фон #090B12 с синим свечением сверху-слева и фиолетовым снизу-справа."""
    size = max(width, height)
    base = Image.new("RGB", (size, size), (9, 11, 18))

    glow1 = Image.new("RGB", (size, size), (0, 0, 0))
    d1 = ImageDraw.Draw(glow1)
    r1 = int(size * 0.22)
    cx1, cy1 = int(size * 0.28), int(size * 0.22)
    d1.ellipse([cx1 - r1, cy1 - r1, cx1 + r1, cy1 + r1], fill=(8, 22, 55))
    glow1 = glow1.filter(ImageFilter.GaussianBlur(radius=int(size * 0.14)))

    glow2 = Image.new("RGB", (size, size), (0, 0, 0))
    d2 = ImageDraw.Draw(glow2)
    r2 = int(size * 0.18)
    cx2, cy2 = int(size * 0.75), int(size * 0.80)
    d2.ellipse([cx2 - r2, cy2 - r2, cx2 + r2, cy2 + r2], fill=(30, 5, 45))
    glow2 = glow2.filter(ImageFilter.GaussianBlur(radius=int(size * 0.12)))

    def screen(a, b):
        return tuple(min(255, int(255 - (255 - x) * (255 - y) / 255)) for x, y in zip(a, b))

    result = Image.new("RGB", (size, size))
    for y in range(size):
        for x in range(size):
            c = screen(base.getpixel((x, y)), glow1.getpixel((x, y)))
            c = screen(c, glow2.getpixel((x, y)))
            result.putpixel((x, y), c)

    # Обрезаем до нужного соотношения сторон
    if width != height:
        result = result.crop((0, 0, width, height)) if width < height else result.crop((0, 0, width, height))
        result = result.resize((width, height), Image.LANCZOS)

    return result


def compose_splash(icon: Image.Image, width: int, height: int) -> Image.Image:
    """Накладывает логотип по центру на градиентный фон."""
    bg = make_gradient_bg(width, height)
    logo_size = int(min(width, height) * LOGO_RATIO)
    logo = icon.resize((logo_size, logo_size), Image.LANCZOS)
    x = (width - logo_size) // 2
    y = (height - logo_size) // 2
    bg.paste(logo, (x, y), logo)
    return bg


def main():
    if not os.path.exists(ICON_SRC):
        print(f"Ошибка: не найден {ICON_SRC}")
        print("Положи логотип в assets/splash-icon.png и запусти снова.")
        sys.exit(1)

    icon = Image.open(ICON_SRC).convert("RGBA")

    # --- iOS ---
    print("iOS:")
    mark_dir = os.path.join(IOS_ASSETS, "SplashMark.imageset")
    os.makedirs(mark_dir, exist_ok=True)
    for fname, size in MARK_SIZES.items():
        out = icon.resize((size, size), Image.LANCZOS)
        out.save(os.path.join(mark_dir, fname))
        print(f"  SplashMark {fname}: {size}x{size}")

    backdrop_dir = os.path.join(IOS_ASSETS, "SplashBackdrop.imageset")
    os.makedirs(backdrop_dir, exist_ok=True)
    for fname, size in BACKDROP_SIZES.items():
        bg = make_gradient_bg(size, size)
        bg.save(os.path.join(backdrop_dir, fname))
        print(f"  SplashBackdrop {fname}: {size}x{size}")

    # --- Android ---
    print("\nAndroid:")
    for folder, (w, h) in ANDROID_SPLASH_DIRS.items():
        out_dir = os.path.join(ANDROID_RES, folder)
        os.makedirs(out_dir, exist_ok=True)
        splash = compose_splash(icon, w, h)
        splash.save(os.path.join(out_dir, "splash.png"))
        print(f"  {folder}/splash.png: {w}x{h}")

    print("\nГотово! Запусти pnpm cap:sync для синхронизации.")


if __name__ == "__main__":
    main()
