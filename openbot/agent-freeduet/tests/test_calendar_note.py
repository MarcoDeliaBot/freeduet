"""D53: a run that holds the Gmail app-password mailbox tools but no calendar tool is told once that no
calendar is connected (the server leaves `calendar_list_events` out for a person who pasted no calendar
address, server/src/plugins/tools.ts). The note appears only then."""

from freeduet import tool_notes
from freeduet.agui import RunInput
from helpers import tool


def run_with(*names: str) -> RunInput:
    return RunInput(
        thread_id="t",
        run_id="r",
        messages=[{"role": "user", "content": "hello"}],
        tools=[tool(name) for name in names],
    )


MAIL = "mcp__google-imap__gmail_search_messages"
CALENDAR = "mcp__google-imap__calendar_list_events"


def test_mailbox_tools_without_a_calendar_tool_get_the_note():
    notes = tool_notes.calendar_notes_for(run_with(MAIL))
    assert notes == [tool_notes.CALENDAR_NOT_CONNECTED_NOTE]
    assert "Connections page" in notes[0]


def test_a_connected_calendar_gets_no_note():
    assert tool_notes.calendar_notes_for(run_with(MAIL, CALENDAR)) == []


def test_a_run_with_no_app_password_mailbox_gets_no_note():
    assert tool_notes.calendar_notes_for(run_with()) == []
    assert tool_notes.calendar_notes_for(run_with("mcp__google-workspace__gmail_search_messages")) == []
    assert tool_notes.calendar_notes_for(run_with("computer_navigate")) == []
