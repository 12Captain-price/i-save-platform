"""Delivery seam. Publishing an office email is not provider configuration."""
from app.exceptions import APIError


class UnavailableMailer:
    available=False
    def send(self, *, recipient, token, request_key):
        raise APIError(503,'delivery_unavailable','Invitation delivery is unavailable: an approved provider, sender, credentials and HTTPS setup URL are required')


def get_invitation_mailer():
    # No approved provider is configured in this deployment. No simulated send.
    return UnavailableMailer()
