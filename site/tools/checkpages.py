#!/usr/bin/env python3
"""Checks the built site: the language pages and the sitemap. Standard library only.

    python3 site/tools/checkpages.py [SITE_DIR]        (SITE_DIR defaults to site/)

`node site/tools/checklang.js` runs this after its own checks. Exit code 0 when everything holds, 1 otherwise;
every failure is printed on its own line as "[page] what is wrong".

What it checks
  - every page exists and equals a fresh build of site/src (so nothing is stale or hand-edited), except the pages of
    the languages in the new design (a language whose site/app/src/i18n/<code>.json has no "_untranslated" marker;
    today English: built from site/app by Vite and prerendered; see check_app_page for what is checked on it and
    check_assets for site/assets), and the site
    folder holds no language folder that is not in site/src/site.json
  - on each page: <html lang>, a self-referencing canonical, the full reciprocal hreflang set (identical on every
    page, plus x-default), exactly one H1, no skipped heading level, title = brand + the H1 words, meta description,
    Open Graph / Twitter text and og:locale, the language links, JSON-LD that parses and whose FAQ equals the
    visible FAQ
  - no string is left untranslated: every data-i and data-f element holds its language's string, and no English sentence of
    lang/en.json shows on a page of another language where that language has its own text
  - the team cards, the roster and the first demo state are in the HTML in the page's language
  - body.html holds no visible text outside a data-i or data-f element except the names and code listed below
  - sitemap.xml lists exactly the pages, with the same alternates as the pages and the lastmod of site.json
  - root-absolute links and assets resolve to files; no relative link would break in a sub-folder
  - app.js never redirects by navigator.language or by the stored language
  - og-image.png is a 1200 x 630 PNG under 300 KB
"""
import json
import re
import struct
import sys
import unicodedata
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build  # noqa: E402  (the same loader, parser and renderers as the build)

VOID = build._Spans.VOID
DATA_I = "data-i"   # the attribute that carries a language string
DATA_F = "data-f"   # the attribute whose text is a path into the same JSON (roles, status lines, demo cards)

# Text that body.html may hold outside a data-i element: names, product names and code read the same in every
# language. ENGLISH_ONLY is the short list of real English text that stays English on every page (reported in
# site/README.md); a new entry in either list must be a decision, so the check fails on anything else.
NEUTRAL_TEXT = {
    "FreeDuet", "GitHub", "Claude Code", "Iris", "Otto", "Portia", "Penny", "Jules", "Wren", "Vera", "Leo", "Mark", "Gus", "Basil", "Cam", "Rex",
    "Bash", "Bun", "Docker", "Windows + WSL2", "MarcoDeliaBot/freeduet.git", "git clone https://github.com/",
    "http://localhost:3010", "bash scripts/start.sh", "cd freeduet", "cp .env.example .env",
    "cd openbot && docker compose exec -it agent-freeduet claude",
    "git clone https://github.com/MarcoDeliaBot/freeduet.git cd freeduet cp .env.example .env bash scripts/start.sh",
}
ENGLISH_ONLY_TEXT = {
    "API key",
    "# sign in once with your own Claude plan:",
    "# then open http://localhost:3010",
}
ENGLISH_ONLY_ATTRS = {"Language", "Sections", "Links"}   # aria-label of the three nav landmarks
NEUTRAL_ATTRS = {"FreeDuet"}
# the members the hero window lists, in its order; the others are named in its "and ..." line
HERO_ROSTER = ["iris", "otto", "portia", "penny", "jules", "wren", "vera"]


# ---------------------------------------------------------------------------------------------------------------
# a small tolerant DOM

class Node:
    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.parent, self.kids = tag, dict(attrs), parent, []

    def cls(self):
        return self.attrs.get("class", "").split()

    def walk(self):
        yield self
        for k in self.kids:
            if isinstance(k, Node):
                yield from k.walk()

    def find(self, tag=None, cls=None, id=None):
        for n in self.walk():
            if tag and n.tag != tag:
                continue
            if cls and cls not in n.cls():
                continue
            if id and n.attrs.get("id") != id:
                continue
            return n
        return None

    def find_all(self, tag=None, cls=None):
        return [n for n in self.walk() if (not tag or n.tag == tag) and (not cls or cls in n.cls())]

    def text(self, skip=("script", "style")):
        out = []
        for k in self.kids:
            if isinstance(k, str):
                out.append(k)
            elif k.tag not in skip:
                out.append(k.text(skip))
        return "".join(out)

    def inner(self, src_of):
        return src_of(self)


class _Tree(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root", {}, None)
        self.cur = self.root
        self.feed(text)
        self.close()

    def handle_starttag(self, tag, attrs):
        n = Node(tag, [(k, v if v is not None else "") for k, v in attrs], self.cur)
        self.cur.kids.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.kids.append(Node(tag, [(k, v if v is not None else "") for k, v in attrs], self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.kids.append(data)


def parse(text):
    return _Tree(text).root


def words(s):
    return re.sub(r"\s+", " ", s).strip()


def squash(s):
    """Lower case, no punctuation, no white space: enough to compare a title with brand + headline."""
    s = unicodedata.normalize("NFKC", s).casefold()
    return "".join(ch for ch in s if not unicodedata.category(ch).startswith(("P", "Z", "C", "S")))


# ---------------------------------------------------------------------------------------------------------------

class Report:
    def __init__(self):
        self.failures = []
        self.count = 0

    def check(self, ok, where, what):
        self.count += 1
        if not ok:
            self.failures.append("[%s] %s" % (where, what))
        return ok


def headings(root):
    return [(int(n.tag[1]), words(n.text())) for n in root.walk() if re.fullmatch(r"h[1-6]", n.tag)]


def flat_strings(o, prefix=""):
    """Every string leaf of a language file, with its path."""
    if isinstance(o, str):
        yield prefix, o
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from flat_strings(v, "%s[%d]" % (prefix, i))
    elif isinstance(o, dict):
        for k, v in o.items():
            yield from flat_strings(v, "%s.%s" % (prefix, k) if prefix else k)


def get_path(o, path):
    for part in re.findall(r"[^.\[\]]+", path):
        o = o[int(part)] if isinstance(o, list) else o[part]
    return o


def check_source_text(S, R):
    """body.html: no visible text outside data-i except the listed names and code."""
    body = S.body
    for a, b, _k in sorted(build._Spans(body, DATA_I).spans + build._Spans(body, DATA_F).spans, reverse=True):
        body = body[:a] + body[b:]
    texts, attrs = [], []

    class C(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.stack = []

        def _attrs(self, tag, attrs_):
            for k, v in attrs_:
                if k in ("aria-label", "alt", "title", "placeholder") and v:
                    attrs.append((k, tag, v))

        def handle_starttag(self, tag, attrs_):
            if tag not in VOID:
                self.stack.append(tag)
            self._attrs(tag, attrs_)

        def handle_startendtag(self, tag, attrs_):
            self._attrs(tag, attrs_)

        def handle_endtag(self, tag):
            if tag in self.stack:
                while self.stack and self.stack.pop() != tag:
                    pass

        def handle_data(self, data):
            t = words(data)
            if len(t) > 1 and re.search(r"[^\W\d_]", t):
                texts.append((self.stack[-1] if self.stack else "", t))

    C().feed(body)
    allowed = NEUTRAL_TEXT | ENGLISH_ONLY_TEXT
    for tag, t in texts:
        R.check(t in allowed, "body.html", "text outside a data-i element would stay English on every page: %r (in <%s>)" % (t[:70], tag))
    for k, tag, v in attrs:
        R.check(v in ENGLISH_ONLY_ATTRS or v in NEUTRAL_ATTRS, "body.html",
                "%s=%r on <%s> is not translated: add it to the English-only list on purpose or give it a string" % (k, v, tag))


def expected_alternates(S):
    alt = {c: S.url(c) for c in S.codes}
    alt["x-default"] = S.url(S.default)
    return alt


def check_page(S, R, site_dir, code, html_text):
    where = S.file(code)
    t, en = S.T[code], S.T[S.default]
    root = parse(html_text)
    html = root.find("html")
    head = root.find("head")
    body = root.find("body")
    R.check(html is not None and html.attrs.get("lang") == code, where, "<html lang> is %r, expected %r" % (html and html.attrs.get("lang"), code))
    if head is None or body is None:
        R.check(False, where, "no <head> or <body>")
        return None
    url = S.url(code)

    # --- head: canonical, hreflang, title, description, social
    canon = [n.attrs.get("href") for n in head.find_all("link") if n.attrs.get("rel") == "canonical"]
    R.check(canon == [url], where, "canonical is %r, expected exactly [%r]" % (canon, url))
    alts = {}
    dup = False
    for n in head.find_all("link"):
        if n.attrs.get("rel") == "alternate" and "hreflang" in n.attrs:
            dup = dup or n.attrs["hreflang"] in alts
            alts[n.attrs["hreflang"]] = n.attrs.get("href")
    R.check(not dup, where, "the same hreflang appears twice")
    R.check(alts == expected_alternates(S), where, "hreflang set is not the full reciprocal set: %r" % alts)
    R.check(alts.get(code) == url, where, "hreflang %s does not point back to this page" % code)
    titles = head.find_all("title")
    R.check(len(titles) == 1, where, "%d <title> elements in the head" % len(titles))
    title = words(titles[0].text()) if titles else ""
    R.check(title == t["title"], where, "title %r differs from lang/%s.json title" % (title, code))
    h = headings(body)
    h1s = [x for x in h if x[0] == 1]
    R.check(len(h1s) == 1, where, "%d H1 elements, expected exactly 1" % len(h1s))
    h1 = h1s[0][1] if h1s else ""
    R.check(squash(title) == squash("FreeDuet" + h1), where, "title %r is not the brand + the H1 words %r" % (title, h1))
    prev = 0
    for lvl, txt in h:
        if lvl > prev + 1:
            R.check(False, where, "heading level skipped: H%d -> H%d at %r" % (prev, lvl, txt[:50]))
        prev = lvl
    R.check(bool(h) and h[0][0] == 1, where, "the first heading is not the H1")

    def meta(attr, name):
        v = [n.attrs.get("content") for n in head.find_all("meta") if n.attrs.get(attr) == name]
        return v

    desc = build.plain(t["desc"])
    R.check(meta("name", "description") == [desc], where, "meta description is not this language's desc")
    og_desc = build.OG_DESC if code == S.default else desc
    R.check(meta("property", "og:description") == [og_desc], where, "og:description is wrong")
    R.check(meta("name", "twitter:description") == [og_desc], where, "twitter:description is wrong")
    R.check(meta("property", "og:title") == [title] and meta("name", "twitter:title") == [title], where, "og:title / twitter:title differ from the title")
    R.check(meta("property", "og:url") == [url], where, "og:url is not the canonical URL")
    R.check(meta("property", "og:locale") == [S.by_code[code]["locale"]], where, "og:locale is wrong")
    R.check(sorted(meta("property", "og:locale:alternate")) == sorted(S.by_code[c]["locale"] for c in S.codes if c != code), where, "og:locale:alternate is wrong")
    R.check(meta("property", "og:image") == [S.origin + "/og-image.png"], where, "og:image is wrong")

    # --- JSON-LD
    blocks = [n for n in head.find_all("script") if n.attrs.get("type") == "application/ld+json"]
    parsed = []
    for n in blocks:
        try:
            parsed.append(json.loads(n.text(skip=())))
        except ValueError as e:
            R.check(False, where, "JSON-LD does not parse: %s" % e)
    kinds = {p.get("@type"): p for p in parsed}
    R.check(set(kinds) == {"SoftwareApplication", "FAQPage"} and len(parsed) == 2, where, "JSON-LD must hold exactly SoftwareApplication and FAQPage, found %r" % sorted(map(str, kinds)))
    sw, faq = kinds.get("SoftwareApplication", {}), kinds.get("FAQPage", {})
    R.check(sw.get("description") == desc and sw.get("inLanguage") == code and sw.get("url") == url, where, "SoftwareApplication does not match the page (description, inLanguage, url)")
    visible = []
    for d in body.find_all("details"):
        if "faq" in (d.parent.cls() if d.parent else []):
            s, p = d.find("summary"), d.find("p")
            visible.append((words(s.text()), words(p.text())))
    ld_faq = [(words(q.get("name", "")), words(q.get("acceptedAnswer", {}).get("text", ""))) for q in faq.get("mainEntity", [])]
    R.check(len(visible) == 8 and ld_faq == visible, where, "the FAQ in the JSON-LD is not the visible FAQ (%d visible, %d in JSON-LD)" % (len(visible), len(ld_faq)))
    R.check(faq.get("inLanguage") == code, where, "FAQPage inLanguage is not %s" % code)

    # --- untranslated strings: every data-i element holds exactly its language's string
    src = html_text
    spans = build._Spans(src, DATA_I).spans   # the built page keeps its data-i attributes
    for a, b, key in spans:
        R.check(src[a:b] == t.get(key), where, "data-i=%r holds %r, expected %r" % (key, src[a:b][:50], str(t.get(key))[:50]))
    R.check(len(spans) == len(build._Spans(S.body, DATA_I).spans), where, "%d data-i elements, body.html has %d" % (len(spans), len(build._Spans(S.body, DATA_I).spans)))
    fspans = build._Spans(src, DATA_F).spans
    for a, b, key in fspans:
        try:
            want = get_path(t, key)
        except (KeyError, IndexError, TypeError, ValueError):
            want = None
        R.check(isinstance(want, str) and src[a:b] == want, where, "data-f=%r holds %r, expected %r" % (key, src[a:b][:50], str(want)[:50]))
    R.check(len(fspans) == len(build._Spans(S.body, DATA_F).spans), where, "%d data-f elements, body.html has %d" % (len(fspans), len(build._Spans(S.body, DATA_F).spans)))

    # --- English text must not show where this language has its own
    text = words(body.text())
    if code != S.default:
        leaked = []
        for path, s in flat_strings(en):
            if path in ("title", "desc"):
                continue
            mine = get_path(t, path)
            if mine == s:
                continue
            p = words(build.plain(s))
            if len(p) >= 12 and p in text:
                leaked.append("%s: %r" % (path, p[:50]))
        R.check(not leaked, where, "English text on a %s page where %s has its own: %s" % (code, code, "; ".join(leaked[:4])))

    # --- what app.js used to draw at run time is in the HTML, in this language
    grid = body.find(id="teamGrid")
    cards = grid.find_all("article") if grid else []
    R.check(len(cards) == len(S.members), where, "team grid has %d cards, expected %d" % (len(cards), len(S.members)))
    for card, m in zip(cards, S.members):
        d = t["team"][m[0]]
        h3, ps, q = card.find("h3"), card.find("p"), card.find("q")
        R.check(h3 is not None and words(h3.text()) == words(m[1] + d[0]) and ps is not None and words(ps.text()) == words(d[1]) and q is not None and words(q.text()) == words(d[2]),
                where, "team card %s is not in this language" % m[0])
    R.check(len(body.find_all("article", cls="mem")) == len(S.members), where, "duplicated team cards")
    roster = body.find(id="roster")
    rows = roster.find_all("li") if roster else []
    R.check([n.attrs.get("id") for n in rows] == ["r-" + i for i in HERO_ROSTER], where, "hero roster rows are not %r, in order" % (HERO_ROSTER,))
    R.check(all(words(li.find("small").text()) == words(t["team"][i][0]) for li, i in zip(rows, HERO_ROSTER)), where, "roster roles are not in this language")
    status = roster.find(cls="st") if roster else None
    R.check(status is not None and words(status.text()) == words(t["lm"]["otto"]), where, "the roster status line is not in this language")
    chat = body.find(id="chat")
    first = t["demo"][0]
    chat_text = words(chat.text()) if chat else ""
    R.check(all(words(x) in chat_text for x in [first["me"], first["iris"], first["line"], first["ok"], first["stop"], t["ask"], t["yes"], t["no"]] + [c for row in first["card"] for c in row]), where, "the first demo state is not in this language")
    shown = [n for n in chat.walk() if n.attrs.get("id", "").endswith("-a")] if chat else []
    R.check(sorted(n.attrs["id"] for n in shown if "msg" in n.cls()) == ["h-a", "i-a", "u-a"] and [n.attrs["id"] for n in shown if "ask" in n.cls()] == ["c-a"], where, "the first demo state does not show its three messages and one card")
    wk = body.find(id="wk")
    week = [words(n.text()) for n in wk.find_all("span", cls="d")] if wk else []
    R.check(week == S.by_code[code]["week"], where, "week letters %r differ from site.json" % week)
    ids = [n.attrs["id"] for n in body.walk() if "id" in n.attrs]
    R.check(len(ids) == len(set(ids)), where, "duplicate id attributes: %s" % sorted({i for i in ids if ids.count(i) > 1})[:5])

    # --- the language links
    nav = body.find(id="langs")
    links = nav.find_all("a") if nav else []
    got = [(a.attrs.get("hreflang"), a.attrs.get("href"), words(a.text())) for a in links]
    want = [(l["code"], S.path(l["code"]), l["name"]) for l in S.langs]
    R.check(got == want, where, "language links are not the %d language pages: %r" % (len(want), got))
    cur = [a.attrs.get("hreflang") for a in links if a.attrs.get("aria-current")]
    R.check(cur == [code], where, "aria-current is on %r, expected only on %r" % (cur, code))
    summ = nav.find("summary") if nav else None
    R.check(summ is not None and words(summ.text()) == S.by_code[code]["name"], where, "the language control does not show this language")
    R.check(body.find("select") is None, where, "a <select> is left on the page")

    # --- links and assets must work from a sub-folder
    for n in root.walk():
        for attr in ("href", "src"):
            v = n.attrs.get(attr)
            if v is None or v.startswith(("https://", "http://", "#", "data:", "mailto:")):
                continue
            if not v.startswith("/"):
                R.check(False, where, "relative %s=%r would break in a sub-folder; use a root-absolute path" % (attr, v))
                continue
            path = site_dir / v.lstrip("/").split("#")[0].split("?")[0]
            if v.endswith("/"):
                path = path / "index.html"
            R.check(path.is_file(), where, "%s=%r does not resolve to a file in the site folder" % (attr, v))
    return {"alts": alts, "own": alts.get(code)}


def strip_marks(x):
    """The text without the inline marks of the new design's strings (**strong**, *emphasis*, ==accent==)."""
    return re.sub(r"\*([^*]+)\*", r"\1", re.sub(r"==([^=]+)==", r"\1", re.sub(r"\*\*([^*]+)\*\*", r"\1", x)))



def _visible_text(markup):
    """The page's text outside <script> and <style>, read with a real HTML parser (not a regexp)."""
    from html.parser import HTMLParser

    class _Text(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.skip = 0
            self.parts = []

        def handle_starttag(self, tag, attrs):
            if tag in ("script", "style"):
                self.skip += 1

        def handle_endtag(self, tag):
            if tag in ("script", "style") and self.skip:
                self.skip -= 1

        def handle_data(self, data):
            if not self.skip:
                self.parts.append(data)

    t = _Text()
    t.feed(markup)
    t.close()
    return "".join(t.parts)

def check_app_page(S, R, site_dir, code, html_text):
    """The page of a language in the new design (built from site/app, prerendered; see site/app/scripts/build.mjs).
    The markup is drawn from site/app/src/i18n/<code>.json, so the page must carry exactly that dictionary: this is how
    a stale page is found without running Vite. Returns the same dict as check_page."""
    import html as H
    where = S.file(code)
    url = S.url(code)
    head = html_text.split("<body", 1)[0]
    body = html_text[len(head):]
    dict_file = S.i18n_dir / (code + ".json")
    d = json.loads(dict_file.read_text(encoding="utf-8"))
    R.check(re.search(r'<html lang="%s"( dir="ltr")?>' % code, html_text) is not None, where, "<html lang> is not %r" % code)
    canon = re.findall(r'<link rel="canonical" href="([^"]*)"', head)
    R.check(canon == [url], where, "canonical is %r, expected exactly [%r]" % (canon, url))
    alts = dict(re.findall(r'<link rel="alternate" hreflang="([^"]*)" href="([^"]*)"', head))
    R.check(len(re.findall(r'<link rel="alternate" hreflang=', head)) == len(alts), where, "the same hreflang appears twice")
    R.check(alts == expected_alternates(S), where, "hreflang set is not the full reciprocal set: %r" % alts)
    R.check(len(re.findall(r"<title>", head)) == 1, where, "not exactly one <title>")
    title = re.search(r"<title>([^<]*)</title>", head)
    R.check(title is not None and H.unescape(title.group(1)) == strip_marks(d["meta.title"]), where, "the title is not meta.title of %s.json" % code)
    R.check(title is not None and title.group(1).startswith("FreeDuet"), where, "the title does not start with the brand")
    desc = re.search(r'<meta name="description" content="([^"]*)"', head)
    R.check(desc is not None and H.unescape(desc.group(1)) == strip_marks(d["meta.desc"]) and len(desc.group(1)) > 50, where, "the meta description is not meta.desc of %s.json" % code)
    for prop in ("og:title", "og:description", "og:image", "og:url", "og:image:alt", "twitter:image", "twitter:description", "twitter:image:alt"):
        R.check(re.search(r'<meta (?:property|name)="%s" content="[^"]+"' % prop, head) is not None, where, "no %s" % prop)
    og = re.search(r'<meta property="og:description" content="([^"]*)"', head)
    R.check(og is not None and H.unescape(og.group(1)) == strip_marks(d["meta.ogdesc"]), where, "og:description is not meta.ogdesc of %s.json" % code)
    R.check(('content="%s/og-image.png"' % S.origin) in head, where, "og:image is not %s/og-image.png" % S.origin)
    R.check(re.search(r'<meta property="og:url" content="%s"' % re.escape(url), head) is not None, where, "og:url is not %s" % url)
    R.check(re.search(r'<meta property="og:locale" content="%s"' % S.by_code[code]["locale"], head) is not None, where, "og:locale is not %s" % S.by_code[code]["locale"])
    for href in re.findall(r'<link rel="(?:icon|apple-touch-icon)"[^>]*href="(/[^"]*)"', head):
        R.check((site_dir / href.lstrip("/")).is_file(), where, "icon %r does not resolve to a file" % href)
    blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', head, flags=re.S)
    parsed = []
    for b in blocks:
        try:
            parsed.append(json.loads(b))
        except ValueError as e:
            R.check(False, where, "JSON-LD does not parse: %s" % e)
    kinds = {o.get("@type"): o for o in parsed}
    R.check(set(kinds) == {"SoftwareApplication", "FAQPage"} and len(parsed) == 2, where, "JSON-LD must hold exactly SoftwareApplication and FAQPage, found %r" % sorted(map(str, kinds)))
    for o in parsed:
        R.check(o.get("inLanguage") == code, where, "JSON-LD %s inLanguage is %r, expected %r" % (o.get("@type"), o.get("inLanguage"), code))
    faq = kinds.get("FAQPage", {}).get("mainEntity", [])
    want = []
    i = 1
    while ("faq.q%d" % i) in d:
        want.append((strip_marks(d["faq.q%d" % i]), strip_marks(d["faq.a%d" % i])))
        i += 1
    got = [(q.get("name"), q.get("acceptedAnswer", {}).get("text")) for q in faq]
    R.check(len(want) >= 1 and got == want, where, "the FAQPage is not the faq.q/faq.a keys of %s.json" % code)
    # the dictionary the browser hydrates with is the file, so a changed file with an old page is found here
    m = re.search(r'<script type="application/json" id="fd-i18n">(.*?)</script>', body, flags=re.S)
    emb = None
    try:
        emb = json.loads(m.group(1)) if m else None
    except ValueError:
        pass
    R.check(emb is not None and emb.get("lang") == code, where, "no script#fd-i18n for %r" % code)
    if emb:
        file_dict = {k: v for k, v in d.items() if k != "_untranslated"}
        R.check(emb.get("dict") == file_dict, where, "the embedded dictionary differs from %s.json: run npm run build in site/app" % code)
    R.check(not d.get("_untranslated"), where, "%s.json is marked _untranslated, so this page must be the old design" % code)
    # prerendered: one H1, with the words of hero.h1, headings never skip a level, and no no-script copy of the text
    h1s = re.findall(r"<h1\b[^>]*>(.*?)</h1>", body, flags=re.S)
    R.check(len(h1s) == 1, where, "expected exactly one H1, found %d" % len(h1s))
    if len(h1s) == 1:
        text = re.sub(r"<svg.*?</svg>", "", h1s[0], flags=re.S)
        text = H.unescape(re.sub(r"<[^>]+>", "", text)).strip()
        R.check(text == strip_marks(d["hero.h1"]), where, "the H1 %r is not hero.h1 of %s.json" % (text, code))
    levels = [int(x) for x in re.findall(r"<h([1-6])\b", body)]
    R.check(all(b - a <= 1 for a, b in zip(levels, levels[1:])), where, "a heading level is skipped: %r" % levels)
    R.check(len(re.findall(r"<h1\b", head)) == 0, where, "an H1 in the head")
    ns = re.findall(r"<noscript>(.*?)</noscript>", html_text, flags=re.S)
    R.check(all("<h1" not in x and "<p" not in x for x in ns), where, "a <noscript> text block: the text is prerendered, <noscript> holds only a style")
    # every FAQ answer must be in the page's own text (collapsed is fine): the FAQPage JSON-LD must match visible content
    visible = _visible_text(body)
    for n, (q, a) in enumerate(want, 1):
        R.check(re.sub(r"\s+", " ", a) in re.sub(r"\s+", " ", visible), where, "FAQ answer %d is not in the prerendered page text" % n)
        R.check(re.sub(r"\s+", " ", q) in re.sub(r"\s+", " ", visible), where, "FAQ question %d is not in the prerendered page text" % n)
    R.check(re.search(r'name="robots"', head) is None, where, "the built page must not carry the template's noindex")
    R.check(re.search(r"arena\.site|made with arena", html_text, flags=re.I) is None, where, "a trace of the design tool (Arena) is left in the page")
    R.check(len(html_text.encode("utf-8")) < 400 * 1024, where, "the page is %d KB, expected under 400 KB" % (len(html_text.encode("utf-8")) // 1024))
    # the shared assets
    css = re.findall(r'<link rel="stylesheet" href="(/assets/[^"]+)"', head)
    js = re.findall(r'<script type="module" src="(/assets/[^"]+)"', body)
    R.check(len(css) == 1 and len(js) == 1, where, "expected one /assets stylesheet and one module script, found %r %r" % (css, js))
    for v in css + js:
        R.check((site_dir / v.lstrip("/")).is_file(), where, "%r does not resolve to a file" % v)
    return {"alts": alts, "own": alts.get(code), "assets": (tuple(css), tuple(js))}


def check_assets(S, R, site_dir, pages):
    """site/assets holds exactly the one script and the one stylesheet that every new-design page names."""
    used = {a for c, p in pages.items() if p and "assets" in p for grp in p["assets"] for a in grp}
    groups = {p["assets"] for p in pages.values() if p and "assets" in p}
    R.check(len(groups) <= 1, "assets", "the new-design pages name different assets: %r" % sorted(map(str, groups)))
    folder = site_dir / "assets"
    have = {"/assets/" + f.name for f in folder.iterdir()} if folder.is_dir() else set()
    if used:
        R.check(have == used, "assets", "site/assets holds %r, the pages use %r" % (sorted(have), sorted(used)))


def check_sitemap(S, R, site_dir, pages):
    path = site_dir / "sitemap.xml"
    if not R.check(path.is_file(), "sitemap.xml", "missing"):
        return
    try:
        tree = ET.parse(path)
    except ET.ParseError as e:
        R.check(False, "sitemap.xml", "does not parse: %s" % e)
        return
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9", "x": "http://www.w3.org/1999/xhtml"}
    entries = {}
    for u in tree.getroot().findall("s:url", ns):
        loc = (u.findtext("s:loc", default="", namespaces=ns) or "").strip()
        entries[loc] = {"lastmod": (u.findtext("s:lastmod", default="", namespaces=ns) or "").strip(),
                        "alts": {a.get("hreflang"): a.get("href") for a in u.findall("x:link", ns) if a.get("rel") == "alternate"}}
    R.check(sorted(entries) == sorted(S.url(c) for c in S.codes), "sitemap.xml", "lists %r, expected the %d language URLs" % (sorted(entries), len(S.codes)))
    for c in S.codes:
        e = entries.get(S.url(c))
        if not e:
            continue
        R.check(e["lastmod"] == S.lastmod, "sitemap.xml", "%s lastmod %r, expected %r" % (S.url(c), e["lastmod"], S.lastmod))
        R.check(e["alts"] == expected_alternates(S), "sitemap.xml", "%s alternates are not the full set" % S.url(c))
        if c in pages and pages[c]:
            R.check(e["alts"] == pages[c]["alts"], "sitemap.xml", "%s: the sitemap and the page disagree on the alternates" % S.url(c))
    robots = site_dir / "robots.txt"
    R.check(robots.is_file() and ("Sitemap: %s/sitemap.xml" % S.origin) in robots.read_text(), "robots.txt", "does not name the sitemap")


def check_app(S, R):
    code = re.sub(r"/\*.*?\*/", "", S.app, flags=re.S)
    for pat, why in [(r"navigator\.languages?\b", "navigator.language"), (r"location\.(replace|assign)\s*\(", "location.replace/assign"),
                     (r"(window\.|document\.)?location(\.href)?\s*=[^=]", "an assignment to location"), (r"\bT\[", "a table of every language")]:
        R.check(not re.search(pat, code), "app.js", "uses %s: language pages must never redirect, and the page must not carry other languages" % why)


def check_og_image(site_dir, R):
    p = site_dir / "og-image.png"
    if not R.check(p.is_file(), "og-image.png", "missing"):
        return
    data = p.read_bytes()
    ok = data[:8] == b"\x89PNG\r\n\x1a\n"
    w, h = struct.unpack(">II", data[16:24]) if ok else (0, 0)
    R.check(ok and (w, h) == (1200, 630), "og-image.png", "is %dx%d, expected a 1200x630 PNG" % (w, h))
    R.check(len(data) < 300 * 1024, "og-image.png", "is %d bytes, expected under 300 KB" % len(data))


def main(argv):
    site_dir = Path(argv[1]).resolve() if len(argv) > 1 else HERE.parent
    src = site_dir / "src"
    R = Report()
    S = build.Site(src)
    fresh = build.build_files(src)
    for rel, text in fresh.items():
        p = site_dir / rel
        if not R.check(p.is_file(), rel, "missing: run python3 site/tools/build.py"):
            continue
        R.check(p.read_text(encoding="utf-8") == text, rel, "is not equal to a fresh build: run python3 site/tools/build.py")
    for d in sorted(site_dir.iterdir()):
        if d.is_dir() and (d / "index.html").is_file() and d.name not in S.codes and d.name not in ("src", "tools", "video", "app", "assets"):
            R.check(False, d.name + "/index.html", "is a page for a language that is not in site/src/site.json")
    pages = {}
    for c in S.codes:
        p = site_dir / S.file(c)
        check = check_app_page if c in S.hand_built else check_page
        pages[c] = check(S, R, site_dir, c, p.read_text(encoding="utf-8")) if p.is_file() else None
    ref = None
    for c in S.codes:
        if pages[c]:
            ref = ref or pages[c]["alts"]
            R.check(pages[c]["alts"] == ref, S.file(c), "its hreflang set differs from the other pages")
    check_source_text(S, R)
    check_sitemap(S, R, site_dir, pages)
    check_assets(S, R, site_dir, pages)
    check_app(S, R)
    check_og_image(site_dir, R)
    for line in R.failures:
        print("FAIL", line)
    print("checkpages: %d checks, %d failed" % (R.count, len(R.failures)))
    return 1 if R.failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
