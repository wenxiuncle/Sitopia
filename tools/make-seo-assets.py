"""Generate the social card and install icons for 趣站博物馆.

Usage: python tools/make-seo-assets.py
Requires Pillow. Uses the Windows fonts that ship with the site's dev machine.
"""

from __future__ import annotations

import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT_DIR = Path(r"C:\Windows\Fonts")
SANS = FONT_DIR / "msyh.ttc"
SANS_BOLD = FONT_DIR / "msyhbd.ttc"
SERIF = FONT_DIR / "pala.ttf"
SERIF_BOLD = FONT_DIR / "palab.ttf"

INK = (247, 237, 216)
GOLD = (212, 170, 86)
GOLD_LIGHT = (244, 214, 140)
MUTED = (185, 169, 140)
MARK = (68, 68, 68, 255)
PAPER = (247, 243, 234)


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size=size)


def gradient(w: int, h: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    t = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None, None]
    arr = (1.0 - t) * np.array(top, dtype=np.float32) + t * np.array(bottom, dtype=np.float32)
    arr = np.repeat(arr, w, axis=1)
    return Image.fromarray(arr.astype(np.uint8), "RGB").convert("RGBA")


def add_glow(
    img: Image.Image,
    cx: float,
    cy: float,
    rx: float,
    ry: float,
    color: tuple[int, int, int],
    strength: float,
) -> None:
    arr = np.asarray(img).astype(np.float32)
    h, w = arr.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    mask = (np.clip(1.0 - d, 0.0, 1.0) ** 2) * strength
    for channel in range(3):
        arr[..., channel] += color[channel] * mask
    arr[..., :3] = np.clip(arr[..., :3], 0, 255)
    img.paste(Image.fromarray(arr.astype(np.uint8), "RGBA"))


def add_vignette(img: Image.Image, strength: float = 0.38) -> None:
    arr = np.asarray(img).astype(np.float32)
    h, w = arr.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    dx = (xx - w / 2) / (w / 2)
    dy = (yy - h / 2) / (h / 2)
    d = np.clip(np.sqrt(dx * dx + dy * dy) / 1.35, 0.0, 1.0)
    arr[..., :3] *= (1.0 - strength * d * d)[..., None]
    img.paste(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA"))


def add_stars(img: Image.Image, count: int = 110, seed: int = 11) -> None:
    rng = random.Random(seed)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    w, h = img.size
    for _ in range(count):
        x = rng.uniform(0, w)
        y = rng.uniform(0, h * 0.58)
        r = rng.choice([0.8, 1.0, 1.2, 1.6, 2.0])
        a = rng.randint(35, 120)
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(255, 236, 196, a))
    img.alpha_composite(layer)


def text_width(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, spacing: float) -> float:
    if not text:
        return 0.0
    return sum(draw.textlength(ch, font=fnt) for ch in text) + spacing * (len(text) - 1)


def draw_spaced(
    draw: ImageDraw.ImageDraw,
    text: str,
    fnt: ImageFont.FreeTypeFont,
    fill: tuple[int, ...],
    cx: float,
    y: float,
    spacing: float = 0.0,
) -> None:
    width = text_width(draw, text, fnt, spacing)
    x = cx - width / 2
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill, anchor="lt")
        x += draw.textlength(ch, font=fnt) + spacing


def mark_layer(size: int, color: tuple[int, ...] = MARK) -> Image.Image:
    """Render the framed-Q reference mark on transparent pixels.

    The source artwork is a 64-unit pixel grid, so every edge lands on an
    integer coordinate at the sizes used by the site (16/32/48/64/192/512).
    """
    scale = 1 if size % 64 == 0 else 4
    canvas = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    u = size * scale / 64.0
    rects = (
        (8, 0, 56, 8),
        (8, 56, 56, 64),
        (0, 8, 8, 56),
        (56, 8, 64, 56),
        (16, 16, 48, 24),
        (16, 24, 24, 40),
        (40, 24, 48, 40),
        (16, 40, 48, 48),
        (40, 48, 56, 56),    )
    for x0, y0, x1, y1 in rects:
        draw.rectangle(
            (round(x0 * u), round(y0 * u), round(x1 * u) - 1, round(y1 * u) - 1),
            fill=color,
        )
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def write_logo_svg() -> None:
    """Vector copy of the same mark, used as the scalable favicon."""
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" shape-rendering="crispEdges">
  <title>趣站博物馆</title>
  <path fill="#444444" d="M8 0h48v8H8zM8 56h48v8H8zM0 8h8v48H0zM56 8h8v48h-8zM16 16h32v8H16zM16 24h8v16h-8zM40 24h8v16h-8zM16 40h32v8H16zM40 48h16v8H40z"/>
</svg>
"""
    (ROOT / "logo.svg").write_text(svg, encoding="utf-8")


def website_mock(draw: ImageDraw.ImageDraw, box: tuple[float, float, float, float], kind: str) -> None:
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    if kind == "cream":
        bg, chrome, text, accent, soft, card = (
            (244, 239, 228),
            (31, 29, 27),
            (48, 43, 37),
            (211, 104, 54),
            (225, 215, 198),
            (255, 252, 245),
        )
    elif kind == "blue":
        bg, chrome, text, accent, soft, card = (
            (11, 23, 41),
            (7, 14, 27),
            (220, 235, 250),
            (84, 184, 220),
            (24, 45, 67),
            (18, 34, 55),
        )
    else:
        bg, chrome, text, accent, soft, card = (
            (246, 243, 234),
            (27, 43, 37),
            (41, 55, 48),
            (69, 139, 103),
            (214, 224, 210),
            (255, 255, 250),
        )

    draw.rectangle(box, fill=bg)
    bar = max(9, int(h * 0.115))
    draw.rectangle((x0, y0, x1, y0 + bar), fill=chrome)
    dot_r = max(1.3, bar * 0.085)
    for i, dot in enumerate(((222, 96, 82), (224, 176, 74), (96, 175, 108))):
        cx = x0 + bar * 0.28 + i * bar * 0.28
        draw.ellipse((cx - dot_r, y0 + bar / 2 - dot_r, cx + dot_r, y0 + bar / 2 + dot_r), fill=dot)
    draw.rounded_rectangle(
        (x0 + w * 0.30, y0 + bar * 0.27, x1 - w * 0.06, y0 + bar * 0.73),
        radius=max(1, int(bar * 0.18)),
        fill=tuple(max(0, c - 8) for c in chrome),
    )

    pad = max(4, w * 0.055)
    head_y = y0 + bar + h * 0.075
    logo = max(5, h * 0.055)
    draw.rounded_rectangle((x0 + pad, head_y, x0 + pad + logo, head_y + logo), radius=max(1, int(logo * 0.2)), fill=accent)
    nav_x = x1 - pad
    for i in range(3):
        line_w = w * (0.09 if i == 0 else 0.07)
        draw.rounded_rectangle((nav_x - line_w, head_y + logo * 0.34, nav_x, head_y + logo * 0.34 + max(1.5, h * 0.012)), radius=2, fill=soft)
        nav_x -= line_w + w * 0.035

    hero_y = head_y + logo + h * 0.085
    hero_h = h * 0.40
    text_w = w * 0.52
    line_h = max(3.0, h * 0.033)
    for i, ratio in enumerate((0.92, 0.72, 0.55)):
        draw.rounded_rectangle(
            (x0 + pad, hero_y + i * line_h * 2.1, x0 + pad + text_w * ratio, hero_y + i * line_h * 2.1 + line_h),
            radius=max(1, int(line_h / 2)),
            fill=text,
        )
    small_h = max(1.8, h * 0.018)
    for i, ratio in enumerate((0.78, 0.62)):
        draw.rounded_rectangle(
            (x0 + pad, hero_y + line_h * 7.0 + i * small_h * 2.2, x0 + pad + w * 0.38 * ratio, hero_y + line_h * 7.0 + i * small_h * 2.2 + small_h),
            radius=1,
            fill=soft,
        )

    image_box = (x0 + w * 0.64, hero_y, x1 - pad, hero_y + hero_h)
    draw.rounded_rectangle(image_box, radius=max(2, int(w * 0.012)), fill=accent)
    ix0, iy0, ix1, iy1 = image_box
    draw.ellipse((ix0 + (ix1 - ix0) * 0.55, iy0 + (iy1 - iy0) * 0.12, ix0 + (ix1 - ix0) * 0.88, iy0 + (iy1 - iy0) * 0.45), fill=tuple(min(255, c + 45) for c in accent))
    draw.polygon(
        [(ix0, iy1), (ix0 + (ix1 - ix0) * 0.34, iy0 + (iy1 - iy0) * 0.48), (ix0 + (ix1 - ix0) * 0.62, iy1)],
        fill=tuple(max(0, c - 28) for c in accent),
    )

    cards_y = hero_y + hero_h + h * 0.08
    card_h = y1 - cards_y - h * 0.06
    if card_h > 4:
        gap = w * 0.03
        card_w = (w - pad * 2 - gap * 2) / 3
        for i in range(3):
            cx = x0 + pad + i * (card_w + gap)
            draw.rounded_rectangle((cx, cards_y, cx + card_w, cards_y + card_h), radius=max(1, int(card_w * 0.04)), fill=card)
            draw.rectangle((cx, cards_y, cx + card_w, cards_y + card_h * 0.52), fill=soft)
            draw.rounded_rectangle((cx + card_w * 0.08, cards_y + card_h * 0.64, cx + card_w * 0.88, cards_y + card_h * 0.64 + max(1.5, h * 0.012)), radius=1, fill=text)


def draw_frame(
    img: Image.Image,
    box: tuple[int, int, int, int],
    kind: str,
    border: int,
    plaque: str,
) -> None:
    x0, y0, x1, y1 = box
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((x0 + 6, y0 + 14, x1 + 6, y1 + 14), radius=4, fill=(0, 0, 0, 150))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(15)))

    draw = ImageDraw.Draw(img)
    draw.rectangle(box, fill=(61, 45, 21))
    draw.rectangle((x0 + 2, y0 + 2, x1 - 2, y1 - 2), outline=GOLD, width=3)
    draw.rectangle((x0 + border, y0 + border, x1 - border, y1 - border), fill=(17, 14, 11))
    draw.rectangle((x0 + border + 3, y0 + border + 3, x1 - border - 3, y1 - border - 3), outline=(128, 98, 46), width=1)
    inner = (x0 + border + 6, y0 + border + 6, x1 - border - 6, y1 - border - 6)
    website_mock(draw, inner, kind)

    glass = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glass)
    gd.polygon(
        [(x0 + border, y0 + border), (x0 + border + (x1 - x0) * 0.38, y0 + border), (x0 + border, y0 + border + (y1 - y0) * 0.55)],
        fill=(255, 255, 255, 10),
    )
    img.alpha_composite(glass)

    pw, ph = 66, 16
    px, py = (x0 + x1) / 2 - pw / 2, y1 + 12
    draw.rounded_rectangle((px, py, px + pw, py + ph), radius=2, fill=(28, 23, 14), outline=(128, 98, 46), width=1)
    fnt = font(SERIF, 9)
    tw = draw.textlength(plaque, font=fnt)
    draw.text((px + pw / 2 - tw / 2, py + 2), plaque, font=fnt, fill=GOLD_LIGHT)


def picture_light(img: Image.Image, cx: float, y: float, width: float) -> None:
    add_glow(img, cx, y - 2, width * 0.52, 26, (255, 216, 140), 0.30)
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((cx - width / 2, y - 10, cx + width / 2, y - 4), radius=3, fill=GOLD)
    draw.rectangle((cx - width / 2 + 8, y - 11, cx + width / 2 - 8, y - 10), fill=GOLD_LIGHT)


def make_og() -> None:
    w, h = 1200, 630
    img = gradient(w, h, (5, 9, 19), (10, 18, 34))
    add_glow(img, 600, 120, 620, 300, (255, 205, 130), 0.18)
    add_glow(img, 100, 540, 400, 260, (66, 98, 160), 0.12)
    add_vignette(img, 0.42)
    add_stars(img, 130)

    draw = ImageDraw.Draw(img)
    for x in (70, 1130):
        draw.line((x, 0, x, 370), fill=(255, 235, 190, 8), width=1)
    draw.line((0, 365, w, 365), fill=(255, 235, 190, 10), width=1)

    picture_light(img, 195, 132, 190)
    picture_light(img, 1005, 132, 190)
    picture_light(img, 600, 62, 300)

    draw_frame(img, (70, 146, 320, 326), "blue", 8, "027")
    draw_frame(img, (880, 146, 1130, 326), "green", 8, "112")
    draw_frame(img, (405, 76, 795, 344), "cream", 11, "001")

    # bottom wash for the title block
    wash = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wash)
    for y in range(330, h):
        t = (y - 330) / (h - 330)
        wd.line((0, y, w, y), fill=(4, 7, 14, int(225 * (t ** 0.75))))
    img.alpha_composite(wash)

    draw = ImageDraw.Draw(img)

    # top brand line: the reference Q sits on a small paper badge so the
    # graphite mark stays legible against the dark exhibition wall.
    badge = 44
    bx, by = 42, 26
    draw.rounded_rectangle(
        (bx, by, bx + badge, by + badge),
        radius=9,
        fill=PAPER,
        outline=(212, 170, 86, 120),
        width=1,
    )
    img.alpha_composite(mark_layer(30), (bx + 7, by + 7))
    draw = ImageDraw.Draw(img)
    label_font = font(SERIF_BOLD, 14)
    label = "SITOPIA MUSEUM"
    label_w = text_width(draw, label, label_font, 3)
    x = 98
    for ch in label:
        draw.text((x, 40), ch, font=label_font, fill=GOLD_LIGHT, anchor="lt")
        x += draw.textlength(ch, font=label_font) + 3
    credit_font = font(SANS, 13)
    credit = "有趣网址之家 出品"
    cw = draw.textlength(credit, font=credit_font)
    draw.text((w - 58 - cw, 42), credit, font=credit_font, fill=(185, 169, 140, 210), anchor="lt")

    # title with a warm halo
    title_font = font(SANS_BOLD, 78)
    title = "趣站博物馆"
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    draw_spaced(gd, title, title_font, (255, 196, 96, 150), 600, 386, 5)
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(18)))
    draw = ImageDraw.Draw(img)
    draw_spaced(draw, title, title_font, INK, 600, 386, 5)

    sub_font = font(SANS, 27)
    draw_spaced(draw, "可以走进去逛的 3D 网址博物馆", sub_font, (226, 208, 176), 600, 494, 1.5)

    small_font = font(SANS, 17)
    # 数量由清单决定，分享图里写死会过期，所以这里只写不会变的部分。
    draw_spaced(draw, "4 个展厅 · 免费在线玩", small_font, (166, 151, 125), 600, 552, 1)

    # a thin gold rule under the title block
    draw.line((470, 600, 730, 600), fill=(212, 170, 86, 90), width=1)

    img.convert("RGB").save(ROOT / "og-cover.jpg", "JPEG", quality=91, optimize=True, progressive=True)


def make_icon(size: int, out: Path, opaque: bool = False, padding: float = 0.05) -> None:
    if opaque:
        img = Image.new("RGBA", (size, size), PAPER + (255,))
        pad = round(size * 0.12)
    else:
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        pad = round(size * padding)
    img.alpha_composite(mark_layer(size - pad * 2), (pad, pad))
    if opaque:
        img = img.convert("RGB")
    img.save(out, "PNG", optimize=True)


def make_favicon() -> None:
    mark_layer(64).save(
        ROOT / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64)],
    )


def main() -> None:
    make_og()
    make_icon(512, ROOT / "icon-512.png")
    make_icon(192, ROOT / "icon-192.png")
    make_icon(180, ROOT / "apple-touch-icon.png", opaque=True, padding=0.12)
    make_favicon()
    write_logo_svg()
    print("wrote og-cover.jpg, icon-512.png, icon-192.png, apple-touch-icon.png, favicon.ico, logo.svg")


if __name__ == "__main__":
    main()
