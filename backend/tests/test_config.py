"""Tests for application configuration."""
from app.config import Settings, get_settings


def test_settings_defaults():
    settings = Settings()
    assert settings.app_name == "i-Save Backend"
    assert settings.app_env == "development"
    assert settings.app_debug is True
    assert settings.database_url.startswith("sqlite")
    assert settings.secret_key == "dev-secret-change-me"
    assert settings.access_token_expire_minutes == 30


def test_get_settings_is_cached():
    assert get_settings() is get_settings()
