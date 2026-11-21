#!/usr/bin/env python3
"""Builds freeduet.com: one static page per language, and the sitemap. Standard library only.

    python3 site/tools/build.py [SRC [INDEX]]

SRC    the source folder (default: site/src, next to this script).
INDEX  where the English page goes (default: site/index.html). The other pages go to
       <folder of INDEX>/<code>/index.html and the sitemap to <folder of INDEX>/sitemap.xml.

Every page is complete in its own language before any script runs: the text of `body.html` is filled in from
`lang/<code>.json`, and what `app.js` used to draw at run time (the team, the mascots, the big Iris faces and the weekday
letters) is written into the HTML here. `app.js` only adds behaviour.
The languages, their codes, `og:locale` values and weekday letters live in `site.json`; the build, `checklang.js`
and `checkpages.py` all read that one list.
"""
import html as H
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

HERE = Path(__file__).resolve().parent

GITHUB = "https://github.com/MarcoDeliaBot/freeduet"
GH_SYMBOL = '<symbol id="i-gh" viewBox="0 0 16 16"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></symbol>'

# Two strings of the head exist only in English, on purpose. The English page keeps them; the other pages use their own
# `desc` for og:description / twitter:description. The picture itself carries the English headline, so its alt text
# describes that English text on every page.
OG_DESC = "A free, open-source team of AI assistants. By default they ask before they send, pay, sign, book or delete."
OG_ALT = "FreeDuet logo with the words: Your own team of AI assistants"


# ---------------------------------------------------------------------------------------------------------------
# text helpers

def plain(x):
    """The text of an HTML string: tags removed, entities decoded, white space collapsed."""
    return re.sub(r"\s+", " ", H.unescape(re.sub(r"<[^>]+>", "", x))).strip()


def esc(s):
    """The same two replacements as `esc` in app.js, so pre-rendered markup equals what the script would draw."""
    return str(s).replace("&", "&amp;").replace("<", "&lt;")


def ld(o):
    return json.dumps(o, ensure_ascii=False, indent=1).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def js_json(o):
    return json.dumps(o, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


# -------------------------------------------------------------------------------------------------------------
# ---------------------------------------------------------------------------------------------------------------
# the parser: replaces the inside of every element that carries data-i (a string of lang/<code>.json) or data-f (a
# path into the same file, such as demo.0.card.1.0) with that language's text

class _Spans(HTMLParser):
    """Finds the inner span (start, end, key) of every element with the attribute `attr`. A real HTML tokenizer
    (quoted attributes may contain '>'), and the end of an element is found by counting same-name tags."""

    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}

    def __init__(self, text, attr):
        super().__init__(convert_charrefs=False)
        self.attr = attr
        self.starts = [0]
        for i, ch in enumerate(text):
            if ch == "\n":
                self.starts.append(i + 1)
        self.spans = []
        self.cur = None  # [tag, depth, inner start, key]
        self.feed(text)
        self.close()
        if self.cur:
            raise ValueError("%s element never closed: <%s %s=%r>" % (attr, self.cur[0], attr, self.cur[3]))

    def _here(self):
        line, col = self.getpos()
        return self.starts[line - 1] + col

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in self.VOID:
            if self.attr in a:
                raise ValueError("%s on a void element: <%s>" % (self.attr, tag))
            return
        if self.cur:
            if self.attr in a:
                raise ValueError("%s inside %s: %r in %r" % (self.attr, self.attr, a[self.attr], self.cur[3]))
            if tag == self.cur[0]:
                self.cur[1] += 1
            return
        if self.attr in a:
            self.cur = [tag, 1, self._here() + len(self.get_starttag_text()), a[self.attr]]

    def handle_startendtag(self, tag, attrs):
        if any(k == self.attr for k, _ in attrs):
            raise ValueError("%s on a self-closing element: <%s/>" % (self.attr, tag))

    def handle_endtag(self, tag):
        if self.cur and tag == self.cur[0]:
            self.cur[1] -= 1
            if self.cur[1] == 0:
                self.spans.append((self.cur[2], self._here(), self.cur[3]))
                self.cur = None


def localize(body, lookup, attr):
    """body.html with the inside of every element that carries `attr` replaced by lookup(key). A missing key is an
    error: a page must never ship with a string left in the wrong language."""
    out = body
    for start, end, key in sorted(_Spans(body, attr).spans, reverse=True):
        try:
            value = lookup(key)
        except (KeyError, IndexError, TypeError, ValueError):
            value = None
        if not isinstance(value, str):
            raise KeyError("no string %r for %s" % (key, attr))
        out = out[:start] + value + out[end:]
    return out


def get_path(root, path):
    """The value at a dotted path such as demo.1.card.0.1 (a number selects a list item)."""
    node = root
    for part in path.split("."):
        node = node[int(part)] if isinstance(node, list) else node[part]
    return node


# ---------------------------------------------------------------------------------------------------------------
# the mascot: one symbol per member (its art from mascot.json), the paints of the bubble, the headset and the faces

# The art is shared with the app, which draws the same faces (D55): one file, `openbot/shared/mascot.json`.
MASCOT_FILE = Path(__file__).resolve().parents[2] / "openbot" / "shared" / "mascot.json"
# The member drawings are the app's (approved for the app on 20 November 2026, PR #412 and #417): the site reads the
# same file, `openbot/app/src/freeduet/wide/mascot-drawn.json`, for its twelve `team` entries.
MASCOT_DRAWN_FILE = Path(__file__).resolve().parents[2] / "openbot" / "app" / "src" / "freeduet" / "wide" / "mascot-drawn.json"
MEMBER_IDS = ["iris", "leo", "otto", "portia", "penny", "jules", "wren", "gus", "basil", "vera", "mark", "video"]
FACE_IDS = ["idle", "listen", "think", "work", "ask", "done"]
MASCOT = re.compile(r'(<svg\b[^>]*\sdata-mascot="(\w+)"[^>]*>)</svg>')


def mascot_defs(M):
    """The sprite part of the mascot: the paints and the bubble, the headset, and one symbol per member (220 x 220)."""
    if sorted(M["team"]) != sorted(MEMBER_IDS):
        raise ValueError("mascot.json must hold exactly the twelve members")
    symbols = "".join('<symbol id="m-%s" viewBox="0 0 220 220">%s</symbol>' % (k, M["team"][k]) for k in MEMBER_IDS)
    return M["defs"] + '<g id="m-headset">' + M["headset"] + "</g>" + symbols


def big_faces(M):
    """The six faces of the big Iris, one group per state (app.js shows the one named by data-s)."""
    return "".join('<g class="bf bf-%s">%s</g>' % (k, M["faces"][k]) for k in FACE_IDS)


# ---------------------------------------------------------------------------------------------------------------
# the site: sources and per-language pieces

class Site:
    def __init__(self, src):
        src = Path(src)
        cfg = json.loads((src / "site.json").read_text(encoding="utf-8"))
        self.origin = cfg["origin"].rstrip("/")
        self.lastmod = cfg["lastmod"]
        self.default = cfg["default"]
        self.langs = cfg["languages"]
        self.codes = [l["code"] for l in self.langs]
        self.by_code = {l["code"]: l for l in self.langs}
        if self.default not in self.by_code:
            raise ValueError("default language %r is not in the list" % self.default)
        self.T = {c: json.loads((src / "lang" / (c + ".json")).read_text(encoding="utf-8")) for c in self.codes}
        self.members = json.loads((src / "members.json").read_text(encoding="utf-8"))
        self.mascot = json.loads(MASCOT_FILE.read_text(encoding="utf-8"))
        self.mascot["team"] = json.loads(MASCOT_DRAWN_FILE.read_text(encoding="utf-8"))["team"]
        body = (src / "body.html").read_text(encoding="utf-8")
        self.body, n = re.subn(r'<symbol id="i-gh".*?</symbol>', lambda _m: GH_SYMBOL, body, flags=re.S)
        if n != 1:
            raise ValueError("body.html must hold exactly one symbol#i-gh")
        if self.body.count("<!--mascot-defs-->") != 1:
            raise ValueError("body.html must hold exactly one <!--mascot-defs--> marker")
        self.body = self.body.replace("<!--mascot-defs-->", mascot_defs(self.mascot))
        self.css = (src / "style.css").read_text(encoding="utf-8")
        self.app = (src / "app.js").read_text(encoding="utf-8")

    def path(self, code):
        """The path a language page is served from. Cloudflare Pages serves folder/index.html at folder/ (with the
        slash), so that is the one canonical form."""
        return "/" if code == self.default else "/%s/" % code

    def url(self, code):
        return self.origin + self.path(code)

    def file(self, code):
        return "index.html" if code == self.default else "%s/index.html" % code


# ---------------------------------------------------------------------------------------------------------------
# what the page needs written in its own language and that a script would otherwise draw

def team_cards(S, t):
    out = []
    for i, m in enumerate(S.members):
        d = t["team"][m[0]]
        out.append('<article class="mem%s" style="--mc:%s"><svg class="mas" viewBox="0 0 220 220" aria-hidden="true" focusable="false">'
                   '<use href="#m-%s"/></svg><h3>%s<span>%s</span></h3><p>%s</p><q>%s</q></article>'
                   % (" boss" if i == 0 else "", m[2], m[0], m[1], esc(d[0]), esc(d[1]), esc(d[2])))
    return "".join(out)


def fill(body, open_tag, close_tag, inner):
    """Puts `inner` into an empty container of body.html. The container must exist exactly once, so a change to
    the structure of body.html stops the build instead of silently leaving a block empty."""
    marker = open_tag + close_tag
    if body.count(marker) != 1:
        raise ValueError("body.html must hold exactly one empty %s" % open_tag)
    return body.replace(marker, open_tag + inner + close_tag)


def language_nav(S, code):
    items = "".join('<li><a href="%s" hreflang="%s" lang="%s"%s>%s</a></li>'
                    % (S.path(l["code"]), l["code"], l["code"], ' aria-current="page"' if l["code"] == code else "", H.escape(l["name"]))
                    for l in S.langs)
    return "<details><summary>%s</summary><ul>%s</ul></details>" % (H.escape(S.by_code[code]["name"]), items)


def render_body(S, code):
    t = S.T[code]
    body = localize(S.body, lambda k: t[k], "data-i")
    body = localize(body, lambda k: get_path(t, k), "data-f")
    body = fill(body, '<div class="team" id="teamGrid">', "</div>", team_cards(S, t))
    body = fill(body, '<g class="bf-slot" data-faces>', "</g>", big_faces(S.mascot))
    body, n = MASCOT.subn(lambda m: m.group(1) + '<use href="#m-%s"/></svg>' % m.group(2), body)
    if n < 1:
        raise ValueError("body.html lost its data-mascot placeholders")
    body = fill(body, '<nav class="langs" id="langs" aria-label="Language">', "</nav>", language_nav(S, code))
    week = iter(S.by_code[code]["week"])
    wk_a = body.index('<div class="wk" id="wk">')
    wk_b = body.index("</div>", wk_a)
    wk, n = re.subn(r'<span class="d">[^<]*</span>', lambda _m: '<span class="d">%s</span>' % next(week), body[wk_a:wk_b])
    if n != 7:
        raise ValueError("the week strip must hold seven .d spans")
    return body[:wk_a] + wk + body[wk_b:]


def render_script(S, code):
    t = S.T[code]
    data = {"copy": t["copy"], "copied": t["copied"]}
    return ('(function(){\n"use strict";\nvar GH="%s";\nvar D=%s;\n' % (GITHUB, js_json(data))
            + S.app + "\n})();")



def render_head(S, code):
    t = S.T[code]
    lang = S.by_code[code]
    title = t["title"]
    desc = plain(t["desc"])
    og_desc = OG_DESC if code == S.default else desc
    url = S.url(code)
    image = S.origin + "/og-image.png"
    alternates = "".join('<link rel="alternate" hreflang="%s" href="%s">\n' % (c, S.url(c)) for c in S.codes)
    alternates += '<link rel="alternate" hreflang="x-default" href="%s">\n' % S.url(S.default)
    locales = "".join('<meta property="og:locale:alternate" content="%s">\n' % S.by_code[c]["locale"] for c in S.codes if c != code)
    app_ld = ld({"@context": "https://schema.org", "@type": "SoftwareApplication", "name": "FreeDuet", "description": desc,
                 "inLanguage": code, "applicationCategory": "BusinessApplication", "operatingSystem": "Windows, Linux",
                 "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}, "license": "https://opensource.org/license/mit",
                 "url": url, "codeRepository": GITHUB})
    faq_ld = ld({"@context": "https://schema.org", "@type": "FAQPage", "inLanguage": code,
                 "mainEntity": [{"@type": "Question", "name": plain(t["q%d" % i]),
                                 "acceptedAnswer": {"@type": "Answer", "text": plain(t["a%d" % i])}} for i in range(1, 9)]})
    return f'''<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{H.escape(title, quote=False)}</title>
<meta name="description" content="{H.escape(desc, quote=True)}">
<link rel="canonical" href="{url}">
{alternates}<meta name="theme-color" content="#0E1B33">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:title" content="{H.escape(title, quote=True)}">
<meta property="og:description" content="{H.escape(og_desc, quote=True)}">
<meta property="og:type" content="website">
<meta property="og:url" content="{url}">
<meta property="og:site_name" content="FreeDuet">
<meta property="og:locale" content="{lang["locale"]}">
{locales}<meta property="og:image" content="{image}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{H.escape(OG_ALT, quote=True)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{H.escape(title, quote=True)}">
<meta name="twitter:description" content="{H.escape(og_desc, quote=True)}">
<meta name="twitter:image" content="{image}">
<meta name="twitter:image:alt" content="{H.escape(OG_ALT, quote=True)}">
<script type="application/ld+json">
{app_ld}
</script>
<script type="application/ld+json">
{faq_ld}
</script>
<script>document.documentElement.className+=" js";setTimeout(function(){{if(document.documentElement.getAttribute("data-rv")!=="ready")document.documentElement.className+=" no-rv"}},3000)</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=Schibsted+Grotesk:wght@500;700;800&display=swap" rel="stylesheet">
<style>
{S.css}</style>'''


def render_page(S, code):
    return f'''<!DOCTYPE html>
<html lang="{code}">
<head>
{render_head(S, code)}
</head>
<body>
{render_body(S, code)}
<script>
{render_script(S, code)}
</script>
</body>
</html>
'''


def render_sitemap(S):
    alternates = "".join('    <xhtml:link rel="alternate" hreflang="%s" href="%s"/>\n' % (c, S.url(c)) for c in S.codes)
    alternates += '    <xhtml:link rel="alternate" hreflang="x-default" href="%s"/>\n' % S.url(S.default)
    urls = "".join("  <url>\n    <loc>%s</loc>\n    <lastmod>%s</lastmod>\n%s  </url>\n" % (S.url(c), S.lastmod, alternates) for c in S.codes)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + urls + "</urlset>\n")


def build_files(src):
    """Everything the build writes, as {path relative to the site folder: text}. The checker calls this too."""
    S = Site(src)
    files = {S.file(c): render_page(S, c) for c in S.codes}
    files["sitemap.xml"] = render_sitemap(S)
    return files


def main(argv):
    src = Path(argv[1]) if len(argv) > 1 else HERE.parent / "src"
    index = Path(argv[2]) if len(argv) > 2 else HERE.parent / "index.html"
    root = index.resolve().parent
    for rel, text in build_files(src).items():
        target = index if rel == "index.html" else root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        with open(target, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        print("%-16s %7d bytes" % (rel, len(text.encode("utf-8"))))


if __name__ == "__main__":
    main(sys.argv)
