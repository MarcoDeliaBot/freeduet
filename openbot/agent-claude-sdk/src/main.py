"""Claude Agent SDK as a Bot, through `ag-ui-claude-sdk`.

Upstream, this is the row where a plan token can stand in for a key. FreeDuet removes that option:
this harness runs on `ANTHROPIC_API_KEY` only (see `_refuse_plan_token` and docs/PROVIDERS.md).
"""

import hmac
import os

from ag_ui_claude_sdk import add_claude_fastapi_endpoint
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .adapter import OpenBotClaudeAgentAdapter

TOKEN_HEADER = "x-openbot-agent-token"


def _refuse_plan_token() -> None:
    """FreeDuet: an API key only, never a Claude plan token.

    Storing the token `claude setup-token` mints breaks Anthropic's terms, so FreeDuet removes the
    option (docs/PROVIDERS.md). The token is dropped from this process before the SDK can read it,
    and the log says why. A person's Claude plan reaches FreeDuet only through the official Claude
    Code CLI, signed in by the person, which the subscription router starts (agent-freeduet).
    """
    if os.environ.pop("CLAUDE_CODE_OAUTH_TOKEN", None):
        print(
            "FreeDuet ignores CLAUDE_CODE_OAUTH_TOKEN: storing a Claude plan token breaks "
            "Anthropic's terms. See docs/PROVIDERS.md.",
            flush=True,
        )
    if not (os.environ.get("ANTHROPIC_API_KEY") or "").strip():
        raise SystemExit("Set ANTHROPIC_API_KEY. See docs/PROVIDERS.md.")


_refuse_plan_token()

app = FastAPI()


@app.middleware("http")
async def refuse_without_the_server_token(request: Request, call_next):
    if request.url.path != "/health":
        expected = (os.environ.get("MANAGED_AGENT_TOKEN") or "").strip()
        offered = (request.headers.get(TOKEN_HEADER) or "").strip()
        if not expected or not hmac.compare_digest(offered.encode("utf-8"), expected.encode("utf-8")):
            return JSONResponse({"error": "unauthorised"}, status_code=401)
    return await call_next(request)


@app.get("/health")
async def health():
    return {"ok": True, "harness": "claude-agent-sdk"}


add_claude_fastapi_endpoint(
    app=app,
    adapter=OpenBotClaudeAgentAdapter(name="openbot"),
    path="/",
)

model_adapter = OpenBotClaudeAgentAdapter(name="openbot-model", model_only=True)
add_claude_fastapi_endpoint(
    app=app,
    adapter=model_adapter,
    path="/model",
)


class CancelModelRun(BaseModel):
    threadId: str = Field(min_length=1, max_length=128)


@app.post("/model/cancel")
async def cancel_model_run(request: CancelModelRun):
    await model_adapter.interrupt(request.threadId)
    return {"ok": True}
