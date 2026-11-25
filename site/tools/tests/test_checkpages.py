#!/usr/bin/env python3
"""Tests for site/tools/checkpages.py: it must fail on bad pages and pass on the right ones. Standard library only.

    python3 -m unittest discover -s site/tools/tests -p 'test_*.py'

Each test copies the real site folder (without node_modules) into a temporary directory, breaks one thing in the
copy, runs checkpages.py on the copy and reads its exit code and its FAIL lines. The real site is never changed.
The first test runs the untouched copy and must pass, so a failing test below means the checker missed its case.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True

SITE = Path(__file__).resolve().parents[2]          # .../site
CHECKER = SITE / "tools" / "checkpages.py"
EN_DICT = SITE / "app" / "src" / "i18n" / "en.json"


REPO = SITE.parent
# build.py reads these two files from the repository root (parents[2] of its own path), so the copy needs them too
OUTSIDE_SITE = ["openbot/shared/mascot.json", "openbot/app/src/freeduet/wide/mascot-drawn.json"]


def copy_site(dest_root):
    """A copy of the site folder under dest_root/site, with the two files build.py reads from the repository root,
    so checkpages.py reads the same relative layout."""
    root = Path(dest_root)
    dest = root / "site"
    shutil.copytree(SITE, dest, ignore=shutil.ignore_patterns("node_modules", "__pycache__", "tests"))
    for rel in OUTSIDE_SITE:
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(REPO / rel, root / rel)
    return dest


def run_checker(site_copy):
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    r = subprocess.run([sys.executable, str(site_copy / "tools" / "checkpages.py"), str(site_copy)],
                       capture_output=True, text=True, env=env)
    return r.returncode, r.stdout + r.stderr


def read(p):
    return p.read_text(encoding="utf-8")


def write(p, text):
    p.write_text(text, encoding="utf-8")


def first_faq_answer():
    """The English text of the first FAQ answer, as the dictionary holds it."""
    return json.loads(read(EN_DICT))["faq.a1"]


class CheckPagesTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.site = copy_site(self._tmp.name)

    def mutate_and_run(self, rel_page, mutate):
        """Apply mutate(html) to the page at rel_page in the copy, run the checker, return (exit code, output)."""
        page = self.site / rel_page
        write(page, mutate(read(page)))
        return run_checker(self.site)

    def assertFails(self, code, out, message):
        self.assertEqual(code, 1, "checker passed a bad page; output:\n" + out[-2000:])
        self.assertIn("FAIL", out)
        self.assertIn(message, out)

    # --- the correct case

    def test_untouched_copy_passes(self):
        code, out = run_checker(self.site)
        self.assertEqual(code, 0, out[-2000:])
        self.assertIn("0 failed", out)

    # --- FAQ answers: the visible text must hold every answer (the FAQPage JSON-LD must match what a reader sees)

    def test_faq_answer_missing_from_visible_text_fails(self):
        answer = first_faq_answer()

        def empty_first_answer(html):
            new, n = re.subn(r'(<div class="faq-panel"[^>]*>)<p>.*?</p>', r"\1<p></p>", html, count=1, flags=re.S)
            self.assertEqual(n, 1, "the first FAQ panel was not found in the built page")
            return new

        code, out = self.mutate_and_run("index.html", empty_first_answer)
        self.assertFails(code, out, "FAQ answer 1 is not in the prerendered page text")
        self.assertNotIn(answer[:30], out)  # the JSON-LD still holds the answer; only the visible text is gone

    def test_faq_answer_only_inside_script_fails(self):
        answer = first_faq_answer()

        def answer_in_script(html):
            new, n = re.subn(r'(<div class="faq-panel"[^>]*>)<p>.*?</p>',
                             lambda m: m.group(1) + "<p></p><script>" + answer + "</script>", html, count=1, flags=re.S)
            self.assertEqual(n, 1)
            return new

        code, out = self.mutate_and_run("index.html", answer_in_script)
        self.assertFails(code, out, "FAQ answer 1 is not in the prerendered page text")

    def test_faq_answer_only_inside_uppercase_SCRIPT_fails(self):
        answer = first_faq_answer()

        def answer_in_upper_script(html):
            new, n = re.subn(r'(<div class="faq-panel"[^>]*>)<p>.*?</p>',
                             lambda m: m.group(1) + "<p></p><SCRIPT>" + answer + "</SCRIPT>", html, count=1, flags=re.S)
            self.assertEqual(n, 1)
            return new

        code, out = self.mutate_and_run("index.html", answer_in_upper_script)
        self.assertFails(code, out, "FAQ answer 1 is not in the prerendered page text")

    # --- hreflang: every page names all twelve languages and x-default, and the set is the same everywhere

    def test_missing_hreflang_fails(self):
        def drop_italian(html):
            new, n = re.subn(r'<link rel="alternate" hreflang="it"[^>]*>', "", html, count=1)
            self.assertEqual(n, 1, "the it alternate was not found in the English page head")
            return new

        code, out = self.mutate_and_run("index.html", drop_italian)
        self.assertFails(code, out, "hreflang set is not the full reciprocal set")

    def test_missing_hreflang_on_a_language_page_fails(self):
        def drop_english(html):
            new, n = re.subn(r'<link rel="alternate" hreflang="en"[^>]*>', "", html, count=1)
            self.assertEqual(n, 1)
            return new

        code, out = self.mutate_and_run("it/index.html", drop_english)
        self.assertFails(code, out, "hreflang set is not the full reciprocal set")

    # --- stale embedded dictionary: script#fd-i18n must equal the language file the page was built from

    def _stale_dict(self, rel_page, lang_file):
        def change_one_value(html):
            m = re.search(r'(<script type="application/json" id="fd-i18n">)(.*?)(</script>)', html, flags=re.S)
            self.assertIsNotNone(m, "no script#fd-i18n in " + rel_page)
            data = json.loads(m.group(2))
            self.assertIn("hero.h1", data["dict"])
            data["dict"]["hero.h1"] = data["dict"]["hero.h1"] + " (old)"
            body = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
            return html[:m.start(2)] + body + html[m.end(2):]

        return self.mutate_and_run(rel_page, change_one_value)

    def test_stale_embedded_dictionary_fails_on_english_page(self):
        code, out = self._stale_dict("index.html", "en.json")
        self.assertFails(code, out, "the embedded dictionary differs from en.json")

    def test_stale_embedded_dictionary_fails_on_german_page(self):
        code, out = self._stale_dict("de/index.html", "de.json")
        self.assertFails(code, out, "the embedded dictionary differs from de.json")

    def test_stale_embedded_dictionary_is_caught_after_the_file_changes(self):
        """The realistic case: the language file is edited and the page is not rebuilt."""
        lang = self.site / "app" / "src" / "i18n" / "de.json"
        data = json.loads(read(lang))
        data["hero.h1"] = data["hero.h1"] + " (neu)"
        write(lang, json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        code, out = run_checker(self.site)
        self.assertFails(code, out, "the embedded dictionary differs from de.json")


if __name__ == "__main__":
    unittest.main()
