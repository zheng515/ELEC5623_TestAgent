import sqlite3
import time
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request, Response

from app.core.auth import (
    COOKIE_NAME,
    CurrentUser,
    hash_password,
    start_session,
    token_digest,
    verify_password,
)
from app.schemas import Credentials, RegisterRequest, User

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def limit_attempts(request: Request):
    # Do not trust forwarded IP headers supplied directly by clients.
    address = request.client.host if request.client else "unknown"
    if not request.app.state.store.allow_auth_attempt(token_digest(address), int(time.time())):
        raise HTTPException(
            429,
            "Too many sign-in attempts. Try again in 15 minutes.",
            headers={"Retry-After": "900"},
        )


@router.post("/register", response_model=User, status_code=201)
def register(payload: RegisterRequest, request: Request, response: Response):
    limit_attempts(request)
    user = User(
        id=str(uuid4()), name=payload.name, email=payload.email, created_at=datetime.now(UTC)
    )
    password_hash = hash_password(payload.password.get_secret_value())
    try:
        request.app.state.store.create_user(user, password_hash)
    except sqlite3.IntegrityError as error:
        raise HTTPException(409, "An account with this email already exists.") from error
    start_session(request, response, user)
    return user


@router.post("/login", response_model=User)
def login(payload: Credentials, request: Request, response: Response):
    limit_attempts(request)
    record = request.app.state.store.find_credentials(payload.email)
    # Run the same expensive hash even for unknown accounts.
    encoded = record[1] if record else f"scrypt${'0' * 32}${'0' * 128}"
    valid = verify_password(payload.password.get_secret_value(), encoded)
    if not record or not valid:
        raise HTTPException(401, "Invalid email or password.")
    user = record[0]
    start_session(request, response, user)
    return user


@router.get("/me", response_model=User)
def me(user: CurrentUser):
    return user


@router.post("/logout", status_code=204)
def logout(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    if token:
        request.app.state.store.delete_session(token_digest(token))
    response = Response(status_code=204)
    response.delete_cookie(
        COOKIE_NAME,
        path="/api/v1",
        httponly=True,
        secure=request.app.state.settings.session_cookie_secure,
        samesite="lax",
    )
    return response
