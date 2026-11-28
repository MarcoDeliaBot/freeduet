"""The member's system text for the subagent simulation, as agent-freeduet assembles it for a normal turn.

Called by render-case.ts with one JSON object on stdin ({"member": id, "request": text, "handoff": {"description",
"inputSchema"}}, where handoff is message_bot as the TypeScript side reads it from the server's handoff-tool.ts)
and answers one JSON object on stdout ({"system": text, "tools": [{"name", "description", "inputSchema"}],
"toolsNote": text}); inputSchema is the JSON Schema of each tool's real parameters. It reads the
real code of openbot/agent-freeduet (members.resolve_member, transcript.render, tool_notes, the person's
language and tone notes, Iris's local tools) and the real team file (openbot/examples/freeduet/agents.yaml).
Nothing is re-implemented here. Run it isolated (python3 -I), so no file next to it can be imported.

Left out, because a run's data is not in a case: the person's memory and the channel's context rows, the
lessons of a colleague (none on an eval stack with memories cleared), the earlier turns of the case (the
TypeScript side writes them under the request), and the tools the server grants (see toolsNote).
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SERVICE = ROOT / "openbot" / "agent-freeduet"
AGENTS = ROOT / "openbot" / "examples" / "freeduet" / "agents.yaml"

sys.path.insert(0, str(SERVICE))

from freeduet import agui, iris_tools, members, person_language, person_tone, tool_notes, transcript  # noqa: E402

IRIS = "freeduet"
TOOLS_NOTE = (
    "The tools the server grants this member (GET /api/plugins/for/<member>) and the computer tools the "
    "app offers (evals/team/app-computer-tools.ts) need a running eval stack or the app; they are not "
    "listed here. Only the tools the freeduet server serves itself are shown."
)


def first_sentence(text: str) -> str:
    cut = text.find(". ")
    return (text if cut < 0 else text[: cut + 1]).strip()


def main() -> None:
    body = json.loads(sys.stdin.read())
    bot_id = str(body["member"])
    request = str(body["request"])
    handoff = body["handoff"]
    messages = [{"role": "user", "id": "eval-request", "content": request}]

    member = members.resolve_member(bot_id, messages, AGENTS)
    tools = []
    if bot_id == IRIS:
        tools = [{"name": name, "description": first_sentence(iris_tools.DEFINITIONS[name]["description"]),
                  "inputSchema": iris_tools.DEFINITIONS[name]["inputSchema"]}
                 for name in sorted(iris_tools.NAMES)]
        # The server's own hand-off tool, offered when the deployment's hand-off desk is on (handoff-tool.ts).
        tools.insert(0, {"name": "message_bot", "description": first_sentence(handoff["description"]),
                         "inputSchema": handoff["inputSchema"]})
    # The run is told which tools the server offers (the same names the tool list above shows), so the
    # notes do not say a tool is missing that the member is offered.
    offered = [{"name": tool["name"]} for tool in tools if tool["name"] not in iris_tools.NAMES]
    run = agui.RunInput(thread_id="eval", run_id="eval", messages=messages, tools=offered, bot_id=bot_id)
    notes = [*tool_notes.notes_for(run, member), *person_language.notes_for(run), *person_tone.notes_for(run)]
    served = {tool["name"] for tool in offered} | (set(iris_tools.NAMES) if bot_id == IRIS else set())
    rendered = transcript.render(member, messages, [], (), notes, served=served, light=False)
    json.dump({"system": rendered.system, "tools": tools, "toolsNote": TOOLS_NOTE}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
