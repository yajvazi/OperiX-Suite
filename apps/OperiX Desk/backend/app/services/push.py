"""Best-effort Expo push delivery for registered OperiX Desk devices."""

from __future__ import annotations

import requests
from sqlalchemy.orm import Session

from app.models.device_token import DeviceToken
from app.models.reservation import Reservation
def _send(messages: list[dict]) -> None:
    if not messages:
        return
    try:
        response = requests.post(
            "https://exp.host/--/api/v2/push/send",
            json=messages,
            headers={"Content-Type": "application/json"},
            timeout=8,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        print(f"[push:error] {exc}")


def notify_user(db: Session, reservation: Reservation, title: str, body: str, deep_link: str) -> None:
    if not reservation.user or not reservation.organization_id:
        return
    tokens = (
        db.query(DeviceToken.push_token)
        .filter(
            DeviceToken.user_id == reservation.user_id,
            DeviceToken.organization_id == reservation.organization_id,
            DeviceToken.is_active.is_(True),
        )
        .all()
    )
    _send([
        {
            "to": token,
            "title": title,
            "body": body,
            "data": {"reservationId": reservation.id, "deepLink": deep_link},
            "sound": "default",
        }
        for (token,) in tokens
    ])
