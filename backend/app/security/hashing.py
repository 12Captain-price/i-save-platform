"""Password hashing using bcrypt directly.

bcrypt is installed as a backend dependency. We call bcrypt directly (rather
than via passlib) because passlib's bcrypt backend detection is unreliable on
newer Python versions. If bcrypt is not available in a deployment, these
functions raise a clear error instead of silently falling back to plaintext
passwords.
"""
try:
    import bcrypt as _bcrypt
except ImportError as exc:  # pragma: no cover - deployment configuration issue
    raise RuntimeError(
        "bcrypt is required for password hashing. Install the backend "
        "dependencies (see backend/requirements.txt)."
    ) from exc


def hash_password(password: str) -> str:
    """Return a bcrypt hash of ``password`` suitable for storage."""
    return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Return True if ``plain_password`` matches ``hashed_password``."""
    try:
        return _bcrypt.checkpw(
            plain_password.encode("utf-8"), hashed_password.encode("utf-8")
        )
    except ValueError:
        # e.g. hashed password uses an unsupported bcrypt version
        return False
