#!/usr/bin/env python3
"""Builds freeduet.com: one static page per language, and the sitemap. Standard library only.

    python3 site/tools/build.py [SRC [INDEX]]

SRC    the source folder (default: site/src, next to this script).
INDEX  where the English page goes (default: site/index.html). The other pages go to
       <folder of INDEX>/<code>/index.html and the sitemap to <folder of INDEX>/sitemap.xml.

Every page is complete in its own language before any script runs: the text of `body.html` is filled in from
`lang/<code>.json`, and what `app.js` used to draw at run time (the team, the side list, the chips, the first
state of the demo, the weekday letters) is written into the HTML here. `app.js` only adds behaviour.
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


# ---------------------------------------------------------------------------------------------------------------
# the data-i parser: replaces the inside of every element that carries data-i="key" with that language's string

class _Spans(HTMLParser):
    """Finds the inner span (start, end, key) of every element with a data-i attribute. A real HTML tokenizer
    (quoted attributes may contain '>'), and the end of an element is found by counting same-name tags."""

    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}

    def __init__(self, text):
        super().__init__(convert_charrefs=False)
        self.starts = [0]
        for i, ch in enumerate(text):
            if ch == "\n":
                self.starts.append(i + 1)
        self.spans = []
        self.cur = None  # [tag, depth, inner start, key]
        self.feed(text)
        self.close()
        if self.cur:
            raise ValueError("data-i element never closed: <%s data-i=%r>" % (self.cur[0], self.cur[3]))

    def _here(self):
        line, col = self.getpos()
        return self.starts[line - 1] + col

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in self.VOID:
            if "data-i" in a:
                raise ValueError("data-i on a void element: <%s>" % tag)
            return
        if self.cur:
            if "data-i" in a:
                raise ValueError("data-i inside data-i: %r in %r" % (a["data-i"], self.cur[3]))
            if tag == self.cur[0]:
                self.cur[1] += 1
            return
        if "data-i" in a:
            self.cur = [tag, 1, self._here() + len(self.get_starttag_text()), a["data-i"]]

    def handle_startendtag(self, tag, attrs):
        if any(k == "data-i" for k, _ in attrs):
            raise ValueError("data-i on a self-closing element: <%s/>" % tag)

    def handle_endtag(self, tag):
        if self.cur and tag == self.cur[0]:
            self.cur[1] -= 1
            if self.cur[1] == 0:
                self.spans.append((self.cur[2], self._here(), self.cur[3]))
                self.cur = None


def localize(body, strings):
    """body.html with the inside of every data-i element replaced by strings[key]. A missing key is an error:
    a page must never ship with a string left in the wrong language."""
    spans = _Spans(body).spans
    out = body
    for start, end, key in sorted(spans, reverse=True):
        if key not in strings or not isinstance(strings[key], str):
            raise KeyError("no string %r for data-i" % key)
        out = out[:start] + strings[key] + out[end:]
    return out


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
        self.member = {m[0]: m for m in self.members}
        body = (src / "body.html").read_text(encoding="utf-8")
        self.body, n = re.subn(r'<symbol id="i-gh".*?</symbol>', lambda _m: GH_SYMBOL, body, flags=re.S)
        if n != 1:
            raise ValueError("body.html must hold exactly one symbol#i-gh")
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
# what app.js used to draw at run time, now written into the page (same markup, same order as the script's builders)

def av(m):
    solid = m[0] == "iris"
    return ('<svg class="av" viewBox="0 0 44 44" aria-hidden="true"><rect width="44" height="44" rx="11" fill="%s"%s/>'
            '<svg x="10" y="10" width="24" height="24" viewBox="0 0 24 24"><path d="%s" stroke="%s" stroke-width="1.9" fill="none" '
            'stroke-linecap="round" stroke-linejoin="round"/></svg></svg>') % (m[2], "" if solid else ' fill-opacity=".13"', m[4], "#fff" if solid else m[2])


def team_cards(S, t):
    out = []
    for i, m in enumerate(S.members):
        d = t["team"][m[0]]
        out.append('<article class="mem%s rv" style="--mc:%s">%s<h3>%s<span>%s</span></h3><p>%s</p><q>%s</q></article>'
                   % (" boss" if i == 0 else "", m[2], av(m), m[1], esc(d[0]), esc(d[1]), esc(d[2])))
    return "".join(out)


def side_list(S, t, wait):
    out = []
    for m in S.members:
        d = t["team"][m[0]]
        lm = (t.get("lm") or {}).get(m[0], "")
        cls = "sm" + (" on" if m[0] == "iris" else "") + (" wait" if m[0] == wait else "")
        out.append('<li class="%s" data-m="%s"><span class="avw">%s<i class="sdot"></i></span><div><b>%s<span>%s</span></b><small>%s</small></div></li>'
                   % (cls, m[0], av(m), m[1], esc(d[0]), esc(lm)))
    return "".join(out)


def bubble(S, mid, name, text):
    return '<div class="msg">%s<div class="bub"><span class="who">%s</span>%s</div></div>' % (av(S.member[mid]), name, esc(text))


def demo_state(S, t, i):
    """The chat in state i of the demo: what show(i, false) in app.js draws."""
    s = t["demo"][i]
    p = ['<div class="msg me"><div class="bub">%s</div></div>' % esc(s["me"]),
         bubble(S, "iris", "Iris", s["iris"]),
         bubble(S, s["who"], S.member[s["who"]][1], s["line"])]
    if s.get("card"):
        rows = "".join("<dt>%s</dt><dd>%s</dd>" % (esc(r[0]), esc(r[1])) for r in s["card"])
        p.append('<div class="card-ask" id="ask"><p class="ask-title"><svg aria-hidden="true"><use href="#i-hand"/></svg>%s</p><dl>%s</dl>'
                 '<div class="row"><button type="button" class="yes" data-a="ok">%s</button><button type="button" class="no" data-a="stop">%s</button></div></div>'
                 % (esc(t["ask"]), rows, esc(t["yes"]), esc(t["no"])))
    else:
        p.append('<div class="done stop"><svg aria-hidden="true"><use href="#i-hand"/></svg><span>%s</span></div>' % esc(t["nothing"]))
    return "".join(p)


def chips(t):
    return "".join('<button type="button" data-s="%d" aria-pressed="%s">%s</button>' % (i, "true" if i == 0 else "false", esc(s["chip"]))
                   for i, s in enumerate(t["demo"]))


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
    body = localize(S.body, t)
    first = t["demo"][0]
    wait = first["who"] if first.get("card") else ""
    body = fill(body, '<div class="team" id="teamGrid">', "</div>", team_cards(S, t))
    body = fill(body, '<ul id="side">', "</ul>", side_list(S, t, wait))
    body = fill(body, '<div class="aw-head" id="awHead" aria-hidden="true">', "</div>",
                av(S.member["iris"]) + "<div><b>Iris</b><small>%s</small></div>" % esc(t["team"]["iris"][0]))
    body = fill(body, '<div class="chat" id="chat" aria-live="polite">', "</div>", demo_state(S, t, 0))
    body = fill(body, '<div id="tries">', "</div>", chips(t))
    body = fill(body, '<nav class="langs" id="langs" aria-label="Language">', "</nav>", language_nav(S, code))
    body, n = re.subn(r'<span data-av="(\w+)"></span>', lambda m: '<span data-av="%s">%s</span>' % (m.group(1), av(S.member[m.group(1)])), body)
    if n < 1:
        raise ValueError("body.html lost its data-av placeholders")
    week = iter(S.by_code[code]["week"])
    wk_a = body.index('<div class="wk" id="wk">')
    wk_b = body.index("</div>", wk_a)
    wk, n = re.subn(r'<span class="d">[^<]*</span>', lambda _m: '<span class="d">%s</span>' % next(week), body[wk_a:wk_b])
    if n != 7:
        raise ValueError("the week strip must hold seven .d spans")
    return body[:wk_a] + wk + body[wk_b:]


def render_script(S, code):
    t = S.T[code]
    data = {"demo": t["demo"], "ask": t["ask"], "yes": t["yes"], "no": t["no"], "nothing": t["nothing"], "copy": t["copy"], "copied": t["copied"]}
    return ('(function(){\n"use strict";\nvar GH="%s";\nvar M=%s;\nvar D=%s;\n' % (GITHUB, js_json(S.members), js_json(data))
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
