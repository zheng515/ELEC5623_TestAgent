import pytest


@pytest.fixture(autouse=True)
def isolated_snapshot_storage(tmp_path, monkeypatch):
    monkeypatch.setenv("REQTEST_REPOSITORY_SNAPSHOT_ROOT", str(tmp_path / "snapshot-storage"))


ACCOUNT = {"name": "Test User", "email": "tester@example.com", "password": "test-passphrase-123"}


def wait_for_run(client, run_id, timeout=5):
    import time

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = client.get(f"/api/v1/runs/{run_id}")
        assert response.status_code == 200, response.text
        run = response.json()
        if run["status"] not in {"queued", "running"}:
            return run
        time.sleep(0.01)
    raise AssertionError("Background run did not reach a terminal state.")


def register(client, **overrides):
    client.headers["Content-Type"] = "application/json"
    response = client.post("/api/v1/auth/register", json={**ACCOUNT, **overrides})
    assert response.status_code == 201, response.text
    return response.json()
