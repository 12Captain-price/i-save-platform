"""Local SMTP capture only. No production/external email adapter is enabled."""
import smtplib
from email.message import EmailMessage
from urllib.parse import urlsplit
from uuid import UUID
from app.config import get_settings
from app.exceptions import APIError


class UnavailableMailer:
    available=False
    mode='unavailable'
    def send(self, *, recipient, token, request_key):
        raise APIError(503,'delivery_unavailable','Invitation delivery is unavailable: an approved provider, sender, credentials and HTTPS setup URL are required')


class MailpitMailer:
    available = True
    mode = 'mailpit'

    def __init__(self, settings):
        self.settings = settings

    def send(self, *, recipient, token, request_key):
        settings = self.settings
        message_id = f'<isave-{UUID(request_key)}@local.test>'
        message = EmailMessage()
        message['From'] = settings.smtp_from
        message['To'] = recipient
        message['Subject'] = '[LOCAL TEST ONLY] i-Save password setup'
        message['Message-ID'] = message_id
        link = settings.password_setup_frontend_url.rstrip('/') + '/setup-password#token=' + token
        message.set_content(
            'Mailpit development capture only. This message was not delivered externally.\n\n'
            'Your membership account has been activated. Set your password using this private link:\n'
            + link + '\n\nThis link expires and can be used once. Do not share it.\n'
            'If you did not request this, contact the office.\n'
        )
        smtp = smtplib.SMTP(timeout=settings.smtp_timeout_seconds)
        try:
            smtp.connect(settings.smtp_host, settings.smtp_port)
            # Never enable SMTP protocol debugging: it exposes the private link.
            if smtp.send_message(message):
                raise RuntimeError('Recipient not accepted')
            return message_id  # SMTP DATA was accepted; this is a correlation ID.
        finally:
            smtp.close()


def get_invitation_mailer():
    settings = get_settings()
    try:
        url = urlsplit(settings.password_setup_frontend_url)
        url.port  # Validate malformed/out-of-range ports as well as the host.
    except ValueError:
        return UnavailableMailer()
    # Fail closed outside explicit local development. No external SMTP target.
    if (settings.app_env != 'development' or settings.invitation_delivery != 'mailpit'
            or settings.smtp_host not in {'mailpit', 'localhost', '127.0.0.1'}
            or url.scheme != 'http' or url.hostname not in {'localhost', '127.0.0.1'}
            or url.username or url.password or url.path not in {'', '/'} or url.query or url.fragment
            or not settings.smtp_from.endswith('@example.test')
            or any(c in settings.smtp_from for c in '\r\n')):
        return UnavailableMailer()
    return MailpitMailer(settings)
