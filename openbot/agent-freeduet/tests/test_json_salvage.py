"""salvage (freeduet/json_salvage.py): the repairs, the refusals, the bounds and their properties.

Each row of CASES gives the input and either the value with the notes it must carry, or the refusal
reason. The hostile inputs must come back within TIME_BOUND_SECONDS. No test reads a file or a login.
"""

import ast
import json
import random
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import pytest

from freeduet import json_salvage
from freeduet.json_salvage import (
    MAX_DEPTH,
    MAX_INPUT_CHARS,
    MAX_NUMBER_CHARS,
    REASONS,
    Refusal,
    SalvageResult,
    salvage,
    salvage_json,
)

TIME_BOUND_SECONDS = 2.0


@dataclass(frozen=True)
class Ok:
    value: object
    notes: tuple[str, ...]


@dataclass(frozen=True)
class Fail:
    reason: str


def ok(value, *notes):
    return Ok(value, notes)


def fail(reason):
    return Fail(reason)


CASES = [
    # Valid JSON is read as it stands: no note, repaired False.
    ("valid object", r'{"a": 1, "b": [true, false, null], "c": {"d": "e"}}', ok({"a": 1, "b": [True, False, None], "c": {"d": "e"}})),
    ("whitespace around the object is not a repair", ' \n{"a": 1}\r\n\t', ok({"a": 1})),
    ("spaces between tokens", r'{ "a" : [ 1 , 2 ] }', ok({"a": [1, 2]})),
    ("empty object", "{}", ok({})),
    ("empty containers", r'{"a": [], "b": {}}', ok({"a": [], "b": {}})),
    ("numbers of several shapes", r'{"i": -12, "f": 1.5e3, "z": -0, "big": 123456789012345678901234567890}', ok({"i": -12, "f": 1500.0, "z": 0, "big": 123456789012345678901234567890})),
    ("escaped and raw unicode", r'{"a": "caf\u00e9 è"}', ok({"a": "café è"})),
    ("surrogate pair written as escapes is one character", r'{"e": "\ud83d\ude00"}', ok({"e": "\U0001F600"})),
    ("short escapes", r'{"a": "x\/y\b\f\n\r\t"}', ok({"a": "x/y\b\f\n\r\t"})),
    ("escaped quotes and a raw apostrophe", '{"a": "it\'s \\"quoted\\""}', ok({"a": 'it\'s "quoted"'})),
    ("escaped backslash", r'{"p": "C:\\dir"}', ok({"p": "C:\\dir"})),
    # Prose and Markdown fences around one object.
    ("prose before the object", 'Here is the call: {"a": 1}', ok({"a": 1}, "removed 18 characters before the object")),
    ("prose after the object", '{"a": 1} Hope it helps.', ok({"a": 1}, "removed 15 characters after the object")),
    ("a fence with a language tag", '```json\n{"a": 1}\n```', ok({"a": 1}, "removed 8 characters before the object", "removed Markdown code fence", "removed 4 characters after the object")),
    ("a fence with prose on both sides", 'Sure!\n```\n{"a": 1}\n```\nLet me know.', ok({"a": 1}, "removed 10 characters before the object", "removed Markdown code fence", "removed 17 characters after the object")),
    ("braces in prose before the object", 'Use {the} tool: {"a": 1}', ok({"a": 1}, "removed 16 characters before the object")),
    ("braces in prose after the object", '{"a": 1} see {x} now', ok({"a": 1}, "removed 12 characters after the object")),
    ("one extra closing brace after the object", '{"a": 1}}', ok({"a": 1}, "removed 1 character after the object")),
    ("two objects", '{"a": 1} and {"b": 2}', fail("multiple_objects")),
    ("two fenced objects", '```json\n{"a": 1}\n```\n```json\n{"b": 2}\n```', fail("multiple_objects")),
    ("a second object right after the first", '{"a": 1}{"b"', fail("multiple_objects")),
    ("an array of objects", '[{"a": 1}, {"a": 2}]', fail("multiple_objects")),
    ("an object inside an array", '[{"a": 1}]', fail("object_in_array")),
    ("an object between a prose brace and an array end", '[{x}, {"a": 1}]', fail("object_in_array")),
    ("an object followed by a stray array end", '{"a": "b"}]', fail("object_in_array")),
    ("an unquoted-key object holding a valid one", '{name: "x", args: {"q": 1}}', fail("bad_token")),
    ("a newline-separated unquoted-key object", '{\n  name: "x"\n}', fail("bad_token")),
    ("a brace with a colon in prose before an object", 'Set {mode: fast} then {"a": 1}', fail("bad_token")),
    ("no object", "Here is my answer: none.", fail("no_object")),
    ("an object encoded as a JSON string", r'"{\"a\": 1}"', fail("bad_token")),
    ("empty text", "", fail("no_object")),
    ("whitespace only", " \n\t ", fail("no_object")),
    # Single quotes used as string delimiters.
    ("single-quoted key and value", "{'a': 'b'}", ok({"a": "b"}, "converted 2 single-quoted strings to double quotes")),
    ("apostrophe inside a double-quoted value", """{'a': "it's"}""", ok({"a": "it's"}, "converted 1 single-quoted string to double quotes")),
    ("double quotes inside a single-quoted value", """{"a": 'say "hi"'}""", ok({"a": 'say "hi"'}, "converted 1 single-quoted string to double quotes")),
    ("escaped apostrophe in single quotes", r"{'a': 'it\'s'}", ok({"a": "it's"}, "converted 2 single-quoted strings to double quotes")),
    ("escaped backslash in single quotes", r"{'a': 'x\\y'}", ok({"a": "x\\y"}, "converted 2 single-quoted strings to double quotes")),
    ("single-quoted key with an escaped apostrophe", r"{'a\'b': 1}", ok({"a'b": 1}, "converted 1 single-quoted string to double quotes")),
    ("escape that single quotes do not allow", r"{'a': 'x\y'}", fail("bad_escape")),
    ("single-quoted value never closed", "{'a': 'unterminated}", fail("truncated_string")),
    # Trailing commas.
    ("trailing comma", '{"a": 1,}', ok({"a": 1}, "removed 1 trailing comma")),
    ("trailing commas in an array and an object", '{"a": [1, 2,], "b": 3,}', ok({"a": [1, 2], "b": 3}, "removed 2 trailing commas")),
    ("trailing comma, a line break, then the bracket", '{"a": [1, 2 ,\n]}', ok({"a": [1, 2]}, "removed 1 trailing comma")),
    ("double comma", '{"a": 1,,}', fail("bad_token")),
    ("leading comma", '{,"a": 1}', fail("bad_token")),
    ("empty item between commas", '{"a": [1,,2]}', fail("bad_token")),
    ("comma alone in an array", '{"a": [,]}', fail("bad_token")),
    # Control characters inside strings, and the byte-order mark.
    ("raw newline inside a string", '{"a": "line 1\nline 2"}', ok({"a": "line 1\nline 2"}, "escaped 1 unescaped control character inside strings")),
    ("raw tab inside a string", '{"a": "x\ty"}', ok({"a": "x\ty"}, "escaped 1 unescaped control character inside strings")),
    ("raw newline, carriage return and tab in one string", '{"a": "1\n2\r\t3"}', ok({"a": "1\n2\r\t3"}, "escaped 3 unescaped control characters inside strings")),
    ("raw newline inside a key", '{"a\nb": 1}', ok({"a\nb": 1}, "escaped 1 unescaped control character inside strings")),
    ("raw newline in a single-quoted value", "{'a': 'x\ny'}", ok({"a": "x\ny"}, "converted 2 single-quoted strings to double quotes", "escaped 1 unescaped control character inside strings")),
    ("control character between tokens", '{"a":\x01 1}', fail("bad_token")),
    ("byte-order mark at the start", '\ufeff{"a": 1}', ok({"a": 1}, "removed byte-order mark")),
    ("byte-order mark, then a fence", '\ufeff```json\n{"a": 1}\n```', ok({"a": 1}, "removed byte-order mark", "removed 8 characters before the object", "removed Markdown code fence", "removed 4 characters after the object")),
    ("byte-order mark inside prose", 'Hi\ufeff{"a": 1}', ok({"a": 1}, "removed 3 characters before the object")),
    # Non-finite values and numbers.
    ("NaN", '{"a": NaN}', fail("non_finite_number")),
    ("Infinity", '{"a": Infinity}', fail("non_finite_number")),
    ("negative Infinity", '{"a": -Infinity}', fail("non_finite_number")),
    ("number beyond the float range", '{"a": 1e400}', fail("number_out_of_range")),
    ("negative number beyond the float range", '{"a": -1e400}', fail("number_out_of_range")),
    ("non-zero number that underflows to zero", '{"a": 1e-400}', fail("number_out_of_range")),
    ("zero with a large negative exponent is zero", '{"a": 0e-400}', ok({"a": 0.0})),
    ("None instead of null", '{"a": None}', fail("bad_literal")),
    ("True instead of true", '{"a": True}', fail("bad_literal")),
    ("undefined", '{"a": undefined}', fail("bad_literal")),
    ("leading zero", '{"a": 01}', fail("invalid_json")),
    ("number with a trailing dot", '{"a": 1.}', fail("invalid_json")),
    ("plus sign", '{"a": +1}', fail("bad_token")),
    ("leading dot", '{"a": .5}', fail("bad_token")),
    # Truncated output: closed only after a complete value, never completed.
    ("cut after a nested value", '{"a": 1, "b": {"c": "d"}', ok({"a": 1, "b": {"c": "d"}}, "closed 1 open bracket at the end of truncated output")),
    ("cut inside an array", '{"a": [1, 2]', ok({"a": [1, 2]}, "closed 1 open bracket at the end of truncated output")),
    ("cut inside two open containers", '{"a": [{"b": true}', ok({"a": [{"b": True}]}, "closed 2 open brackets at the end of truncated output")),
    ("cut after a complete string value", '{"a": "x"', ok({"a": "x"}, "closed 1 open bracket at the end of truncated output")),
    ("cut after true", '{"a": true', ok({"a": True}, "closed 1 open bracket at the end of truncated output")),
    ("cut after a number and a space", '{"a": 1 ', ok({"a": 1}, "closed 1 open bracket at the end of truncated output")),
    ("cut after a comma", '{"a": 1,', ok({"a": 1}, "removed 1 trailing comma", "closed 1 open bracket at the end of truncated output")),
    ("cut after a comma in an array", '{"a": [1, 2,', ok({"a": [1, 2]}, "removed 1 trailing comma", "closed 2 open brackets at the end of truncated output")),
    ("cut inside a string value", '{"a": "xy', fail("truncated_string")),
    ("cut inside a key", '{"a": 1, "b', fail("truncated_string")),
    ("cut inside a number", '{"a": 12', fail("truncated_number")),
    ("cut inside a literal", '{"a": tru', fail("truncated")),
    ("cut after a key", '{"a": 1, "b"', fail("truncated")),
    ("cut after a colon", '{"a": ', fail("truncated")),
    ("cut after the opening brace of a nested object", '{"a": {', fail("truncated")),
    ("only an opening brace", "{", fail("no_object")),
    ("truncated object followed by prose", '{"a": [1, 2] Hope this helps', fail("bad_token")),
    # Duplicate keys.
    ("duplicate key", '{"a": 1, "a": 2}', fail("duplicate_key")),
    ("duplicate key in a nested object", '{"a": {"b": 1, "b": 2}}', fail("duplicate_key")),
    ("duplicate key written with an escape", r'{"a": 1, "\u0061": 2}', fail("duplicate_key")),
    ("duplicate key in an object inside an array", '{"a": [{"x": 1, "x": 1}]}', fail("duplicate_key")),
    # Malformed JSON that no repair in the list covers.
    ("missing colon", '{"a" 1}', fail("bad_token")),
    ("missing comma", '{"a": 1 "b": 2}', fail("bad_token")),
    ("unquoted key", "{a: 1}", fail("bad_token")),
    ("comment", '{"a": 1 // note\n}', fail("bad_token")),
    ("items without a comma", '{"a": [1 2]}', fail("bad_token")),
    ("brace closed by a square bracket", '{"a": {"b": 1]}', fail("bad_token")),
    ("square bracket closed by a brace", '{"a": [1}', fail("bad_token")),
    ("closing bracket with nothing open", '{"a": 1]', fail("bad_token")),
    ("escape that JSON does not have", r'{"a": "\x41"}', fail("bad_escape")),
    ("unicode escape with a non-hex digit", r'{"a": "\u12G4"}', fail("bad_escape")),
    # Lone surrogates: not text.
    ("raw lone surrogate character", '{"a": "\ud800"}', fail("not_text")),
    ("escaped lone high surrogate", r'{"a": "\ud800"}', fail("lone_surrogate")),
    ("escaped lone high surrogate before text", r'{"a": "\ud800x"}', fail("lone_surrogate")),
    ("escaped lone low surrogate", r'{"a": "\udc00"}', fail("lone_surrogate")),
    ("longer than the input cap", '{"a": "' + "x" * MAX_INPUT_CHARS + '"}', fail("too_long")),
]

# Inputs built to be expensive. Each must be answered within TIME_BOUND_SECONDS.
HOSTILE = [
    ("input one character past the cap", "[" * (MAX_INPUT_CHARS + 1), fail("too_long")),
    ("200,000 opening brackets", "[" * 200_000, fail("no_object")),
    ("200,000 opening braces", "{" * 200_000, fail("no_object")),
    ("nesting far past the depth cap", '{"a":' + "[" * 199_000, fail("too_deep")),
    ("unterminated string of 199,000 characters", '{"a":"' + "x" * 199_000, fail("truncated_string")),
    ("a 150,000-digit integer", '{"a":' + "9" * 150_000 + "}", fail("huge_number")),
    ("a number cut by the end of the text", '{"a": ' + "1" * 150_000, fail("truncated_number")),
    ("25,000 repeated keys", "{" + '"a":1,' * 25_000 + '"a":1}', fail("duplicate_key")),
    ("25,000 complete objects in a row", '{"a":1}' * 25_000, fail("multiple_objects")),
    ("60,000 prose braces before one object", "{x}" * 60_000 + '{"a": 1}', ok({"a": 1}, "removed 180000 characters before the object")),
    ("a 90,000-item array with a trailing comma", '{"a":[' + "1," * 90_000 + "]}", ok({"a": [1] * 90_000}, "removed 1 trailing comma")),
    ("a 150,000-character single-quoted value", "{'a': '" + "x" * 150_000 + "'}", ok({"a": "x" * 150_000}, "converted 2 single-quoted strings to double quotes")),
    ("50,000 raw newlines in a string", '{"a": "' + "\n" * 50_000 + '"}', ok({"a": "\n" * 50_000}, "escaped 50000 unescaped control characters inside strings")),
    ("a run of escaped backslashes ending in one", '{"a": "' + "\\\\" * 99_990 + "\\", fail("truncated_string")),
    ("20,000 escaped lone surrogates", '{"a": "' + "\\ud800" * 20_000 + '"}', fail("lone_surrogate")),
    ("a raw lone surrogate in a long text", "{" + "x" * 100_000 + "\ud800" + "}", fail("not_text")),
]


def check(result, expected):
    if isinstance(expected, Fail):
        assert expected.reason in REASONS
        assert result == Refusal(expected.reason)
    else:
        assert result == SalvageResult(expected.value, bool(expected.notes), expected.notes)


@pytest.mark.parametrize(("text", "expected"), [(text, expected) for _, text, expected in CASES], ids=[name for name, _, _ in CASES])
def test_each_case_gives_its_value_and_notes_or_its_refusal(text, expected):
    result = salvage(text)
    check(result, expected)
    if isinstance(expected, Ok):
        assert salvage_json(text) == result
    else:
        assert salvage_json(text) is None


@pytest.mark.parametrize(("text", "expected"), [(text, expected) for _, text, expected in HOSTILE], ids=[name for name, _, _ in HOSTILE])
def test_hostile_inputs_are_answered_within_the_time_bound(text, expected):
    started = time.perf_counter()
    result = salvage(text)
    elapsed = time.perf_counter() - started
    assert elapsed < TIME_BOUND_SECONDS, f"took {elapsed:.2f} s"
    check(result, expected)


def test_nesting_at_the_cap_is_read_and_one_level_more_is_refused():
    inner: list = []
    for _ in range(MAX_DEPTH - 2):
        inner = [inner]  # MAX_DEPTH - 1 arrays in all, plus the object: MAX_DEPTH containers
    at_cap = '{"a":' + "[" * (MAX_DEPTH - 1) + "]" * (MAX_DEPTH - 1) + "}"
    assert salvage(at_cap) == SalvageResult({"a": inner}, False, ())
    over_cap = '{"a":' + "[" * MAX_DEPTH + "]" * MAX_DEPTH + "}"
    assert salvage(over_cap) == Refusal("too_deep")


def test_numbers_up_to_the_digit_cap_are_read_and_longer_ones_are_refused():
    at_cap = '{"a": ' + "1" * MAX_NUMBER_CHARS + "}"
    assert salvage(at_cap) == SalvageResult({"a": int("1" * MAX_NUMBER_CHARS)}, False, ())
    assert salvage('{"a": ' + "1" * (MAX_NUMBER_CHARS + 1) + "}") == Refusal("huge_number")


def test_input_at_the_length_cap_is_read_and_one_more_character_is_refused():
    padding = MAX_INPUT_CHARS - len('{"a": ""}')
    at_cap = '{"a": "' + "x" * padding + '"}'
    assert len(at_cap) == MAX_INPUT_CHARS
    assert salvage(at_cap) == SalvageResult({"a": "x" * padding}, False, ())
    assert salvage(at_cap + " ") == Refusal("too_long")


@pytest.mark.parametrize("value", [None, 5, b'{"a": 1}', ["{"], {"a": 1}, 1.5])
def test_non_text_is_refused_and_never_raises(value):
    assert salvage(value) == Refusal("not_text")
    assert salvage_json(value) is None


def random_text(rng):
    alphabet = 'ab Z-9"\\\n\t\x00é😀/{}[]:,\''
    return "".join(rng.choice(alphabet) for _ in range(rng.randint(0, 12)))


def random_value(rng, depth):
    kinds = ["text", "int", "float", "bool", "null"] + (["list", "object"] if depth < 3 else [])
    kind = rng.choice(kinds)
    if kind == "text":
        return random_text(rng)
    if kind == "int":
        return rng.choice([rng.randint(-(10**18), 10**18), 10**30 + rng.randint(0, 999)])
    if kind == "float":
        return rng.uniform(-1, 1) * 10.0 ** rng.randint(-300, 300)
    if kind == "bool":
        return rng.random() < 0.5
    if kind == "null":
        return None
    if kind == "list":
        return [random_value(rng, depth + 1) for _ in range(rng.randint(0, 3))]
    return random_object(rng, depth + 1)


def random_object(rng, depth=0):
    return {random_text(rng): random_value(rng, depth) for _ in range(rng.randint(0, 4))}


PROPERTY_SEEDS = range(300)


def test_valid_objects_round_trip_unchanged():
    for seed in PROPERTY_SEEDS:
        rng = random.Random(seed)
        original = random_object(rng)
        text = json.dumps(original, indent=rng.choice([None, 2, "\t"]), ensure_ascii=rng.random() < 0.5)
        assert salvage(text) == SalvageResult(original, False, ()), f"seed {seed}"


def test_prose_around_a_valid_object_gives_that_object():
    prose = "abc xyz .!?\n\té,"
    for seed in PROPERTY_SEEDS:
        rng = random.Random(seed)
        original = random_object(rng)
        before = "".join(rng.choice(prose) for _ in range(rng.randint(0, 20)))
        after = "".join(rng.choice(prose) for _ in range(rng.randint(0, 20)))
        result = salvage_json(before + json.dumps(original) + after)
        assert result is not None and result.value == original, f"seed {seed}"


def test_garbage_after_a_valid_object_never_gives_another_object():
    for seed in PROPERTY_SEEDS:
        rng = random.Random(seed)
        original = random_object(rng)
        garbage = "".join(rng.choice('{}[]",:\'\\ x\n') for _ in range(rng.randint(1, 30)))
        result = salvage_json(json.dumps(original) + garbage)
        assert result is None or result.value == original, f"seed {seed}"


ALLOWED_IMPORTS = {"__future__", "dataclasses", "json", "math", "typing"}
FORBIDDEN_NAMES = {"eval", "exec", "compile", "open", "__import__", "literal_eval"}


def test_module_imports_only_standard_library_modules_and_calls_no_evaluator():
    tree = ast.parse(Path(json_salvage.__file__).read_text(encoding="utf-8"))
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            assert node.level == 0 and node.module is not None
            imported.add(node.module.split(".")[0])
    assert imported <= ALLOWED_IMPORTS
    assert all(name in sys.stdlib_module_names for name in imported)
    used = {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)}
    used |= {node.attr for node in ast.walk(tree) if isinstance(node, ast.Attribute)}
    assert not (used & FORBIDDEN_NAMES)
