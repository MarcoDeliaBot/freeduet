"""Builders and readers shared by the tests. Every value is invented."""

import json

MANAGED_TOKEN = "test-managed-token"
TOOL_TOKEN = "test-agent-tool-token"
ASSERTION = "test-signed-run-assertion"

# A settle window no test waits out. The `fake_cli` fixture sets 0.1 s, a wall-clock race against a
# subprocess that plays several steps: a stall of the CLI or of the runner longer than that ends the
# segment early (the flakes of 14 Nov 2026). A test whose CLI plays its whole plan and ends by itself sets
# this instead, so the segment ends on the CLI's result line and no timer decides the outcome.
SETTLE_NEVER = 30.0


def standing(bot_id="freeduet", content="You are Iris, Chief of Staff."):
    return {"id": f"standing-role:{bot_id}", "role": "system", "content": content}


def run_body(messages, *, bot_id="freeduet", tools=(), deployment=(), run_id="run-1", thread_id="thread-1"):
    return {
        "threadId": thread_id,
        "runId": run_id,
        "state": {},
        "messages": list(messages),
        "tools": list(tools),
        "context": [],
        "forwardedProps": {
            "openbotBotId": bot_id,
            "openbotDeploymentTools": list(deployment),
            "openbotRun": ASSERTION,
        },
    }


def tool(name, properties=None):
    return {
        "name": name,
        "description": f"The {name} tool.",
        "parameters": {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "type": "object",
            "properties": properties or {},
        },
    }


def parse_sse(text: str) -> tuple[list[dict], int]:
    """The events in an SSE body, and how many keepalive comments it held."""
    events, keepalives = [], 0
    for frame in text.split("\n\n"):
        if frame.startswith(":"):
            keepalives += 1
        elif frame.startswith("data: "):
            events.append(json.loads(frame[len("data: "):]))
    return events, keepalives


def post_run(client, body, token=MANAGED_TOKEN):
    headers = {"x-openbot-agent-token": token} if token is not None else {}
    response = client.post("/", json=body, headers=headers)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/event-stream")
    return parse_sse(response.text)


def types(events):
    return [event["type"] for event in events]
