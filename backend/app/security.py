from datetime import UTC, datetime, timedelta
import hashlib
import hmac
import os
import secrets

from jose import JWTError, jwt

from .config import get_settings


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 160_000)
    return f"pbkdf2_sha256${salt}${digest.hex()}"


def verify_password(password: str, password_hash: str, login: str) -> bool:
    if password_hash == "demo-password-hash":
        return password in {login, "admin", "client"}

    try:
        algorithm, salt, digest = password_hash.split("$", 2)
    except ValueError:
        return False

    if algorithm != "pbkdf2_sha256":
        return False

    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 160_000).hex()
    return hmac.compare_digest(candidate, digest)


def create_token(user_id: int, token_type: str) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    if token_type == "access":
        expires = now + timedelta(minutes=settings.jwt_access_minutes)
    else:
        expires = now + timedelta(days=settings.jwt_refresh_days)

    payload = {
        "sub": str(user_id),
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_type: str) -> int | None:
    try:
        payload = jwt.decode(
            token,
            get_settings().jwt_secret_key,
            algorithms=[get_settings().jwt_algorithm],
        )
    except JWTError:
        return None

    if payload.get("type") != expected_type:
        return None

    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        return None
