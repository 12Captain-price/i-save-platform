from types import SimpleNamespace
import pytest
from sqlalchemy.engine import make_url
from app import settings_rehearsal


def test_rehearsal_refuses_normal_database_before_connecting(monkeypatch):
    monkeypatch.setattr(settings_rehearsal,'engine',SimpleNamespace(url=make_url('postgresql+psycopg://localhost/normal_database')))
    monkeypatch.setenv('ISAVE_REHEARSAL_ONLY','1')
    monkeypatch.setattr(settings_rehearsal,'require_current_schema',lambda _:pytest.fail('Must not access normal database'))
    with pytest.raises(RuntimeError,match='Disposable rehearsal required'):settings_rehearsal.guard()
