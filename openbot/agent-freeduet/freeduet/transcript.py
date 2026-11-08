"""OpenBot's messages as what a fresh `claude -p` reads (D6, D7).

Segments are stateless: every POST starts a new CLI process, so the whole conversation is rendered
each time. OpenBot's system rows (the standing role, the granted-tools guidance, anything else with
role system or developer) and the run's application context join the member's prompt in the text
for `--append-system-prompt`. Everything else (user, assistant with its tool calls, tool results)
becomes the prompt the CLI reads on stdin, oldest first, in tags the model can follow.
"""

import json
import re
from dataclasses import dataclass

from .members import Member

SYSTEM_ROLES = {"system", "developer"}

RUNTIME_NOTE = (
    "How this session works. Your only tools are the ones the freeduet MCP server lists; you see "
    "them as mcp__freeduet__<name>, and the conversation below names a call by its plain <name>. "
    "There is no shell, file or web access other than through those tools. A tool call can pause "
    "your turn while it runs or while the person approves it; when you are started again, its "
    "result is in the conversation. Never repeat a call that already has a result."
)

_TAGS = re.compile(r"</?(?:conversation|user|assistant|tool_call|tool_result)\b", re.IGNORECASE)


@dataclass(frozen=True)
class Rendered:
    system: str
    prompt: str


def _escape(text: str) -> str:
    """Keep message text from closing or opening the transcript's own tags."""
    return _TAGS.sub(lambda match: match.group(0).replace("<", "&lt;"), text)


def _as_text(value) -> str:
    if isinstance(value, str):
        return value
    if value is None:
        return ""
    return json.dumps(value, ensure_ascii=False)


def _part_text(part) -> str:
    if not isinstance(part, dict):
        return ""
    if part.get("type") == "text":
        return _as_text(part.get("text"))
    source = part.get("source") if isinstance(part.get("source"), dict) else {}
    name = part.get("filename") or part.get("name") or part.get("type") or "file"
    mime = part.get("mimeType") or source.get("mimeType") or "unknown type"
    return (
        f"[Attached: {name} ({mime}). This engine receives text only in this version, "
        "so the file's content is not shown here.]"
    )


def _content_text(content) -> str:
    if isinstance(content, list):
        return "\n".join(text for text in (_part_text(part) for part in content) if text)
    return _as_text(content)


def _system_text(member: Member, messages: list[dict], context: list[dict]) -> str:
    sections = [member.system_prompt]
    rows = (_content_text(message.get("content")).strip() for message in messages if message.get("role") in SYSTEM_ROLES)
    # A Bot without a row in agents.yaml runs on its standing role: that row is the prompt already.
    sections += [row for row in rows if row != member.system_prompt]
    for entry in context:
        value = _as_text(entry.get("value")).strip()
        if value:
            description = _as_text(entry.get("description")).strip()
            sections.append(f"{description}\n{value}" if description else value)
    sections.append(RUNTIME_NOTE)
    return "\n\n".join(section for section in sections if section)


def _tool_calls(message: dict) -> list[tuple[str, str, str]]:
    calls = []
    for call in message.get("toolCalls") or []:
        function = call.get("function") if isinstance(call, dict) else None
        if not isinstance(function, dict) or not isinstance(call.get("id"), str):
            continue
        calls.append((call["id"], _as_text(function.get("name")), _as_text(function.get("arguments")) or "{}"))
    return calls


def _attr(value: str) -> str:
    return value.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")


def _closing_instruction(messages: list[dict]) -> str:
    last = messages[-1].get("role") if messages else None
    if last == "tool":
        return (
            "Continue your turn from where it stopped: the results of your tool calls are the last "
            "entries above."
        )
    if last == "user":
        return "Reply to the last user message, as the assistant."
    if last == "assistant":
        return "Continue the conversation as the assistant."
    return "Start your turn as the assistant."


def render(member: Member, messages: list[dict], context: list[dict] | None = None) -> Rendered:
    names: dict[str, str] = {}
    blocks: list[str] = []
    turn = [message for message in messages if message.get("role") in {"user", "assistant", "tool"}]
    for message in turn:
        role = message["role"]
        if role == "user":
            blocks.append(f"<user>\n{_escape(_content_text(message.get('content')))}\n</user>")
        elif role == "assistant":
            parts = []
            text = _content_text(message.get("content")).strip()
            if text:
                parts.append(_escape(text))
            for call_id, name, arguments in _tool_calls(message):
                names[call_id] = name
                parts.append(
                    f'<tool_call id="{_attr(call_id)}" name="{_attr(name)}">{_escape(arguments)}</tool_call>'
                )
            if parts:
                blocks.append("<assistant>\n" + "\n".join(parts) + "\n</assistant>")
        else:
            call_id = _as_text(message.get("toolCallId"))
            status = ' status="error"' if message.get("error") else ""
            blocks.append(
                f'<tool_result id="{_attr(call_id)}" name="{_attr(names.get(call_id, ""))}"{status}>\n'
                f"{_escape(_content_text(message.get('content')))}\n</tool_result>"
            )
    conversation = "<conversation>\n" + "\n\n".join(blocks) + "\n</conversation>" if blocks else ""
    prompt = "\n\n".join(part for part in (conversation, _closing_instruction(turn)) if part)
    return Rendered(system=_system_text(member, messages, context or []), prompt=prompt)
