"""Deployment tools through OpenBot's own route (D5): `POST /api/agent-tools/call`.

The tools named in `forwardedProps.openbotDeploymentTools` (`message_bot`, `ask_person` and any
grant OpenBot runs on its side) are executed by the server for the agent, so their result goes
straight back to the CLI. The request is the one `server/src/app.ts` expects: the agent's own token
in `x-openbot-agent-token`, and the run's signed assertion as `run`, which is where the server reads
the Bot and the person from. Same contract as agent-langgraph-agui's `_call_tool`.

Runs in the parent, never in the bridge: the bridge process does not hold `AGENT_TOOL_TOKEN`.
"""

import os

import httpx

from .ipc import ToolReply

DEFAULT_TOOL_URL = "http://host.docker.internal:3001/api/agent-tools/call"
TOKEN_HEADER = "x-openbot-agent-token"
HANDOFF_TOOL = "message_bot"
# OpenBot's approval gate wanted to ask the person, and this route has no conversation to ask them in
# (`ApprovalRefusedError` from `approvalAction`, server/src/approvals/types.ts). Matched on the
# server's own words, which only that refusal uses.
CANNOT_ASK = "not started from a conversation that can ask you"
# message_bot waits for the other member's whole turn; the SSE keepalive covers the silence.
TIMEOUT = httpx.Timeout(connect=10.0, read=900.0, write=30.0, pool=10.0)


def _refusal_reason(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return ""
    error = body.get("error") if isinstance(body, dict) else None
    return f" {error.strip()}" if isinstance(error, str) and error.strip() else ""


def needs_the_person(reply: ToolReply) -> bool:
    """The call was refused only because its approval had to be asked for, and could not be here."""
    return reply.is_error and CANNOT_ASK in reply.text


async def call_deployment_tool(name: str, arguments: dict, assertion: str) -> ToolReply:
    token = (os.environ.get("AGENT_TOOL_TOKEN") or "").strip()
    if not token:
        return ToolReply("Refused. This Bot has no credential for calling tools through its deployment.", True)
    if not assertion:
        return ToolReply("Refused. This run carried no signed statement of which Bot and person it is for.", True)
    url = os.environ.get("OPENBOT_TOOL_URL") or DEFAULT_TOOL_URL
    try:
        # Redirects must never carry the agent's credential elsewhere, nor may a proxy from the
        # environment: the route is OpenBot's own server, reached directly.
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False, trust_env=False) as client:
            response = await client.post(
                url,
                headers={TOKEN_HEADER: token},
                json={"name": name, "args": arguments, "run": assertion},
            )
        if not response.is_success:
            return ToolReply(
                f"Refused. Tool callback returned HTTP {response.status_code}.{_refusal_reason(response)}",
                True,
            )
        body = response.json()
    # Exception text can carry the URL; report the boundary and the kind of failure, never the request.
    # The member tells the person this reason, so it says what happened rather than "unavailable".
    except httpx.ConnectTimeout:
        return ToolReply(
            f"The tool callback could not be completed: agent-freeduet could not connect to OpenBot's tool "
            f"route within {int(TIMEOUT.connect)} s.",
            True,
        )
    except httpx.TimeoutException:
        return ToolReply(
            f"The tool callback could not be completed: OpenBot's tool route did not answer in time "
            f"(agent-freeduet waits {int(TIMEOUT.read)} s).",
            True,
        )
    except httpx.ConnectError:
        return ToolReply(
            "The tool callback could not be completed: agent-freeduet could not connect to OpenBot's tool route.",
            True,
        )
    except httpx.HTTPError as error:
        return ToolReply(f"The tool callback could not be completed: {type(error).__name__}.", True)
    except ValueError:
        return ToolReply("The tool callback could not be completed: OpenBot's answer was not JSON.", True)
    if not isinstance(body, dict) or not isinstance(body.get("text"), str):
        return ToolReply("The tool callback returned no readable result.", True)
    return ToolReply(body["text"], bool(body.get("isError")))
