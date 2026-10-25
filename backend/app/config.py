"""Application configuration loaded from environment variables.

Secrets and connection strings are read from the environment (see
``backend/.env.example``). Nothing is hard-coded and nothing is committed.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    app_name: str = "i-Save Backend"
    app_debug: bool = True
    document_scan_host: str = ''
    document_scan_port: int = Field(default=3310, ge=1, le=65535)
    document_scan_test_only: bool = False

    database_url: str = "sqlite:///./data/i_save_dev.db"

    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = Field(default=30, ge=1, le=1440)
    password_setup_expire_minutes: int = Field(default=60,ge=5,le=1440)
    invitation_delivery: str = 'disabled'
    campaign_delivery_enabled: bool = False
    campaign_local_rate_per_minute: int = Field(default=10,ge=1,le=60)
    smtp_host: str = 'mailpit'
    smtp_port: int = Field(default=1025,ge=1,le=65535)
    smtp_from: str = 'isave-local@example.test'
    smtp_timeout_seconds: int = Field(default=5,ge=1,le=15)
    password_setup_frontend_url: str = 'http://localhost:3000'

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"


@lru_cache
def get_settings() -> Settings:
    """Return cached settings so .env is parsed once per process."""
    return Settings()
