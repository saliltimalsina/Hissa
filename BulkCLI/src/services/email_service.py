"""Transactional email via SMTP (Gmail app password by default).

Configured entirely by env / secrets:
  SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 465, SSL),
  SMTP_USER, SMTP_PASSWORD, SMTP_FROM (defaults to SMTP_USER), SMTP_FROM_NAME.

If SMTP is not configured the sender no-ops and logs — so dev/local still runs.
"""

import os
import ssl
import smtplib
import logging
from email.message import EmailMessage

log = logging.getLogger("email")

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "465"))
SMTP_USER = os.environ.get("SMTP_USER", "").strip()
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.environ.get("SMTP_FROM", SMTP_USER).strip()
SMTP_FROM_NAME = os.environ.get("SMTP_FROM_NAME", "Hissa")


def is_configured() -> bool:
    return bool(SMTP_USER and SMTP_PASSWORD)


def send_email(to: str, subject: str, text: str, html: str | None = None) -> bool:
    if not is_configured():
        log.warning("SMTP not configured — skipping email to %s (subject=%s)", to, subject)
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM}>"
    msg["To"] = to
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")

    # Use certifi's CA bundle when available — some hosts (notably macOS
    # python.org builds) ship without a usable system trust store.
    try:
        import certifi
        ctx = ssl.create_default_context(cafile=certifi.where())
    except Exception:
        ctx = ssl.create_default_context()
    try:
        if SMTP_PORT == 465:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx, timeout=20) as s:
                s.login(SMTP_USER, SMTP_PASSWORD)
                s.send_message(msg)
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as s:
                s.starttls(context=ctx)
                s.login(SMTP_USER, SMTP_PASSWORD)
                s.send_message(msg)
        return True
    except Exception as e:  # never leak SMTP errors to the API response
        log.error("Failed to send email to %s: %s", to, e)
        return False


def send_password_reset(to: str, reset_url: str) -> bool:
    subject = "Reset your Hissa password"
    text = (
        f"We received a request to reset your Hissa password.\n\n"
        f"Reset link (valid for 1 hour):\n{reset_url}\n\n"
        f"If you didn't request this, you can safely ignore this email."
    )
    html = f"""\
<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
  <h2>Reset your Hissa password</h2>
  <p>We received a request to reset your password. This link is valid for 1 hour.</p>
  <p><a href="{reset_url}"
        style="display:inline-block;padding:10px 18px;background:#111;color:#fff;
               border-radius:8px;text-decoration:none">Reset password</a></p>
  <p style="color:#666;font-size:13px">If you didn't request this, ignore this email.</p>
</div>"""
    return send_email(to, subject, text, html)
