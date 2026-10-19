"""Tests for the health endpoint."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "i-Save Backend"
    assert body["env"] == "development"


def test_health_content_type():
    response = client.get("/health")
    assert "application/json" in response.headers.get("content-type", "")
