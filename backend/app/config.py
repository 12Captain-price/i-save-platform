"""Application configuration loaded from environment variables.

Secrets and connection strings are read from the environment (see
``backend/.env.example``). Nothing is hard-coded and nothing is committed.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    app_name: str = "i-Save Backend"
    app_debug: bool = True

    database_url: str = "sqlite:///./data/i_save_dev.db"

    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 30

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"


@lru_cache
def get_settings() -> Settings:
    """Return cached settings so .env is parsed once per process."""
    return Settings()
