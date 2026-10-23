"""Local SMTP capture only. No production/external email adapter is enabled."""
import smtplib
from email.message import EmailMessage
from urllib.parse import urlsplit
from uuid import UUID
from app.config import get_settings
from app.exceptions import APIError


class DeliveryNotSubmitted(RuntimeError):
    """Connection failed before any SMTP message submission; safe to retry."""


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

    def send_account(self, *, recipient, token, request_key, purpose, contacts=None):
        page='recovery' if purpose=='recovery' else 'setup-password'
        link=self.settings.password_setup_frontend_url.rstrip('/')+'/'+page+'#token='+token
        self._capture(recipient,'i-Save '+('password recovery' if purpose=='recovery' else 'staff password setup'),
            'Use this private, expiring, single-use link. Do not share it. No automatic login.\n'+link+self._contacts(contacts),
            'account-'+str(UUID(request_key)))

    def send_notice(self, *, recipient, notification_id, contacts=None):
        self._capture(recipient,'i-Save account update',
            'An update is available in your private notification centre. Log in through your usual i-Save address. No financial action is requested by this email.'+self._contacts(contacts),
            'notice-'+str(notification_id))

    @staticmethod
    def _contacts(contacts):
        return ('\n\nOffice: '+contacts['office']+'\nEmail: '+contacts['email']+'\nTelephone: '+contacts['office_phone']) if contacts else ''

    def _capture(self, recipient, subject, body, identifier):
        message=EmailMessage();message['From']=self.settings.smtp_from;message['To']=recipient
        message['Subject']='[LOCAL TEST ONLY] '+subject
        message['Message-ID']='<isave-'+identifier+'@local.test>'
        message.set_content('Mailpit development capture only. Not external delivery.\n\n'+body)
        smtp=smtplib.SMTP(timeout=self.settings.smtp_timeout_seconds)
        try:
            try:
                smtp.connect(self.settings.smtp_host,self.settings.smtp_port)
            except (OSError,smtplib.SMTPException):
                raise DeliveryNotSubmitted('No SMTP message was submitted') from None
            if smtp.send_message(message):raise RuntimeError('Recipient not accepted')
        finally:smtp.close()


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
