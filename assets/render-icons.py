"""Renderar SVG-källor -> PNG i alla format som Expo/Play behöver.

Körs manuellt när ikonen ändras:
    python assets/render-icons.py

Använder resvg_py (pure native rasterizer, inga externa DLL:er).
"""
from pathlib import Path
import resvg_py
from PIL import Image

HERE = Path(__file__).parent

def render(svg_name: str, png_name: str, size: int, bg: str | None = None,
           height: int | None = None):
    svg_path = str(HERE / svg_name)
    out = HERE / png_name
    h = height if height is not None else size
    png_bytes = bytes(resvg_py.svg_to_bytes(
        svg_path=svg_path,
        width=size,
        height=h,
        background=bg,
    ))
    out.write_bytes(png_bytes)
    print(f"  {png_name:38s} {size}x{h}")

# Huvudikon (iOS/web/Expo fallback): full komposition, 1024x1024
render("icon-source.svg",      "icon.png",                     1024)

# Android adaptive foreground: transparent, motiv inom safe zone
render("icon-foreground.svg",  "android-icon-foreground.png",  1024)

# Monokrom (Android 13+ themed icons)
render("icon-monochrome.svg",  "android-icon-monochrome.png",  1024)

# Splash (samma motiv, ramas av "contain")
render("icon-source.svg",      "splash-icon.png",              1024)

# Web favicon
render("icon-source.svg",      "favicon.png",                  256)

# Play Store hi-res (512x512)
render("icon-source.svg",      "play-store-icon.png",          512)

# Play Store feature graphic (1024x500) – visas överst på butiksposten
render("feature-graphic.svg",  "feature-graphic.png",          1024, height=500)

# Solid bakgrund för adaptive icon (ingen motivblödning)
Image.new("RGBA", (1024, 1024), (0x1a, 0x5c, 0x2e, 255)).save(
    HERE / "android-icon-background.png"
)
print(f"  {'android-icon-background.png':38s} 1024x1024 (solid #1a5c2e)")

print("\nKlart.")
