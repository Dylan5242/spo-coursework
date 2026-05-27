from functools import lru_cache
import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env_file(BASE_DIR / ".env")
load_env_file(BASE_DIR / "backend" / ".env")


class Settings:
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/tv_time",
    )
    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", "dev-secret-change-me")
    jwt_algorithm: str = "HS256"
    jwt_access_minutes: int = int(os.getenv("JWT_ACCESS_MINUTES", "30"))
    jwt_refresh_days: int = int(os.getenv("JWT_REFRESH_DAYS", "7"))
    frontend_origins: list[str] = [
        origin.strip()
        for origin in os.getenv(
            "FRONTEND_ORIGIN",
            "http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:5173,http://localhost:5174",
        ).split(",")
        if origin.strip()
    ]
    posters_dir: Path = BASE_DIR / "assets" / "posters"


@lru_cache
def get_settings() -> Settings:
    return Settings()
