import sqlite3
import time

import pytest
from conftest import ACCOUNT, register
from fastapi.testclient import TestClient

from app.core.auth import COOKIE_NAME, hash_password, token_digest, verify_password
from app.core.config import Settings
from app.main import create_app


@pytest.fixture
def settings(tmp_path):
    return Settings(database_path=tmp_path / "auth.db", llm_enabled=False, _env_file=None)


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings), headers={"Content-Type": "application/json"}) as client:
        yield client


def test_registration_login_logout_and_session_rotation(client):
    user = register(client, email=" Tester@Example.COM ", name=" Test User ")
    assert user["email"] == "tester@example.com"
    assert user["name"] == "Test User"
    assert set(user) == {"id", "name", "email", "created_at"}
    token = client.cookies[COOKIE_NAME]
    assert client.get("/api/v1/auth/me").json() == user
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email": "TESTER@example.com",
            "password": ACCOUNT["password"],
        },
    )
    assert login.status_code == 200
    assert login.json() == user
    assert client.cookies[COOKIE_NAME] != token
    assert "HttpOnly" in login.headers["set-cookie"]
    assert "SameSite=lax" in login.headers["set-cookie"]
    assert "Path=/api/v1" in login.headers["set-cookie"]
    assert login.headers["cache-control"] == "no-store"
    rotated = client.cookies[COOKIE_NAME]
    assert (
        client.get("/api/v1/auth/me", headers={"Cookie": f"{COOKIE_NAME}={token}"}).status_code
        == 401
    )
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert COOKIE_NAME not in client.cookies
    assert client.get("/api/v1/auth/me").status_code == 401
    assert (
        client.get("/api/v1/auth/me", headers={"Cookie": f"{COOKIE_NAME}={rotated}"}).status_code
        == 401
    )
    assert client.post("/api/v1/auth/logout").status_code == 204


def test_passwords_and_session_tokens_are_not_stored_in_plaintext(client):
    register(client)
    token = client.cookies[COOKIE_NAME]
    with client.app.state.store.connection() as db:
        encoded = db.execute("SELECT password_hash FROM users").fetchone()[0]
        stored_token = db.execute("SELECT token_hash FROM sessions").fetchone()[0]
    assert ACCOUNT["password"] not in encoded
    assert verify_password(ACCOUNT["password"], encoded)
    assert not verify_password("wrong-password", encoded)
    assert hash_password(ACCOUNT["password"]) != encoded
    assert stored_token == token_digest(token)
    assert stored_token != token


def test_duplicate_email_and_invalid_credentials(client):
    register(client)
    duplicate = client.post(
        "/api/v1/auth/register", json={**ACCOUNT, "email": "TESTER@example.com"}
    )
    assert duplicate.status_code == 409
    client.post("/api/v1/auth/logout")
    errors = []
    for email in (ACCOUNT["email"], "unknown@example.com"):
        response = client.post("/api/v1/auth/login", json={"email": email, "password": "wrong"})
        assert response.status_code == 401
        assert COOKIE_NAME not in client.cookies
        errors.append(response.json())
    assert errors[0] == errors[1] == {"detail": "Invalid email or password."}


@pytest.mark.parametrize(
    "overrides",
    [
        {"email": "invalid"},
        {"email": "a..b@example.com"},
        {"email": "a@-bad.com"},
        {"email": ".leading@example.com"},
        {"email": "trailing.@example.com"},
        {"email": "Name <user@example.com>"},
        {"email": f"{'a' * 65}@example.com"},
        {"email": f"user@{'a' * 64}.com"},
        {"name": "  "},
        {"password": "short7!"},
        {"password": "x" * 129},
        {"is_admin": True},
    ],
)
def test_registration_validation_does_not_echo_secrets(client, overrides):
    payload = {**ACCOUNT, **overrides}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422
    assert payload["password"] not in response.text
    assert COOKIE_NAME not in client.cookies


@pytest.mark.parametrize(
    ("submitted", "stored"),
    [
        (" User.Name+tag@Example.COM ", "user.name+tag@example.com"),
        ("user@bücher.de", "user@bücher.de"),
    ],
)
def test_standard_email_addresses_are_normalized(client, submitted, stored):
    user = register(client, email=submitted)
    assert user["email"] == stored
    client.post("/api/v1/auth/logout")
    response = client.post(
        "/api/v1/auth/login",
        json={"email": submitted, "password": ACCOUNT["password"]},
    )
    assert response.status_code == 200
    assert response.json()["email"] == stored


def test_eight_character_password_is_accepted(client):
    user = register(client, password="eight888")
    assert user["email"] == ACCOUNT["email"]


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/projects"),
        ("post", "/projects"),
        ("get", "/projects/id"),
        ("get", "/projects/id/runs"),
        ("post", "/projects/id/runs"),
        ("get", "/runs"),
        ("get", "/runs/id"),
        ("get", "/runs/id/report"),
        ("get", "/runs/id/report.html"),
    ],
)
def test_project_and_report_endpoints_require_login(client, method, path):
    response = client.request(method, "/api/v1" + path)
    assert response.status_code == 401


def test_users_cannot_access_each_others_projects_runs_or_reports(client):
    register(client)
    project = client.post(
        "/api/v1/projects", json={"name": "Private", "requirements_text": "Rule"}
    ).json()
    run = client.post(f"/api/v1/projects/{project['id']}/runs").json()
    assert client.get("/api/v1/runs").json() == [run]
    assert client.get(f"/api/v1/runs/{run['id']}/report.html").status_code == 200
    client.post("/api/v1/auth/logout")
    register(client, email="another@example.com")
    assert client.get("/api/v1/projects").json() == []
    assert client.get("/api/v1/runs").json() == []
    for path in (
        f"/projects/{project['id']}",
        f"/projects/{project['id']}/runs",
        f"/runs/{run['id']}",
        f"/runs/{run['id']}/report",
        f"/runs/{run['id']}/report.html",
    ):
        assert client.get("/api/v1" + path).status_code == 404
    assert client.post(f"/api/v1/projects/{project['id']}/runs").status_code == 404


def test_expired_and_forged_sessions_are_rejected(client):
    register(client)
    with client.app.state.store.connection() as db:
        db.execute("UPDATE sessions SET expires_at = ?", (int(time.time()) - 1,))
    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.get("/api/v1/projects").status_code == 401
    client.cookies.clear()
    client.cookies.set(COOKIE_NAME, "forged")
    assert client.get("/api/v1/auth/me").status_code == 401


def test_session_survives_restart_and_secure_cookie_is_configurable(settings):
    secure = settings.model_copy(update={"session_cookie_secure": True})
    with TestClient(create_app(secure), base_url="https://testserver") as first:
        user = register(first)
        token = first.cookies[COOKIE_NAME]
        assert next(item for item in first.cookies.jar if item.name == COOKIE_NAME).secure
    with TestClient(create_app(secure), base_url="https://testserver") as second:
        assert (
            second.get("/api/v1/auth/me", headers={"Cookie": f"{COOKIE_NAME}={token}"}).json()
            == user
        )


def test_cross_site_writes_and_form_posts_are_rejected(client):
    register(client)
    for path in ("/auth/register", "/auth/login", "/auth/logout", "/projects", "/projects/id/runs"):
        assert (
            client.post(
                "/api/v1" + path, json=ACCOUNT, headers={"Origin": "https://evil.example"}
            ).status_code
            == 403
        )
        assert (
            client.post(
                "/api/v1" + path, content="{}", headers={"Content-Type": "text/plain"}
            ).status_code
            == 415
        )
    assert client.get("/api/v1/auth/me").status_code == 200
    allowed = client.post("/api/v1/auth/logout", headers={"Origin": "http://localhost:3000"})
    assert allowed.status_code == 204
    assert allowed.headers["access-control-allow-credentials"] == "true"
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_authentication_throttle_and_expiry(client):
    now = int(time.time())
    store = client.app.state.store
    key = token_digest("testclient")
    for _ in range(20):
        assert store.allow_auth_attempt(key, now)
    response = client.post(
        "/api/v1/auth/login", json={"email": ACCOUNT["email"], "password": "wrong"}
    )
    assert response.status_code == 429
    assert response.headers["retry-after"] == "900"
    assert store.allow_auth_attempt(key, now + 901)


def test_migration_preserves_legacy_data_without_assigning_it_to_new_users(settings):
    with sqlite3.connect(settings.database_path) as db:
        db.execute(
            "CREATE TABLE projects (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, "
            "payload TEXT NOT NULL)"
        )
        db.execute("INSERT INTO projects VALUES ('legacy', '2026-09-01', '{}')")
    for _ in range(2):
        with TestClient(create_app(settings)) as client:
            with client.app.state.store.connection() as db:
                assert db.execute("SELECT id, payload, owner_id FROM projects").fetchall() == [
                    ("legacy", "{}", None)
                ]
    with TestClient(create_app(settings)) as client:
        register(client)
        assert client.get("/api/v1/projects").json() == []
        assert client.get("/api/v1/projects/legacy").status_code == 404
