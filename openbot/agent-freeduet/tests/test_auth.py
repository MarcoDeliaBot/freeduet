"""POST / is refused without the managed token (contract §3: x-openbot-agent-token)."""

from helpers import MANAGED_TOKEN, run_body, standing


def _post(client, headers):
    return client.post("/", json=run_body([standing(), {"id": "u1", "role": "user", "content": "Hi"}]), headers=headers)


def test_health_needs_no_token(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_a_run_without_the_token_is_refused_before_anything_starts(client, fake_cli):
    assert _post(client, {}).status_code == 401
    assert not (fake_cli.dir / "count").exists()


def test_a_run_with_the_wrong_token_is_refused(client, fake_cli):
    assert _post(client, {"x-openbot-agent-token": "not-the-token"}).status_code == 401
    assert _post(client, {"x-openbot-agent-token": MANAGED_TOKEN + "x"}).status_code == 401
    assert not (fake_cli.dir / "count").exists()


def test_no_configured_token_lets_nobody_in(client, monkeypatch):
    monkeypatch.delenv("MANAGED_AGENT_TOKEN")
    assert _post(client, {"x-openbot-agent-token": ""}).status_code == 401
    assert _post(client, {"x-openbot-agent-token": MANAGED_TOKEN}).status_code == 401


def test_other_paths_need_the_token_too(client):
    assert client.get("/anything").status_code == 401


def test_a_body_that_is_not_a_run_is_a_400(client):
    headers = {"x-openbot-agent-token": MANAGED_TOKEN}
    assert client.post("/", content=b"not json", headers=headers).status_code == 400
    assert client.post("/", json={"threadId": "t"}, headers=headers).status_code == 400
