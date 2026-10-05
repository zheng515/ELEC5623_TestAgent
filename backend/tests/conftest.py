ACCOUNT = {"name": "Test User", "email": "tester@example.com", "password": "test-passphrase-123"}


def register(client, **overrides):
    client.headers["Content-Type"] = "application/json"
    response = client.post("/api/v1/auth/register", json={**ACCOUNT, **overrides})
    assert response.status_code == 201, response.text
    return response.json()
