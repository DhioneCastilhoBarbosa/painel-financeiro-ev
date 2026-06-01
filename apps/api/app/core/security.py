from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from jwt.exceptions import InvalidTokenError  # noqa: F401 — re-exportado para deps/auth
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _create_token(data: dict[str, Any], expires_delta: timedelta) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + expires_delta
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_access_token(user_id: str, organization_id: str) -> str:
    return _create_token(
        {"sub": user_id, "org": organization_id, "type": "access"},
        timedelta(minutes=settings.access_token_expire_minutes),
    )


def create_refresh_token(user_id: str) -> str:
    return _create_token(
        {"sub": user_id, "type": "refresh"},
        timedelta(days=settings.refresh_token_expire_days),
    )


def create_email_token(email: str, purpose: str) -> str:
    return _create_token(
        {"email": email, "purpose": purpose},
        timedelta(hours=1),
    )


def decode_token(token: str) -> dict[str, Any]:
    """Raises jwt.exceptions.InvalidTokenError if invalid or expired."""
    return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
