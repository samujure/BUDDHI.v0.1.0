"""
generate_assets.py
Generates all Chrome Web Store assets for InkTeX:
  extension/icons/icon16.png
  extension/icons/icon48.png
  extension/icons/icon128.png
  extension/store_assets/promo_tile_440x280.png
  extension/store_assets/screenshot_1280x800.png
  extension/store_assets/description.txt

Run:  py generate_assets.py
"""

import os, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

os.makedirs("extension/icons",        exist_ok=True)
os.makedirs("extension/store_assets", exist_ok=True)

# ── Brand colours ──────────────────────────────────────────────────────────────
BG      = (6,   12,  26)
BG2     = (11,  22,  40)
BG3     = (15,  31,  56)
ACCENT  = (233, 69,  96)
WHITE   = (255, 255, 255)
MUTED   = (162, 192, 224)
GLASS   = (18,  38,  68)

FONT_PATHS = [
    r"C:\Windows\Fonts\cambria.ttc",
    r"C:\Windows\Fonts\calibri.ttf",
    r"C:\Windows\Fonts\arial.ttf",
]
FONT_BOLD = [
    r"C:\Windows\Fonts\cambriab.ttf",
    r"C:\Windows\Fonts\calibrib.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
]

def font(size, bold=False):
    paths = FONT_BOLD if bold else FONT_PATHS
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()

def centred_text(draw, xy, text, fnt, fill):
    """Draw text centred on (cx, cy)."""
    cx, cy = xy
    bb = draw.textbbox((0, 0), text, font=fnt)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    draw.text((cx - tw // 2 - bb[0], cy - th // 2 - bb[1]), text, font=fnt, fill=fill)

def add_glow(img, cx, cy, radius, color, alpha=55):
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd   = ImageDraw.Draw(glow)
    gd.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=(*color, alpha))
    glow = glow.filter(ImageFilter.GaussianBlur(radius // 2))
    return Image.alpha_composite(img.convert("RGBA"), glow)

# ── Icons ──────────────────────────────────────────────────────────────────────
def make_icon(size):
    img  = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad = max(1, size // 20)
    r   = size // 4
    # Background rounded square
    draw.rounded_rectangle([pad, pad, size - pad - 1, size - pad - 1],
                            radius=r, fill=BG)
    # Soft accent glow bottom-right
    img  = add_glow(img, size, size, size // 2, ACCENT, alpha=50)
    draw = ImageDraw.Draw(img)

    if size >= 48:
        # Integral symbol
        fnt  = font(int(size * 0.62))
        centred_text(draw, (size // 2, size // 2 - size // 18), "∫", fnt, WHITE)
        # Accent dot
        dr = max(2, size // 18)
        dx = size // 2 + size // 6
        dy = size // 2 + size // 7
        draw.ellipse([dx - dr, dy - dr, dx + dr, dy + dr], fill=ACCENT)
    else:
        # 16 px: simple pen-stroke curve (too small for text)
        lw = max(1, size // 6)
        pts = [(size // 4, size * 3 // 4),
               (size // 3, size // 4),
               (size * 2 // 3, size * 3 // 4),
               (size * 3 // 4, size // 4)]
        draw.line(pts, fill=WHITE, width=lw, joint="curve")

    return img

for sz in [16, 48, 128]:
    p = f"extension/icons/icon{sz}.png"
    make_icon(sz).save(p)
    print(f"  {p}")

# ── Promotional tile 440 × 280 ─────────────────────────────────────────────────
def make_promo():
    W, H = 440, 280
    img  = Image.new("RGBA", (W, H), (*BG, 255))
    draw = ImageDraw.Draw(img)

    # Gradient rows
    for y in range(H):
        t = y / H
        c = tuple(int(BG[i] + (BG3[i] - BG[i]) * t) for i in range(3))
        draw.line([(0, y), (W, y)], fill=c)

    # Accent glow bursts
    img  = add_glow(img, -20, H + 20, 200, ACCENT, alpha=28)
    img  = add_glow(img, W + 40, -20, 180, (74, 120, 220), alpha=22)
    draw = ImageDraw.Draw(img)

    # Subtle grid
    for x in range(0, W, 36):
        draw.line([(x, 0), (x, H)], fill=(255, 255, 255, 6))
    for y in range(0, H, 36):
        draw.line([(0, y), (W, y)], fill=(255, 255, 255, 6))

    # Icon
    icon = make_icon(72).convert("RGBA")
    img  = img.convert("RGBA")
    img.paste(icon, (28, H // 2 - 36), icon)
    draw = ImageDraw.Draw(img)

    # Title
    centred_text(draw, (270, H // 2 - 32), "InkTeX", font(52, bold=True), WHITE)

    # Tagline
    centred_text(draw, (270, H // 2 + 22), "Draw Math. Get LaTeX + Answers.",
                 font(17), MUTED)

    # Bottom accent bar
    draw.rectangle([0, H - 4, W, H], fill=ACCENT)

    # Thin top border
    draw.rectangle([0, 0, W, 1], fill=(255, 255, 255, 30))

    p = "extension/store_assets/promo_tile_440x280.png"
    img.convert("RGB").save(p)
    print(f"  {p}")

make_promo()

# ── Screenshot mockup 1280 × 800 ──────────────────────────────────────────────
def make_screenshot():
    W, H = 1280, 800
    img  = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Background gradient
    for y in range(H):
        t = y / H
        c = tuple(int(BG[i] + (BG3[i] - BG[i]) * t) for i in range(3))
        draw.line([(0, y), (W, y)], fill=c)

    # ── Popup window ─────────────────────────────────────────────────────────
    PW, PH = 720, 530
    px = (W - PW) // 2
    py = (H - PH) // 2

    # Popup shadow
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd     = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([px - 8, py + 8, px + PW + 8, py + PH + 8],
                         radius=22, fill=(0, 0, 0, 100))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    img    = Image.alpha_composite(img.convert("RGBA"), shadow).convert("RGB")
    draw   = ImageDraw.Draw(img)

    # Popup background
    for y in range(PH):
        t = y / PH
        c = tuple(int(BG[i] + (BG2[i] - BG[i]) * t) for i in range(3))
        draw.line([(px, py + y), (px + PW, py + y)], fill=c)

    # ── Toolbar pill ─────────────────────────────────────────────────────────
    TY, TH = py + 12, 48
    draw.rounded_rectangle([px + 16, TY, px + PW - 16, TY + TH],
                           radius=24, fill=(*GLASS, 200) if True else GLASS)
    # toolbar border
    draw.rounded_rectangle([px + 16, TY, px + PW - 16, TY + TH],
                           radius=24, outline=(255, 255, 255, 22), width=1)
    # Buttons (circles)
    for i, col in enumerate([(255,255,255,30), (255,255,255,30),
                              (255,255,255,30), (255,255,255,30)]):
        bx = px + 36 + i * 42
        by = TY + TH // 2
        draw.ellipse([bx - 14, by - 14, bx + 14, by + 14], fill=col)
    # Solve button
    draw.rounded_rectangle([px + PW - 120, TY + 8, px + PW - 28, TY + TH - 8],
                           radius=20, fill=ACCENT)
    centred_text(draw, (px + PW - 74, TY + TH // 2),
                 "Solve", font(13, bold=True), WHITE)

    # ── Canvas (pure white) ───────────────────────────────────────────────────
    CY = TY + TH + 10
    CH = 260
    draw.rectangle([px, CY, px + PW, CY + CH], fill=WHITE)
    draw.line([(px, CY), (px + PW, CY)], fill=(200, 200, 210), width=1)
    draw.line([(px, CY + CH), (px + PW, CY + CH)], fill=(200, 200, 210), width=1)

    # Simulated handwritten equation on canvas
    eq_fnt = font(34)
    draw.text((px + 60, CY + CH // 2 - 26), "∫ sin(x) dx  =  ?",
              font=eq_fnt, fill=(30, 30, 30))

    # Fake ink strokes decorating the equation (brush strokes)
    stroke_color = (40, 40, 40)
    for pts in [
        [(px+56, CY+52), (px+60, CY+48), (px+64, CY+52), (px+60, CY+58), (px+56, CY+52)],
    ]:
        draw.line(pts, fill=stroke_color, width=3)

    # ── Output panel (glass card) ─────────────────────────────────────────────
    OY = CY + CH + 10
    OH = PH - (OY - py) - 12
    draw.rounded_rectangle([px + 16, OY, px + PW - 16, OY + OH],
                           radius=18, fill=(14, 28, 54))
    draw.rounded_rectangle([px + 16, OY, px + PW - 16, OY + OH],
                           radius=18, outline=(255, 255, 255, 18), width=1)

    # KaTeX-style equation
    centred_text(draw, (px + PW // 2, OY + OH // 2 - 22),
                 "-cos(x) + C", font(30), WHITE)
    # Answer row
    centred_text(draw, (px + PW // 2, OY + OH // 2 + 18),
                 "= symbolic", font(14), (*MUTED, 180))
    # Raw LaTeX
    raw_y = OY + OH - 32
    draw.rounded_rectangle([px + 28, raw_y - 4, px + PW - 28, raw_y + 18],
                           radius=6, fill=(8, 16, 36))
    draw.text((px + 36, raw_y), r"\int \sin(x) dx", font=font(12), fill=MUTED)

    # ── Popup border ──────────────────────────────────────────────────────────
    draw.rounded_rectangle([px, py, px + PW, py + PH], radius=18,
                           outline=(255, 255, 255, 20), width=1)

    # ── Label badge (top-right) ───────────────────────────────────────────────
    lx, ly = px + PW - 6, py - 8
    badge_w = 180
    draw.rounded_rectangle([lx - badge_w, ly, lx + 4, ly + 32],
                           radius=8, fill=ACCENT)
    centred_text(draw, (lx - badge_w // 2 + 2, ly + 16),
                 "InkTeX v0.1.0", font(13, bold=True), WHITE)

    p = "extension/store_assets/screenshot_1280x800.png"
    img.save(p)
    print(f"  {p}")

make_screenshot()

# ── Store description ──────────────────────────────────────────────────────────
DESCRIPTION = """\
InkTeX — Handwritten Math to LaTeX

Draw any math equation on the canvas using your mouse or stylus. InkTeX
instantly recognises each symbol using a trained neural network, converts
the expression to LaTeX, renders it beautifully, and computes a numerical
answer — all locally in your browser with no server or internet required.

FEATURES
• Draw equations freehand — digits, Greek letters, trig functions, integrals,
  fractions, exponents, and more (72 symbol classes)
• Instant LaTeX output rendered with KaTeX
• Numerical evaluation: 4+4 → 8, sin(π) → 0, (1/2)^2 → 0.25
• One-click Copy button for the raw LaTeX string
• Undo (Ctrl+Z), eraser, adjustable pen size
• Fully offline — CNN inference runs via ONNX Runtime WebAssembly
• Clean white drawing canvas optimised for symbol recognition

HOW TO USE
1. Click the InkTeX icon in your toolbar
2. Draw a mathematical expression on the white canvas
3. Click Solve
4. See the rendered LaTeX and computed answer
5. Hit Copy to paste the LaTeX into your document or editor

PRIVACY
No data ever leaves your browser. Inference runs entirely on-device via
WebAssembly. No accounts, no telemetry, no network requests.

SYMBOL SUPPORT
Numbers (0–9), basic operators (+, −, ×, /), parentheses, equals,
letters (a–z, A–Z subset), Greek (α β γ δ θ λ μ π φ σ Δ),
functions (sin cos tan log), calculus (∫ ∑ lim d), set notation,
arrows, and more.
"""

desc_path = "extension/store_assets/description.txt"
with open(desc_path, "w", encoding="utf-8") as f:
    f.write(DESCRIPTION)
print(f"  {desc_path}")

print("\nAll assets generated.")
