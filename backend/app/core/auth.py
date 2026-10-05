"""Password hashing and revocable, server-side cookie sessions."""

import hashlib
import hmac
import secrets
import time
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response
from fastapi.security import APIKeyCookie

from app.schemas import User

COOKIE_NAME = "reqtest_session"
cookie = APIKeyCookie(name=COOKIE_NAME, auto_error=False)


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=bytes.fromhex(salt),
        n=131072,
        r=8,
        p=1,
        maxmem=256 * 1024 * 1024,
    ).hex()
    return f"scrypt${salt}${digest}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, salt, _ = encoded.split("$")
        return algorithm == "scrypt" and hmac.compare_digest(hash_password(password, salt), encoded)
    except (ValueError, TypeError):
        return False


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user(request: Request, token: Annotated[str | None, Depends(cookie)]) -> User:
    user = (
        request.app.state.store.session_user(token_digest(token), int(time.time()))
        if token
        else None
    )
    if user is None:
        raise HTTPException(401, "Please sign in to continue.")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def start_session(request: Request, response: Response, user: User):
    store = request.app.state.store
    settings = request.app.state.settings
    old_token = request.cookies.get(COOKIE_NAME)
    if old_token:
        store.delete_session(token_digest(old_token))
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    store.create_session(token_digest(token), user.id, now + settings.session_ttl_seconds, now)
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=settings.session_ttl_seconds,
        path="/api/v1",
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
    )
