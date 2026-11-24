#!/usr/bin/env python3
"""Renders the share image and the icons of freeduet.com from their sources. Needs Playwright (with Chromium) and Pillow.

    python3 site/app/scripts/render-brand.py [--fonts DIR]

  site/app/brand/og-image.html  ->  site/og-image.png          1200 x 630, English headline, kept under 300 KB
  site/favicon.svg              ->  site/favicon.ico           16, 32 and 48 px
                                    site/apple-touch-icon.png  180 px, opaque (iOS rounds the corners itself)

favicon.svg is the nav logo of the page (FreeDuetLogo in src/App.tsx): keep the two in step. The mascots in og-image.html
are the page's own SVGs (node site/app/scripts/iris-markup.mjs <id> <size>).
--fonts DIR: a folder that holds node_modules/@fontsource/{schibsted-grotesk,plus-jakarta-sans}; use it where Google Fonts
cannot be reached (npm i @fontsource/schibsted-grotesk @fontsource/plus-jakarta-sans in that folder).
"""
import io
import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
SITE = HERE.parent.parent
fonts = Path(sys.argv[sys.argv.index("--fonts") + 1]) if "--fonts" in sys.argv else None


def font_css():
    css = ""
    for fam, pkg, weights in (("Schibsted Grotesk", "schibsted-grotesk", (600, 700, 800)), ("Plus Jakarta Sans", "plus-jakarta-sans", (400, 500, 600, 700))):
        for w in weights:
            f = fonts / "node_modules" / "@fontsource" / pkg / "files" / ("%s-latin-%d-normal.woff2" % (pkg, w))
            css += "@font-face{font-family:'%s';font-weight:%d;src:url('%s') format('woff2')}\n" % (fam, w, f.as_uri())
    return css


def shot(pw_page, html_path, width, height):
    pw_page.set_viewport_size({"width": width, "height": height})
    if fonts:
        pw_page.route("**/fonts.googleapis.com/**", lambda r: r.fulfill(status=200, content_type="text/css", body=font_css()))
    pw_page.goto(html_path.as_uri())
    pw_page.wait_for_load_state("load")
    pw_page.evaluate("document.fonts.ready")
    pw_page.wait_for_timeout(400)
    return pw_page.screenshot(omit_background=True)


with sync_playwright() as p:
    b = p.chromium.launch(args=["--allow-file-access-from-files"] if fonts else [])
    page = b.new_page()
    og = shot(page, SITE / "app" / "brand" / "og-image.html", 1200, 630)
    img = Image.open(io.BytesIO(og)).convert("RGB")
    # a palette image keeps the soft gradients and is far smaller than a true-colour PNG
    q = img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
    q.save(SITE / "og-image.png", optimize=True)
    # icons: the logo on a page of its own
    svg = (SITE / "favicon.svg").read_text()
    tmp = HERE.parent / ".icon.html"
    tmp.write_text("<html><body style='margin:0;background:transparent'><div style='width:512px;height:512px'>%s</div><style>svg{width:512px;height:512px;display:block}</style></body></html>" % svg)
    icon = Image.open(io.BytesIO(shot(page, tmp, 512, 512))).convert("RGBA")
    icon.resize((256, 256), Image.LANCZOS).save(SITE / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    # apple-touch-icon: full-bleed blue, rings a little smaller so the rounded mask of iOS does not cut them
    flat = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40' fill='none'><rect width='40' height='40' fill='#1B4FD8'/><g transform='translate(20 20) scale(.86) translate(-20 -20)'><circle cx='15.5' cy='20' r='7.2' stroke='#FFFFFF' stroke-width='3'/><circle cx='24.5' cy='20' r='7.2' stroke='#7AE8EA' stroke-width='3'/></g></svg>"
    tmp.write_text("<html><body style='margin:0'><style>svg{width:180px;height:180px;display:block}</style>%s</body></html>" % flat)
    touch = Image.open(io.BytesIO(shot(page, tmp, 180, 180))).convert("RGB")
    touch.save(SITE / "apple-touch-icon.png", optimize=True)
    tmp.unlink()
    b.close()
for f in ("og-image.png", "favicon.ico", "apple-touch-icon.png"):
    print("%-22s %7d bytes" % (f, (SITE / f).stat().st_size))
