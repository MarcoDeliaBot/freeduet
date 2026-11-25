// Tests for site/tools/checklang.js: it must fail on a bad i18n file and pass on a right one. Node only, no packages.
//   node --test site/tools/tests/checklang.test.js
// Each test copies the real site folder (without node_modules) into a temporary directory, breaks one thing in the
// copy, runs checklang.js from the copy and reads its output and exit code. The real site is never changed.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const SITE = path.resolve(__dirname, '..', '..');          // .../site
const REPO = path.dirname(SITE);
// build.py reads these two files from the repository root, so the copy needs them at the same relative paths
const OUTSIDE_SITE = ['openbot/shared/mascot.json', 'openbot/app/src/freeduet/wide/mascot-drawn.json'];

function withCopy(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'checklang-'));
  try {
    const dest = path.join(root, 'site');
    fs.cpSync(SITE, dest, {
      recursive: true,
      filter: (src) => !/node_modules|__pycache__/.test(src) && !/[\\/]tests([\\/]|$)/.test(src),
    });
    for (const rel of OUTSIDE_SITE) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.copyFileSync(path.join(REPO, rel), path.join(root, rel));
    }
    return fn(dest);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runChecklang(siteCopy) {
  const r = cp.spawnSync(process.execPath, [path.join(siteCopy, 'tools', 'checklang.js')], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { PYTHONDONTWRITEBYTECODE: '1' }),
  });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const i18nPath = (siteCopy, code) => path.join(siteCopy, 'app', 'src', 'i18n', code + '.json');
const readDict = (siteCopy, code) => JSON.parse(fs.readFileSync(i18nPath(siteCopy, code), 'utf8'));
const writeDict = (siteCopy, code, obj) =>
  fs.writeFileSync(i18nPath(siteCopy, code), JSON.stringify(obj, null, 2) + '\n', 'utf8');

function assertFailsWith(result, text) {
  assert.equal(result.status, 1, 'checklang passed a bad file; output:\n' + result.out.slice(-2000));
  assert.ok(result.out.includes(text), 'expected output to contain ' + JSON.stringify(text) + '\n' + result.out.slice(-2000));
}

describe('checklang.js on the real site', () => {
  it('passes on an untouched copy, with every language at parity and checkpages at 0 failed', () => {
    withCopy((siteCopy) => {
      const r = runChecklang(siteCopy);
      assert.equal(r.status, 0, r.out.slice(-2000));
      assert.match(r.out, /checkpages: \d+ checks, 0 failed/);
      for (const code of ['it', 'es', 'fr', 'de', 'pt', 'pl', 'tr', 'ru', 'zh', 'ja', 'ko']) {
        assert.ok(
          r.out.includes(`app/src/i18n/${code}.json parity ok, translated (new design)`),
          `no parity line for ${code}:\n${r.out}`,
        );
      }
    });
  });
});

describe('checklang.js: translated i18n files', () => {
  it('fails when a key is missing', () => {
    withCopy((siteCopy) => {
      const d = readDict(siteCopy, 'de');
      delete d['hero.h1'];
      writeDict(siteCopy, 'de', d);
      assertFailsWith(runChecklang(siteCopy), 'missing keys: hero.h1');
    });
  });

  it('fails when a placeholder differs from English', () => {
    withCopy((siteCopy) => {
      const en = JSON.parse(fs.readFileSync(i18nPath(siteCopy, 'en'), 'utf8'));
      const key = Object.keys(en).find((k) => /\{\w+\}/.test(en[k]));
      assert.ok(key, 'English has no placeholder to test with');
      const d = readDict(siteCopy, 'de');
      d[key] = d[key].replace(/\{(\w+)\}/, '{wrong_name}');
      writeDict(siteCopy, 'de', d);
      assertFailsWith(runChecklang(siteCopy), 'placeholders differ from English: ' + key);
    });
  });

  it('fails when a value holds HTML', () => {
    withCopy((siteCopy) => {
      const d = readDict(siteCopy, 'de');
      d['hero.h1'] = '<span>' + d['hero.h1'] + '</span>';
      writeDict(siteCopy, 'de', d);
      assertFailsWith(runChecklang(siteCopy), 'HTML in a value: hero.h1');
    });
  });

  it('fails when the file is still English without the _untranslated marker', () => {
    withCopy((siteCopy) => {
      const en = readDict(siteCopy, 'en');
      writeDict(siteCopy, 'de', en);
      assertFailsWith(runChecklang(siteCopy), 'no _untranslated marker but');
    });
  });

  it('keeps an English-like file that carries the _untranslated marker as the old page, without a parity problem', () => {
    withCopy((siteCopy) => {
      const en = readDict(siteCopy, 'en');
      writeDict(siteCopy, 'de', Object.assign({ _untranslated: true }, en));
      const r = runChecklang(siteCopy);
      assert.ok(
        r.out.includes('app/src/i18n/de.json parity ok, untranslated (old page)'),
        'expected the marked file to be parity ok:\n' + r.out.slice(-2000),
      );
      const lines = r.out.split('\n');
      const i = lines.findIndex((l) => l.startsWith('app/src/i18n/de.json'));
      assert.ok(i >= 0 && !(lines[i + 1] || '').startsWith('  - '), 'the marked file should not list problems');
    });
  });
});
