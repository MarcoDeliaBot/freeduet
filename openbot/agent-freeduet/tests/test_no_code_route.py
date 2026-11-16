"""No one-time code passes through FreeDuet (docs/design/first-start.md, decision D1, option b).

The card shows the command to copy and the person signs in in a terminal, so the service has no route that starts a
sign-in or takes a code, and the one route that looks at Claude takes no body. If a later slice adds such a route
(S3, behind a setting that is off by default), this test fails until it is changed on purpose.
"""

import re

from helpers import MANAGED_TOKEN

AUTH = {"x-openbot-agent-token": MANAGED_TOKEN}
CANARY = "ONE-TIME-CODE-CANARY-7f3a"
FORBIDDEN = re.compile(r"login|code|token|secret|credential|oauth", re.I)


def test_no_route_names_a_sign_in_a_code_or_a_token(client):
    paths = [getattr(route, "path", "") for route in client.app.routes]
    assert "/engines/claude/check" in paths
    assert [path for path in paths if FORBIDDEN.search(path)] == []


def test_the_check_route_ignores_a_body_and_never_echoes_it(client, fake_cli):
    response = client.post("/engines/claude/check", headers=AUTH, json={"code": CANARY})
    assert response.status_code == 200, response.text
    assert CANARY not in response.text
    # Nothing the fake CLI was started with carries it either.
    assert all(CANARY not in path.read_text() for path in fake_cli.dir.glob("*.json"))
