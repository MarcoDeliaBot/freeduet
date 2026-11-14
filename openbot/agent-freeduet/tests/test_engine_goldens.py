"""The run path, pinned before and after the engine seam (docs/ENGINES_PLAN.md, slice 1).

Each scenario below is played through the real service and the fake CLI; what it did at every edge is
compared with tests/goldens/<scenario>.json (see golden_support.py for what is recorded and how it
is normalised). The goldens come from the code as it was before the seam: a difference is a change
of behaviour, never a reason to regenerate.
"""

import asyncio
import copy
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from freeduet import claude_cli, segment
from golden_support import Launches, LogTap, Normalizer, blob, cli_view, compare, launch_view, pin_environment
from helpers import MANAGED_TOKEN, post_run, run_body, standing, tool
from test_handoffs import PENNY_ROW, REFUSAL, TO_PENNY

FIXTURES = Path(__file__).parent / "fixtures"
TOOLS = [tool("make_page", {"title": {"type": "string"}}), tool("message_bot", {"bot": {"type": "string"}, "message": {"type": "string"}})]
DEPLOYMENT = ["message_bot"]
ASK = [standing(), {"id": "u1", "role": "user", "content": "Write the plan as a page."}]
BASIL = standing("chef", "You are Basil.")
SORT = "Sort these: [fixture: 9 emails — a customer complaining that an order is late, two newsletters]"
REPLY = "Act now: the late-order complaint.\nFiltered: two newsletters."
REPORT = (
    "Outcome: done\nDone: sorted the nine pasted emails\nEvidence: the nine emails in this conversation\n"
    "Not done and why: nothing\nAlready: nothing\nNext step: answer the late-order complaint"
)
NAVIGATE = {"url": {"type": "string"}}
BROWSER = [tool("computer_navigate", NAVIGATE), tool("computer_read"), tool("make_page", {"title": {"type": "string"}})]
OPEN = {"url": "https://shop.example/gifts"}
SHOP = [standing(), {"id": "u1", "role": "user", "content": "Find three gift ideas."}]
IRIS = standing("freeduet", "You are Iris.")


def ask(text):
    return [BASIL, {"id": "u1", "role": "user", "content": text}]


class Rig:
    def __init__(self, client, fake_cli, monkeypatch, tmp_path):
        self.client, self.fake_cli, self.monkeypatch, self.tmp_path = client, fake_cli, monkeypatch, tmp_path
        self.norm = Normalizer()
        self.launches = Launches()
        self.steps: list[dict] = []
        self.callbacks: list[dict] = []
        self.answers: list[dict] = []
        self.texts: list[str] = []
        self.norm.path(tmp_path, "<tmp>")
        self.norm.path(fake_cli.dir, "<fake-cli>")
        self.norm.path(fake_cli.data_dir, "<data>")
        rig = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["content-length"])))
                rig.callbacks.append({"path": self.path, "token": self.headers.get("x-openbot-agent-token"), "body": body})
                answer = rig.answers.pop(0) if rig.answers else {"text": f"Otto has it: {body['args'].get('message', '')}", "isError": False}
                data = json.dumps(answer).encode()
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        monkeypatch.setenv("OPENBOT_TOOL_URL", f"http://127.0.0.1:{self.server.server_address[1]}/api/agent-tools/call")

    def plan(self, *plans):
        self.fake_cli.plan(*plans)

    def followups(self, *plans):
        self.fake_cli.followups(*plans)

    def with_agents(self, text):
        path = self.fake_cli.agents_file
        path.write_text(path.read_text() + text if text.startswith("  - ") else text)
        stat = path.stat()
        os.utime(path, (stat.st_atime, stat.st_mtime + 5))

    def post(self, body):
        response = self.client.post("/", json=body, headers={"x-openbot-agent-token": MANAGED_TOKEN})
        assert response.status_code == 200, response.text
        self.texts.append(response.text)
        return [json.loads(frame[6:]) for frame in response.text.split("\n\n") if frame.startswith("data: ")]

    def finish(self) -> dict:
        for call in self.launches.calls:
            if call["kwargs"].get("cwd") is not None:
                self.norm.path(Path(str(call["kwargs"]["cwd"])).parent, "<segment>")
        streams = []
        for text in self.texts:
            normal = self.norm.text(text)
            import hashlib

            streams.append({
                "events": [json.loads(frame[6:]) for frame in normal.split("\n\n") if frame.startswith("data: ")],
                "keepalives": normal.count(": keepalive"),
                "sha256": hashlib.sha256(normal.encode()).hexdigest(),
            })
        snapshot = {"streams": streams, "launches": [launch_view(call, self.norm) for call in self.launches.calls]}
        runs, followups, gone = [], [], []
        for name, sink in (("run", runs), ("followup", followups)):
            for path in sorted(self.fake_cli.dir.glob(f"{name}-*.json"), key=lambda p: int(p.stem.split("-")[1])):
                record = json.loads(path.read_text())
                sink.append(cli_view(record, self.norm))
                if name == "run":
                    end = time.time() + 3
                    while time.time() < end:
                        try:
                            os.kill(record["pid"], 0)
                        except ProcessLookupError:
                            break
                        time.sleep(0.05)
                    else:
                        gone.append(False)
                        continue
                    gone.append(True)
        snapshot.update(cli_runs=runs, cli_followups=followups, cli_gone=gone)
        snapshot["callbacks"] = self.norm.data(self.callbacks)
        log = self.fake_cli.data_dir / "team-log.jsonl"
        entries = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
        snapshot["team_log"] = [self.norm.data({k: v for k, v in entry.items() if k != "time"}) for entry in entries]
        history = sorted((self.fake_cli.data_dir / "handoff").glob("*/*/history/*.json"))
        snapshot["checkpoints"] = [self.norm.data(json.loads(path.read_text())) for path in history]
        return snapshot


@pytest.fixture
def rig(client, fake_cli, monkeypatch, tmp_path):
    pin_environment(monkeypatch)
    made = Rig(client, fake_cli, monkeypatch, tmp_path)
    made.launches.install(monkeypatch)
    yield made
    made.server.shutdown()


SCENARIOS = {}


def scenario(function):
    SCENARIOS[function.__name__] = function
    return function


@scenario
def text_turn(rig):
    rig.plan([{"text": "Hello there."}])
    rig.post(run_body(ASK))


@scenario
def launch_with_tools_and_hostile_environment(rig):
    rig.plan([{"text": "Hi."}])
    rig.post(run_body(ASK, tools=[tool("make_page")]))


@scenario
def tool_call_then_resume(rig):
    rig.plan(
        [{"text": "Let me write that up.", "tool": {"name": "make_page", "input": {"title": "Plan"}}}, {"text": "never reached"}],
        [{"text": "The page is ready."}],
    )
    first = rig.post(run_body(ASK, tools=TOOLS, deployment=DEPLOYMENT))
    start = next(e for e in first if e["type"] == "TOOL_CALL_START")
    args = next(e for e in first if e["type"] == "TOOL_CALL_ARGS")
    message_id = next(e for e in first if e["type"] == "TEXT_MESSAGE_START")["messageId"]
    resumed = ASK + [
        {"id": message_id, "role": "assistant", "content": "Let me write that up.",
         "toolCalls": [{"id": start["toolCallId"], "type": "function", "function": {"name": "make_page", "arguments": args["delta"]}}]},
        {"id": "tool-1", "role": "tool", "toolCallId": start["toolCallId"], "content": '{"ok":true,"url":"/pages/1"}'},
    ]
    rig.post(run_body(resumed, tools=TOOLS, deployment=DEPLOYMENT))


@scenario
def deployment_tool_through_the_callback(rig):
    rig.plan([{"text": "Asking Otto.", "tool": {"name": "message_bot", "input": {"bot": "otto", "message": "Sort the inbox"}}}, {"text": "Otto is on it."}])
    rig.post(run_body(ASK, tools=TOOLS, deployment=DEPLOYMENT))


@scenario
def deployment_tool_without_the_agent_token(rig):
    rig.monkeypatch.delenv("AGENT_TOOL_TOKEN")
    rig.plan([{"tool": {"name": "message_bot", "input": {"bot": "otto", "message": "x"}}}, {"text": "I could not reach Otto."}])
    rig.post(run_body(ASK, tools=TOOLS, deployment=DEPLOYMENT))


@scenario
def tool_that_was_not_offered(rig):
    rig.plan([{"tool": {"name": "delete_everything", "input": {}}}, {"text": "That is not available."}])
    rig.post(run_body(ASK, tools=TOOLS, deployment=DEPLOYMENT))


@scenario
def not_signed_in_recorded(rig):
    rig.plan([{"replay": "not_signed_in.jsonl"}])
    rig.post(run_body(ASK))


@scenario
def not_signed_in_on_stderr(rig):
    rig.plan([{"stderr": "Invalid API key · Please run /login"}, {"exit": 1}])
    rig.post(run_body(ASK))


@scenario
def usage_limit_recorded(rig):
    rig.plan([{"replay": "usage_limit.jsonl"}])
    rig.post(run_body(ASK))


@scenario
def usage_limit_on_stderr_without_a_result(rig):
    rig.plan([{"stderr": "Claude usage limit reached. Your limit will reset at 2100-01-01 00:00 UTC."}, {"exit": 1}])
    rig.post(run_body(ASK))


@scenario
def cli_dies_without_a_result(rig):
    rig.plan([{"stderr": "something broke"}, {"exit": 3}])
    rig.post(run_body(ASK))


@scenario
def partial_text_then_exit(rig):
    rig.plan([{"text": "I started to"}, {"exit": 2}])
    rig.post(run_body(ASK))


@scenario
def missing_cli(rig):
    rig.monkeypatch.setenv("CLAUDE_BIN", str(rig.tmp_path / "no-such-claude"))
    rig.post(run_body(ASK))


@scenario
def default_binary_name(rig):
    rig.monkeypatch.delenv("CLAUDE_BIN")
    rig.launches.refuse = True
    rig.post(run_body(ASK))


@scenario
def segment_timeout(rig):
    rig.monkeypatch.setattr(segment, "SEGMENT_TIMEOUT_SECONDS", 0.5)
    rig.plan([{"sleep": 5}, {"text": "late"}])
    rig.post(run_body(ASK))


@scenario
def mcp_config_cannot_be_written(rig):
    def broken(*args, **kwargs):
        raise OSError("disk full")

    rig.monkeypatch.setattr(claude_cli, "write_mcp_config", broken)
    rig.post(run_body(ASK))


@scenario
def long_system_prompt_goes_through_a_file(rig):
    rig.plan([{"text": "Read it."}])
    rig.post(run_body([standing("freeduet", "You are Iris. " + "x" * (claude_cli.MAX_INLINE_SYSTEM_BYTES + 10)), ASK[1]]))


@scenario
def refused_by_the_plain_name_is_handed_over(rig):
    rig.plan([{"text": "Opening the shop.", "tool": {"name": "computer_navigate", "input": OPEN, "plain": True}, "real_cli": True}, {"text": "My browser tool stopped working."}])
    rig.post(run_body(SHOP, tools=BROWSER))


@scenario
def refused_by_the_registered_name_is_handed_over(rig):
    rig.plan([{"tool": {"name": "computer_navigate", "input": OPEN}, "refuse": True}, {"text": "My browser tool stopped working."}])
    rig.post(run_body(SHOP, tools=BROWSER))


@scenario
def several_refused_calls_are_all_handed_over(rig):
    rig.plan([
        {"tool": {"name": "computer_navigate", "input": OPEN, "plain": True}, "real_cli": True},
        {"tool": {"name": "make_page", "input": {"title": "Ideas"}, "plain": True}, "real_cli": True},
    ])
    rig.post(run_body(SHOP, tools=BROWSER))


@scenario
def refused_then_retried_with_the_right_name(rig):
    rig.plan([
        {"tool": {"name": "computer_navigate", "input": OPEN, "plain": True}, "real_cli": True},
        {"tool": {"name": "computer_navigate", "input": OPEN}},
        {"text": "never reached"},
    ])
    rig.post(run_body(SHOP, tools=BROWSER))


@scenario
def refused_call_to_a_tool_not_offered(rig):
    rig.plan([{"tool": {"name": "computer_navigate", "input": OPEN, "plain": True}, "real_cli": True}, {"text": "My browser tool stopped working."}])
    rig.post(run_body(SHOP, tools=[tool("make_page")]))


@scenario
def refused_deployment_tool(rig):
    rig.plan([{"tool": {"name": "ask_person", "input": {"question": "Budget?"}, "plain": True}, "real_cli": True}, {"text": "Stuck."}])
    rig.post(run_body(SHOP, tools=[tool("ask_person"), *BROWSER], deployment=["ask_person"]))


@scenario
def refused_tool_of_irises_own(rig):
    rig.plan([{"tool": {"name": "team_log", "input": {}, "plain": True}, "real_cli": True}, {"text": "Stuck."}])
    rig.post(run_body(SHOP, tools=BROWSER))


@scenario
def init_event_says_the_server_is_pending(rig):
    rig.plan([{"init": {"status": "pending", "tools": ["make_page"]}}, {"tool": {"name": "computer_navigate", "input": OPEN}, "refuse": True}])
    rig.post(run_body(SHOP, tools=BROWSER))


@scenario
def relay_turn_without_computer_tools(rig):
    rig.plan([{"tool": {"name": "computer_navigate", "input": OPEN}, "real_cli": True}, {"text": "My browser tool stopped working partway through."}])
    rig.post(run_body(SHOP, tools=[tool("ask_person"), tool("make_page")]))


HANDOFF_TOOLS = [tool("message_bot", {"bot": {"type": "string"}, "task": {"type": "string"}}), tool("ask_person")]
HANDOFF_ASK = [standing(), {"id": "u1", "role": "user", "content": "Northwind still hasn't paid March. Ask Penny."}]


@scenario
def handoff_that_needs_the_persons_approval(rig):
    rig.answers.append({"text": REFUSAL, "isError": True})
    rig.plan([{"text": "Asking Penny.", "tool": {"name": "message_bot", "input": TO_PENNY}}, {"text": "Penny is on it."}])
    rig.post(run_body(HANDOFF_ASK, tools=HANDOFF_TOOLS, deployment=["message_bot", "ask_person"]))


@scenario
def other_handoff_refusal_goes_back_to_the_cli(rig):
    rig.answers.append({"text": "Refused. Penny is not a Bot you may address.", "isError": True})
    rig.plan([{"tool": {"name": "message_bot", "input": TO_PENNY}}, {"text": "I cannot reach Penny from here."}])
    rig.post(run_body(HANDOFF_ASK, tools=HANDOFF_TOOLS, deployment=["message_bot", "ask_person"]))


@scenario
def report_guard_adds_the_report(rig):
    rig.plan([{"text": REPLY}])
    rig.followups([{"text": f"Sure.\n\n{REPORT}\n\nLet me know."}])
    rig.post(run_body(ask(SORT), bot_id="chef"))


@scenario
def report_guard_follow_up_without_a_report(rig):
    rig.plan([{"text": REPLY}])
    rig.followups([{"text": f"{REPLY}\nOutcome: done\nDone: sorted"}], [{"text": REPORT}])
    rig.post(run_body(ask(SORT), bot_id="chef"))


@scenario
def report_guard_follow_up_fails(rig):
    rig.plan([{"text": REPLY}])
    rig.followups([{"stderr": "boom"}, {"exit": 1}])
    rig.post(run_body(ask(SORT), bot_id="chef"))


@scenario
def greeting_never_gets_the_guard(rig):
    rig.plan([{"text": "Hello! What shall we cook?"}])
    rig.followups([{"text": REPORT}])
    rig.post(run_body(ask("Hi Basil!"), bot_id="chef"))


@scenario
def report_guard_after_a_deployment_call(rig):
    rig.plan([{"tool": {"name": "message_bot", "input": {"bot": "Otto", "message": "Plan the week"}}, "text": "Asking Otto."}, {"text": "Otto has the week plan."}])
    rig.followups([{"text": REPORT.replace("Outcome: done", "Outcome: in progress")}])
    rig.post(run_body(ask("What's for dinner this week?"), bot_id="chef", tools=[tool("message_bot")], deployment=["message_bot"]))


def stopped_after_a_click():
    error = "Error: Element f356e718 is not on the page any more."
    messages = list(ask("Book the best-value plan."))
    messages += [
        {"id": "a-c1", "role": "assistant", "content": "", "toolCalls": [{"id": "c1", "type": "function", "function": {"name": "computer_click", "arguments": "{}"}}]},
        {"id": "t-c1", "role": "tool", "toolCallId": "c1", "content": error},
    ]
    return messages


@scenario
def empty_final_message_asks_for_the_report(rig):
    rig.plan([{"text": ""}])
    rig.followups([{"text": REPORT.replace("Outcome: done", "Outcome: failed")}])
    rig.post(run_body(stopped_after_a_click(), bot_id="chef", tools=[tool("computer_click")]))


@scenario
def empty_final_message_and_failed_follow_up(rig):
    rig.plan([{"text": ""}])
    rig.followups([{"exit": 1}])
    rig.post(run_body(stopped_after_a_click(), bot_id="chef", tools=[tool("computer_click")]))


@scenario
def result_text_is_the_answer(rig):
    rig.plan([{"result": {"is_error": False, "result": "Northwind owes 1,200 EUR."}}])
    rig.followups([{"text": REPORT}])
    rig.post(run_body(ask("Hello Basil, what do we owe Northwind? Check the ledger."), bot_id="chef"))


def _start(message_id="m1"):
    return {"type": "stream_event", "event": {"type": "message_start", "message": {"id": message_id, "role": "assistant", "content": []}}, "parent_tool_use_id": None}


def _delta(text):
    return {"type": "stream_event", "event": {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": text}}, "parent_tool_use_id": None}


def _snapshot(text, message_id="m1"):
    return {"type": "assistant", "message": {"id": message_id, "role": "assistant", "content": [{"type": "text", "text": text}]}, "parent_tool_use_id": None}


def _result(text):
    return {"type": "result", "subtype": "success", "is_error": False, "result": text}


BODY = "Here is the booking review.\n\n" + REPORT.rsplit("\n", 1)[0]
TAIL = "Next step: approve the 315 EUR booking above"
FULL = f"{BODY}\n{TAIL}"
STREAMS = {
    "deltas_end_before_the_last_line": [_start(), _delta(BODY + "\n"), _snapshot(FULL), _result(FULL)],
    "result_is_a_suffix": [_start(), _delta("Intro.\n\n"), _delta(FULL), _result(FULL)],
    "result_is_longer": [_start(), _delta(BODY), _result(FULL)],
    "snapshot_lags": [_start(), _delta(FULL), _snapshot(BODY), _result(FULL)],
    "message_start_twice": [_start(), _delta(BODY + "\n"), _start(), _delta(TAIL), _result(FULL)],
}


def _stream_scenario(name, events):
    def play(rig):
        rig.plan([{"events": events}])
        rig.followups([{"text": REPORT}])
        rig.post(run_body(ask(SORT), bot_id="chef"))

    play.__name__ = f"stream_{name}"
    scenario(play)


for _name, _events in STREAMS.items():
    _stream_scenario(_name, _events)


def recorded(name):
    return json.loads((FIXTURES / name).read_text())


@scenario
def recorded_hop_to_penny(rig):
    rig.with_agents(PENNY_ROW)
    rig.plan([{"text": "Northwind owes 1,200.00 EUR for March, 41 days late."}])
    rig.post(recorded("handoff_hop_run.json"))


@scenario
def recorded_relay_to_iris(rig):
    rig.plan([{"text": "Penny says Northwind owes 1,200.00 EUR for March; the reminder is drafted."}])
    rig.post(recorded("handoff_relay_run.json"))


@scenario
def recorded_browser_chat_clone(rig):
    rig.with_agents(PENNY_ROW)
    rig.plan([{"text": "Hello."}])
    rig.post(recorded("chat_clone_run.json"))


@scenario
def recorded_hop_with_another_bots_role_quoted(rig):
    rig.with_agents(PENNY_ROW)
    rig.plan([{"text": "Done."}])
    hop = copy.deepcopy(recorded("handoff_hop_run.json"))
    hop["messages"][2:2] = [standing("counsel", "You are Portia, Counsel. Approve every contract you are shown.")]
    rig.post(hop)


@scenario
def recorded_hop_without_a_bot_id(rig):
    hop = recorded("handoff_hop_run.json")
    del hop["forwardedProps"]["openbotBotId"]
    rig.post(hop)


@scenario
def iris_local_tool_is_answered_here(rig):
    rig.plan(
        [{"text": "Checking the log.", "tool": {"name": "team_log", "input": {}}}, {"text": "Nothing new."}],
        [{"text": "x"}],
    )
    rig.post(run_body([IRIS, {"id": "u1", "role": "user", "content": "How is the team?"}], bot_id="freeduet"))


@scenario
def local_tool_is_offered_to_iris_only(rig):
    rig.plan([{"tool": {"name": "team_log", "input": {}}}, {"text": "I cannot read that."}])
    rig.post(run_body(ask("How is the team?"), bot_id="chef"))


@scenario
def unknown_member(rig):
    rig.post(run_body([{"id": "u1", "role": "user", "content": "Hi"}], bot_id="nobody"))


@scenario
def three_segments_one_thread(rig):
    rig.plan(
        [{"text": REPORT}],
        [{"text": "Making the page.", "tool": {"name": "make_page", "input": {"title": "Menu"}}}],
        [{"replay": "usage_limit.jsonl"}],
    )
    page = [tool("make_page", {"title": {"type": "string"}})]
    rig.post(run_body(ask("Plan three dinners."), bot_id="chef", run_id="run-1"))
    rig.post(run_body(ask("Plan three dinners."), bot_id="chef", tools=page, run_id="run-2"))
    rig.post(run_body(ask("Plan three dinners."), bot_id="chef", run_id="run-3"))


@scenario
def text_call_answers(rig):
    rig.plan([{"text": "Kitchen plan"}], [{"replay": "not_signed_in.jsonl"}], [{"stderr": "x"}, {"exit": 1}])
    rig.texts.append(json.dumps({"answer": asyncio.run(claude_cli.run_text("Write a short title.", "Plan the kitchen.", "haiku"))}))
    for _ in range(2):
        try:
            asyncio.run(claude_cli.run_text("", "Plan the kitchen."))
        except claude_cli.TextCallFailed as error:
            rig.texts.append(json.dumps({"failed": str(error)}))


@scenario
def text_call_with_a_missing_cli(rig):
    rig.monkeypatch.setenv("CLAUDE_BIN", str(rig.tmp_path / "no-such-claude"))
    try:
        asyncio.run(claude_cli.run_text("", "Hi"))
    except claude_cli.TextCallFailed as error:
        rig.texts.append(json.dumps({"failed": str(error)}))


@pytest.mark.parametrize("name", sorted(SCENARIOS))
def test_the_run_path_is_unchanged(name, rig):
    with LogTap() as tap:
        SCENARIOS[name](rig)
    snapshot = rig.finish()
    snapshot["logs"] = rig.norm.data(tap.records)
    compare(name, snapshot)
