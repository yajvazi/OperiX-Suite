import hashlib
import hmac
import json
import smtplib
import ssl
import secrets
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from email.message import EmailMessage
from datetime import datetime, timedelta, timezone

from app.config import settings


def generate_temporary_password(length: int = 8) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def generate_reset_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def token_matches(token: str, token_hash: str | None) -> bool:
    return bool(token_hash) and hmac.compare_digest(hash_token(token), token_hash)


def reset_token_expiry(hours: int = 24) -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=hours)


def build_reset_link(token: str) -> str:
    base_url = (settings.frontend_base_url or "http://127.0.0.1:3000").rstrip("/")
    return f"{base_url}/reset-password?token={token}"


def _send_resend_email(to_email: str, subject: str, body: str) -> None:
    payload = json.dumps(
        {
            "from": settings.resend_from_email or settings.smtp_from_email or "DeskDibs <onboarding@resend.dev>",
            "to": [to_email],
            "subject": subject,
            "text": body,
        }
    ).encode("utf-8")
    request = Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=15) as response:
            if response.status >= 400:
                raise RuntimeError(f"Resend failed with status {response.status}")
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Resend failed with status {exc.code}: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Resend request failed: {exc.reason}") from exc


def _send_smtp_email(to_email: str, subject: str, body: str) -> None:
    message = EmailMessage()
    message["From"] = settings.smtp_from_email or settings.smtp_username or "no-reply@localhost"
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    context = ssl.create_default_context()
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        if settings.smtp_use_tls:
            server.starttls(context=context)
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password or "")
        server.send_message(message)


def send_email(to_email: str, subject: str, body: str) -> None:
    if settings.resend_api_key:
        _send_resend_email(to_email, subject, body)
        return

    if settings.smtp_host:
        _send_smtp_email(to_email, subject, body)
        return

    print(f"[mail:simulate] to={to_email} subject={subject}\n{body}")


def reservation_time_label(start_time, end_time) -> str:
    if start_time and end_time:
        return f"{start_time.strftime('%H:%M')} - {end_time.strftime('%H:%M')}"
    return "All day"


def build_account_created_email(full_name: str, email: str, temporary_password: str, reset_link: str) -> str:
    return "\n".join(
        [
            f"Hello {full_name},",
            "",
            "Your DeskDibs account has been created.",
            f"Email: {email}",
            f"Temporary password: {temporary_password}",
            "",
            "You can use the temporary password to sign in, or set a new password with this link:",
            reset_link,
            "",
            "For security, please change your password after your first login.",
        ]
    )


def build_password_reset_email(full_name: str, reset_link: str) -> str:
    return "\n".join(
        [
            f"Hello {full_name},",
            "",
            "We received a request to reset your DeskDibs password.",
            "Use this link to choose a new password:",
            reset_link,
            "",
            "This link expires in 24 hours. If you did not request this, you can ignore this email.",
        ]
    )


def build_reservation_cancelled_email(reservation) -> str:
    resource_name = reservation.resource.name if reservation.resource else "your resource"
    return "\n".join(
        [
            f"Hello {reservation.user.full_name},",
            "",
            "Your DeskDibs reservation has been cancelled by an admin.",
            f"Resource: {resource_name}",
            f"Date: {reservation.date.isoformat()}",
            f"Time: {reservation_time_label(reservation.start_time, reservation.end_time)}",
            "",
            "Please open DeskDibs to choose another workspace if needed.",
        ]
    )


def build_admin_reservation_created_email(reservation) -> str:
    resource_name = reservation.resource.name if reservation.resource else f"Resource #{reservation.resource_id}"
    user_name = reservation.user.full_name if reservation.user else f"User #{reservation.user_id}"
    user_email = reservation.user.email if reservation.user else "Unknown email"
    return "\n".join(
        [
            "A new DeskDibs reservation was created.",
            "",
            f"Employee: {user_name}",
            f"Email: {user_email}",
            f"Resource: {resource_name}",
            f"Date: {reservation.date.isoformat()}",
            f"Time: {reservation_time_label(reservation.start_time, reservation.end_time)}",
        ]
    )
