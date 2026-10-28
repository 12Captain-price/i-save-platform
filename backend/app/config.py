"""Application configuration loaded from environment variables.

Secrets and connection strings are read from the environment (see
``backend/.env.example``). Nothing is hard-coded and nothing is committed.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from typing import Literal
from pathlib import Path
from urllib.parse import urlsplit
import os
import re
import ipaddress


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: Literal['development', 'test', 'production'] = "development"
    deployment_tier: Literal['staging','production'] = 'production'
    launch_mode: Literal['informational', 'applications', 'full'] | None = None
    public_origin: str = ''
    gateway_token: str = Field(default='',repr=False)
    gateway_token_file: str = ''
    database_url_file: str = ''
    database_purpose: Literal['api','account','subscriptions','operations','backup','migrator'] = 'api'
    database_security_enforced: bool = False
    database_migration_role: Literal['','isave_owner'] = ''
    backup_source_url: str = Field(default='',repr=False)
    backup_source_url_file: str = ''
    restore_independence_file: str = ''
    restore_target_mode: Literal['create_database','precreated'] = 'create_database'
    secret_key_file: str = ''
    app_name: str = "i-Save Backend"
    app_debug: bool = True
    document_scan_host: str = ''
    document_scan_port: int = Field(default=3310, ge=1, le=65535)
    document_scan_test_only: bool = False
    document_scan_timeout_seconds: int = Field(default=15, ge=1, le=30)
    document_scan_max_age_hours: int = Field(default=48, ge=1, le=168)
    backup_directory: str = '/var/lib/isave-backups'
    backup_key_file: str = '/run/secrets/backup_key'
    restore_test_url: str = Field(default='',repr=False)
    restore_test_url_file: str = ''
    backup_max_bytes: int = Field(default=268435456, ge=1048576, le=1073741824)

    database_url: str = Field(default="sqlite:///./data/i_save_dev.db",repr=False)

    secret_key: str = Field(default="dev-secret-change-me",repr=False)
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

    @property
    def effective_launch_mode(self):
        # Existing local installations retain their behaviour. Hosted installs
        # default closed; this is a safeguard, not a business launch decision.
        return self.launch_mode or ('informational' if self.app_env == 'production' else 'full')

    def validate_runtime(self):
        for name in ('database_url', 'secret_key', 'gateway_token','restore_test_url','backup_source_url'):
            filename = getattr(self, name + '_file')
            if filename:
                try: setattr(self, name, Path(filename).read_text().strip())
                except Exception: raise RuntimeError('Required private configuration file is unavailable') from None
        if self.app_env != 'production': return self
        from sqlalchemy.engine import make_url
        def fail(): raise RuntimeError('Unsafe production configuration; consult the deployment runbook') from None
        if self.database_purpose!='migrator' and self.database_migration_role: fail()
        if self.database_purpose=='migrator' and self.database_migration_role!='isave_owner': fail()
        try:
            origin = urlsplit(self.public_origin)
            origin.port
            db = make_url(self.database_url)
            hostname=(origin.hostname or '').rstrip('.').lower()
            try:
                address=ipaddress.ip_address(hostname)
                loopback=address.is_loopback or bool(getattr(address,'ipv4_mapped',None) and address.ipv4_mapped.is_loopback)
            except ValueError: loopback=False
            if (origin.scheme != 'https' or not hostname or hostname=='localhost' or loopback
                or hostname.endswith(('.test','.invalid','.localhost')) or origin.username or origin.password
                or any(c.isspace() for c in self.public_origin)
                or origin.path not in {'','/'} or origin.query or origin.fragment): fail()
            if (not db.drivername.startswith('postgresql') or not db.host or db.host in {'localhost','127.0.0.1','::1'}
                or not db.database or 'test' in db.database.lower() or 'rehearsal' in db.database.lower()
                or not db.password or any(x in db.password.lower() for x in ('change_me','changeme','example'))): fail()
            if self.password_setup_frontend_url.rstrip('/') != self.public_origin.rstrip('/'): fail()
            if set(x.strip() for x in self.cors_origins.split(',')) != {self.public_origin.rstrip('/')}: fail()
        except RuntimeError: raise
        except Exception: fail()
        if (self.app_debug or self.document_scan_test_only or not self.document_scan_host
            or self.invitation_delivery != 'disabled' or self.campaign_delivery_enabled
            or self.smtp_host or self.smtp_from.endswith('@example.test')): fail()
        if any(len(value) < 32 or any(x in value.lower() for x in ('dev-secret','change-me','change_me','changeme'))
               for value in (self.secret_key,self.gateway_token)): fail()
        if not re.fullmatch(r'[-A-Za-z0-9_]{32,128}',self.gateway_token): fail()
        if any(os.environ.get(key) for key in ('ISAVE_TEST_DATABASE_URL','TEST_CLOCK','WITHDRAWAL_TEST_CLOCK','ISAVE_TEST_FIXTURES')): fail()
        if Path('/tmp/withdrawal-test-clock.json').exists(): fail()
        return self


@lru_cache
def get_settings() -> Settings:
    """Return cached settings so .env is parsed once per process."""
    return Settings().validate_runtime()
