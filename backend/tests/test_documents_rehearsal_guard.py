from types import SimpleNamespace
import pytest
from sqlalchemy.engine import make_url
from app import documents_rehearsal


def test_document_rehearsal_refuses_normal_database_before_connecting(monkeypatch):
    monkeypatch.setattr(documents_rehearsal,'engine',SimpleNamespace(url=make_url('postgresql+psycopg://localhost/isave')))
    monkeypatch.setattr(documents_rehearsal,'require_current_schema',lambda _:pytest.fail('Must not connect to normal database'))
    with pytest.raises(RuntimeError,match='Disposable document rehearsal required'):documents_rehearsal.guard()
