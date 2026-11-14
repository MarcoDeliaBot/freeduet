"""Recover the one JSON object in a model's raw text, when that can be done with certainty.

A small local model often wraps a tool call's arguments in prose or a Markdown code fence, writes a
trailing comma or single quotes, puts a raw newline inside a string, or stops before the end.
`salvage` returns the object the text holds and says what it repaired (`SalvageResult.notes`). Where a
repair would have to guess, it refuses with one of `REASONS` instead. It never raises, and it never
returns an object other than the one the text holds.

Repaired, each one noted:
- text before or after the object, a Markdown code fence, a byte-order mark at the start;
- single-quoted strings (keys and values alike), rewritten with double quotes;
- control characters inside strings (a raw newline, a tab), escaped;
- trailing commas before a closing bracket;
- text that stops after a complete value: its open brackets are closed. The text may have stopped
  where the model meant to go on, so the notes say how many brackets were added.

Refused:
- no object, two objects, or an object inside an array;
- a value cut short (a string, a number, a key or a colon at the end): never completed;
- duplicate keys, NaN, Infinity, numbers beyond the float range or underflowing to zero, lone
  surrogates, and anything else the JSON grammar rejects;
- input longer than MAX_INPUT_CHARS, nesting deeper than MAX_DEPTH, numbers longer than MAX_NUMBER_CHARS.

Linear in the input length. No regular expression, no eval, no I/O, no state: the standard library only.
Nothing in the service imports this module yet (docs/ENGINES_PLAN.md, section 2).
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from typing import Any

MAX_INPUT_CHARS = 200_000
MAX_DEPTH = 64  # containers, the top-level object included
MAX_NUMBER_CHARS = 1_000

REASONS = (
    "not_text",
    "too_long",
    "no_object",
    "multiple_objects",
    "object_in_array",
    "truncated",
    "truncated_string",
    "truncated_number",
    "bad_escape",
    "bad_token",
    "bad_literal",
    "non_finite_number",
    "number_out_of_range",
    "huge_number",
    "too_deep",
    "duplicate_key",
    "lone_surrogate",
    "invalid_json",
)

_JSON_WS = " \t\r\n"
_NUMBER_CHARS = frozenset("0123456789+-.eE")
_HEX = frozenset("0123456789abcdefABCDEF")
_ESCAPES = frozenset('"\\/bfnrt')
_LITERALS = frozenset(("true", "false", "null"))
_CONTROL_ESCAPES = {"\n": "\\n", "\r": "\\r", "\t": "\\t"}

# What the scanner expects next, inside the innermost open container.
_VALUE = 0  # a value, after a colon
_ARRAY_START = 1  # after '[': a value, or ']' for an empty array
_OBJECT_START = 2  # after '{': a key, or '}' for an empty object
_KEY = 3  # after a comma in an object: a key (a '}' here is a trailing comma)
_ITEM = 4  # after a comma in an array: a value (a ']' here is a trailing comma)
_COLON = 5  # after a key: ':'
_AFTER = 6  # after a complete value: ',' or the closing bracket


@dataclass(frozen=True)
class SalvageResult:
    value: dict[str, Any]
    repaired: bool  # False exactly when the text needed no repair (surrounding whitespace aside)
    notes: tuple[str, ...]  # one line per repair, in the order the repairs were made


@dataclass(frozen=True)
class Refusal:
    reason: str  # one of REASONS


class _Refuse(Exception):
    """Raised inside this module when a repair would have to guess. `reason` is one of REASONS."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass
class _Scan:
    end: int  # index just past the object (len(text) when the text ends first)
    pieces: list[str]  # the object's text, repaired, in order
    singles: int = 0  # single-quoted strings rewritten
    controls: int = 0  # control characters escaped
    trailing: int = 0  # trailing commas removed
    closers: int = 0  # brackets added to a truncated end
    truncated: bool = False


def salvage(text: object) -> SalvageResult | Refusal:
    """The object `text` holds, or the reason it cannot be recovered with certainty. Never raises."""
    if not isinstance(text, str):
        return Refusal("not_text")
    if len(text) > MAX_INPUT_CHARS:
        return Refusal("too_long")
    try:
        text.encode("utf-8")  # a lone surrogate is not text
    except UnicodeEncodeError:
        return Refusal("not_text")
    try:
        return _salvage(text)
    except _Refuse as refusal:
        return Refusal(refusal.reason)
    except (ValueError, OverflowError, RecursionError):  # json's own errors, and interpreter limits
        return Refusal("invalid_json")


def salvage_json(text: object) -> SalvageResult | None:
    """`salvage`, with the refusal reduced to None."""
    result = salvage(text)
    return result if isinstance(result, SalvageResult) else None


def _salvage(text: str) -> SalvageResult:
    bom = text.startswith("\ufeff")
    s = text[1:] if bom else text
    start, scan = _find_object(s)
    _check_neighbours(s, start, scan.end)
    value = _decode("".join(scan.pieces))
    _check_text(value)
    prefix, suffix = s[:start], s[scan.end :]
    notes: list[str] = []
    if bom:
        notes.append("removed byte-order mark")
    if prefix.strip(_JSON_WS):
        notes.append(f"removed {_count(len(prefix), 'character')} before the object")
    if "```" in prefix or "```" in suffix:
        notes.append("removed Markdown code fence")
    if scan.singles:
        notes.append(f"converted {_count(scan.singles, 'single-quoted string')} to double quotes")
    if scan.controls:
        notes.append(f"escaped {_count(scan.controls, 'unescaped control character')} inside strings")
    if scan.trailing:
        notes.append(f"removed {_count(scan.trailing, 'trailing comma')}")
    if scan.truncated:
        notes.append(f"closed {_count(scan.closers, 'open bracket')} at the end of truncated output")
    if suffix.strip(_JSON_WS):
        notes.append(f"removed {_count(len(suffix), 'character')} after the object")
    return SalvageResult(value=value, repaired=bool(notes), notes=tuple(notes))


def _count(n: int, noun: str) -> str:
    return f"{n} {noun}" if n == 1 else f"{n} {noun}s"


def _find_object(s: str) -> tuple[int, _Scan]:
    """The one object `s` holds, and where it starts. A brace that does not open an object is prose."""
    found: tuple[int, _Scan] | None = None
    pos = 0
    while True:
        opened = s.find("{", pos)
        if opened < 0:
            break
        if not _opens_object(s, opened):
            pos = opened + 1
            continue
        if found is not None:
            raise _Refuse("multiple_objects")
        found = (opened, _scan_object(s, opened))
        pos = found[1].end
    if found is None:
        raise _Refuse("no_object")
    return found


def _opens_object(s: str, opened: int) -> bool:
    """Whether the brace at `opened` starts an object (possibly a damaged one, which is then refused).
    A brace followed by a quote or '}' does; so does one with a colon before the next brace, as in
    `{name: "x"}`. Braces around a bare word, as in `{the}`, are prose."""
    n = len(s)
    after = _skip_ws(s, opened + 1)
    if after >= n:
        return False
    if s[after] in "\"'}":
        return True
    k = opened + 1
    while k < n and s[k] not in "{}":
        k += 1
    return ":" in s[opened + 1 : k]


def _check_neighbours(s: str, start: int, end: int) -> None:
    """An object held between an array's brackets is part of the array, not the answer."""
    if s[:start].rstrip(_JSON_WS).endswith("["):
        raise _Refuse("object_in_array")
    if s[end:].lstrip(_JSON_WS).startswith("]"):
        raise _Refuse("object_in_array")


def _decode(text: str) -> dict[str, Any]:
    value = json.loads(
        text,
        object_pairs_hook=_no_repeated_keys,
        parse_constant=_constant,
        parse_float=_float,
    )
    if not isinstance(value, dict):
        raise _Refuse("no_object")
    return value


def _no_repeated_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, item in pairs:
        if key in result:
            raise _Refuse("duplicate_key")
        result[key] = item
    return result


def _constant(name: str) -> Any:  # NaN, Infinity, -Infinity
    raise _Refuse("non_finite_number")


def _float(literal: str) -> float:
    number = float(literal)
    if not math.isfinite(number):
        raise _Refuse("number_out_of_range")
    mantissa = literal.lower().split("e", 1)[0]
    if number == 0.0 and any(digit in "123456789" for digit in mantissa):
        raise _Refuse("number_out_of_range")  # a non-zero literal that underflows to zero
    return number


def _check_text(value: object) -> None:
    """Every string, keys included, must be Unicode text: a lone surrogate cannot be sent as UTF-8."""
    pending: list[object] = [value]
    while pending:
        item = pending.pop()
        if isinstance(item, str):
            try:
                item.encode("utf-8")
            except UnicodeEncodeError:
                raise _Refuse("lone_surrogate") from None
        elif isinstance(item, dict):
            for key, child in item.items():
                pending.append(key)
                pending.append(child)
        elif isinstance(item, list):
            pending.extend(item)


def _scan_object(s: str, start: int) -> _Scan:
    """Read the object that opens at `start` (a '{') token by token. Text is copied as it stands,
    except where a repair applies: the copied span then ends, and the repaired token takes its place."""
    n = len(s)
    scan = _Scan(end=n, pieces=[])
    out = scan.pieces
    stack = ["{"]
    state = _OBJECT_START
    seg = start  # s[seg:q] has not been copied into `out` yet
    comma = -1  # index in `out` of the last comma, emptied if that comma turns out to be trailing
    q = start + 1
    while True:
        if q >= n:
            if state not in (_AFTER, _KEY, _ITEM):
                raise _Refuse("truncated")
            if state != _AFTER:  # a comma with nothing after it
                out[comma] = ""
                scan.trailing += 1
            out.append(s[seg:])
            out.extend("}" if opener == "{" else "]" for opener in reversed(stack))
            scan.closers = len(stack)
            scan.truncated = True
            return scan
        c = s[q]
        if c in _JSON_WS:
            q += 1
        elif state == _COLON:
            if c != ":":
                raise _Refuse("bad_token")
            state = _VALUE
            q += 1
        elif state == _AFTER and c == ",":
            out.append(s[seg:q])
            comma = len(out)
            out.append(",")
            seg = q + 1
            state = _KEY if stack[-1] == "{" else _ITEM
            q += 1
        elif (c == "}" or c == "]") and state != _VALUE:
            if (c == "}") != (stack[-1] == "{"):
                raise _Refuse("bad_token")
            if state in (_KEY, _ITEM):  # a trailing comma before the closing bracket
                out[comma] = ""
                scan.trailing += 1
            stack.pop()
            q += 1
            if not stack:
                out.append(s[seg:q])
                scan.end = q
                return scan
            state = _AFTER
        elif c in "\"'" and state in (_OBJECT_START, _KEY, _VALUE, _ARRAY_START, _ITEM):
            end, repaired, singles, controls = _string(s, q)
            if repaired is not None:
                out.append(s[seg:q])
                out.append(repaired)
                seg = end
                scan.singles += singles
                scan.controls += controls
            q = end
            state = _COLON if state in (_OBJECT_START, _KEY) else _AFTER
        elif state in (_OBJECT_START, _KEY) or state == _AFTER:
            raise _Refuse("bad_token")  # a key must be a string; nothing but ',' or a bracket follows a value
        elif c == "{" or c == "[":
            if len(stack) >= MAX_DEPTH:
                raise _Refuse("too_deep")
            stack.append(c)
            state = _OBJECT_START if c == "{" else _ARRAY_START
            q += 1
        elif c == "-" or "0" <= c <= "9":
            q = _number(s, q)
            state = _AFTER
        elif "a" <= c <= "z" or "A" <= c <= "Z":
            q = _literal(s, q)
            state = _AFTER
        else:
            raise _Refuse("bad_token")


def _string(s: str, q: int) -> tuple[int, str | None, int, int]:
    """The string token that starts at `q`: where it ends, its repaired text (None when it needs no
    repair), 1 if it was single-quoted and 0 if not, and how many control characters it holds."""
    n = len(s)
    quote = s[q]
    controls = 0
    k = q + 1
    while True:
        if k >= n:
            raise _Refuse("truncated_string")
        c = s[k]
        if c == quote:
            break
        if c == "\\":
            if k + 1 >= n:
                raise _Refuse("truncated_string")
            escape = s[k + 1]
            if escape == "u":
                digits = s[k + 2 : k + 6]
                if len(digits) < 4:  # the text ends inside the escape, or the escape is not one
                    raise _Refuse("truncated_string" if _HEX.issuperset(digits) else "bad_escape")
                if not _HEX.issuperset(digits):
                    raise _Refuse("bad_escape")
                k += 6
            elif escape in _ESCAPES or (escape == "'" and quote == "'"):
                k += 2
            else:
                raise _Refuse("bad_escape")
        else:
            if c < " ":
                controls += 1
            k += 1
    single = quote == "'"
    if not single and not controls:
        return k + 1, None, 0, 0
    return k + 1, _rebuild(s, q + 1, k), int(single), controls


def _rebuild(s: str, a: int, b: int) -> str:
    """The text s[a:b] of a string, as a double-quoted JSON string. `_string` has checked the escapes."""
    parts = ['"']
    k = a
    while k < b:
        c = s[k]
        if c == "\\":
            escape = s[k + 1]
            width = 6 if escape == "u" else 2
            parts.append("'" if escape == "'" else s[k : k + width])
            k += width
        elif c == '"':  # only a single-quoted string holds a raw double quote
            parts.append('\\"')
            k += 1
        elif c < " ":
            parts.append(_CONTROL_ESCAPES.get(c) or f"\\u{ord(c):04x}")
            k += 1
        else:
            parts.append(c)
            k += 1
    parts.append('"')
    return "".join(parts)


def _number(s: str, q: int) -> int:
    """The end of the number token at `q`. A token that runs into the end of the text may be cut short."""
    n = len(s)
    k = q
    while k < n and s[k] in _NUMBER_CHARS:
        k += 1
    if k >= n:
        raise _Refuse("truncated_number")
    if s[q] == "-" and k == q + 1 and s.startswith("Infinity", k):
        raise _Refuse("non_finite_number")
    if k - q > MAX_NUMBER_CHARS:
        raise _Refuse("huge_number")
    return k


def _literal(s: str, q: int) -> int:
    n = len(s)
    k = q
    while k < n and ("a" <= s[k] <= "z" or "A" <= s[k] <= "Z"):
        k += 1
    word = s[q:k]
    if word in ("NaN", "Infinity"):
        raise _Refuse("non_finite_number")
    if word not in _LITERALS:
        raise _Refuse("truncated" if k >= n else "bad_literal")
    return k


def _skip_ws(s: str, k: int) -> int:
    while k < len(s) and s[k] in _JSON_WS:
        k += 1
    return k
