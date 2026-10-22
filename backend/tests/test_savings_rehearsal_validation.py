import pytest
from app import savings_rehearsal as setup


@pytest.mark.parametrize('email,password,check', [
    ('synthetic@example.test', 'short', 'password'),
    ('bad@@example.test', 'synthetic-password-only', 'format'),
    ('synthetic@invalid.test', 'synthetic-password-only', 'domain'),
    ('synthetic@example.test', 'x'*73, 'password'),
    ('synthetic@example.test', '\u00e9'*40, 'password'),
])
def test_validation_reports_check_without_private_input(email,password,check):
    with pytest.raises(setup.SetupRefused) as caught:
        setup.validate_credentials('Admin',email,password)
    message=str(caught.value)
    assert check in message
    assert email not in message
    assert password not in message


def test_acknowledgement_refusal_has_safe_diagnostic(monkeypatch):
    monkeypatch.setattr(setup,'guard',lambda:None)
    monkeypatch.setattr(setup.sys.stdin,'isatty',lambda:True)
    monkeypatch.setattr(setup,'private_input',lambda _: 'incorrect acknowledgement')
    with pytest.raises(setup.SetupRefused,match='acknowledgement did not match'):
        setup.main()
