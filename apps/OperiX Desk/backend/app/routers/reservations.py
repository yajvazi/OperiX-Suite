from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_admin
from app.database import get_db
from app.models.resource import Resource, ResourceType
from app.models.reservation import Reservation, ReservationStatus
from app.models.user import User, UserRole
from app.config import settings
from app.schemas.reservation import (
    ReservationCreate,
    ReservationOut,
    ReservationUpdate,
    TeamDeskBookingCreate,
)
from app.schemas.resource import ResourceOut
from app.services.booking import (
    cancel_reservation,
    create_recurring_reservations,
    create_reservation,
    get_booking_limits,
    update_reservation,
)
from app.services.audit import record_audit
from app.services.notifications import (
    build_admin_reservation_created_email,
    build_reservation_cancelled_email,
    send_email,
)

router = APIRouter(prefix="/reservations", tags=["reservations"])


def _to_out(reservation: Reservation) -> ReservationOut:
    out = ReservationOut.model_validate(reservation)
    if reservation.resource:
        out.resource = ResourceOut.model_validate(reservation.resource)
    if reservation.user:
        out.user_name = reservation.user.full_name
    return out


def _admin_notification_recipients(db: Session) -> list[str]:
    if settings.admin_notification_email:
        return [settings.admin_notification_email]
    admins = db.query(User.email).filter(User.role == UserRole.admin).all()
    return [email for (email,) in admins if email]


def _safe_send_email(to_email: str, subject: str, body: str) -> None:
    try:
        send_email(to_email, subject, body)
    except Exception as exc:
        print(f"[mail:error] to={to_email} subject={subject} error={exc}")


def _notify_admins_reservation_created(db: Session, reservation: Reservation) -> None:
    subject = "DeskDibs reservation created"
    body = build_admin_reservation_created_email(reservation)
    for email in _admin_notification_recipients(db):
        _safe_send_email(email, subject, body)


def _notify_user_reservation_cancelled(reservation: Reservation) -> None:
    if reservation.user and reservation.user.email:
        _safe_send_email(
            reservation.user.email,
            "Your DeskDibs reservation was cancelled",
            build_reservation_cancelled_email(reservation),
        )


@router.get("/me", response_model=list[ReservationOut])
def my_reservations(
    status: ReservationStatus | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        db.query(Reservation)
        .options(joinedload(Reservation.resource), joinedload(Reservation.user))
        .filter(Reservation.user_id == current_user.id)
        .order_by(Reservation.date.desc())
    )
    if status:
        query = query.filter(Reservation.status == status)
    return [_to_out(r) for r in query.all()]


@router.get("", response_model=list[ReservationOut])
def all_reservations(
    booking_date: date | None = Query(None, alias="date"),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    query = (
        db.query(Reservation)
        .options(joinedload(Reservation.resource), joinedload(Reservation.user))
        .order_by(Reservation.date.desc())
    )
    if booking_date:
        query = query.filter(Reservation.date == booking_date)
    return [_to_out(r) for r in query.all()]


@router.get("/limits")
def booking_limits(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_booking_limits(db, current_user)


@router.post("", response_model=ReservationOut | list[ReservationOut], status_code=201)
def book(
    data: ReservationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.repeat_weeks:
        reservations = create_recurring_reservations(
            db,
            current_user,
            data.resource_id,
            data.date,
            data.repeat_weeks,
            data.start_time,
            data.end_time,
        )
        results = (
            db.query(Reservation)
            .options(joinedload(Reservation.resource), joinedload(Reservation.user))
            .filter(Reservation.id.in_([reservation.id for reservation in reservations]))
            .all()
        )
        for reservation in results:
            _notify_admins_reservation_created(db, reservation)
        return [_to_out(r) for r in results]

    reservation = create_reservation(
        db,
        current_user,
        data.resource_id,
        data.date,
        data.start_time,
        data.end_time,
    )
    reservation = (
        db.query(Reservation)
        .options(joinedload(Reservation.resource), joinedload(Reservation.user))
        .filter(Reservation.id == reservation.id)
        .first()
    )
    _notify_admins_reservation_created(db, reservation)
    return _to_out(reservation)


@router.delete("/{reservation_id}", response_model=ReservationOut)
def cancel(
    reservation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reservation = (
        db.query(Reservation)
        .options(joinedload(Reservation.resource), joinedload(Reservation.user))
        .filter(Reservation.id == reservation_id)
        .first()
    )
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    is_admin = current_user.role == UserRole.admin
    reservation = cancel_reservation(db, reservation, current_user, is_admin)
    if is_admin:
        _notify_user_reservation_cancelled(reservation)
        try:
            record_audit(
                db,
                current_user,
                "cancel_reservation",
                "reservation",
                reservation.id,
                f"Cancelled booking for {reservation.user.full_name if reservation.user else 'user'}",
            )
            db.commit()
        except Exception as exc:
            db.rollback()
            print(f"[audit:error] action=cancel_reservation reservation_id={reservation.id} error={exc}")
    return _to_out(reservation)


@router.put("/{reservation_id}", response_model=ReservationOut)
def admin_update_reservation(
    reservation_id: int,
    data: ReservationUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    reservation = (
        db.query(Reservation)
        .options(joinedload(Reservation.resource), joinedload(Reservation.user))
        .filter(Reservation.id == reservation_id)
        .first()
    )
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    reservation = update_reservation(
        db,
        reservation,
        data.resource_id,
        data.date,
        data.start_time,
        data.end_time,
    )
    reservation = (
        db.query(Reservation)
        .options(joinedload(Reservation.resource), joinedload(Reservation.user))
        .filter(Reservation.id == reservation.id)
        .first()
    )
    record_audit(
        db,
        admin_user,
        "update_reservation",
        "reservation",
        reservation.id,
        f"Updated booking on {data.date}",
    )
    db.commit()
    return _to_out(reservation)


@router.post("/team-bookings", response_model=list[ReservationOut], status_code=201)
def book_team_desks(
    data: TeamDeskBookingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.team_leader:
        raise HTTPException(status_code=403, detail="Team leader access required")

    if not data.bookings:
        raise HTTPException(status_code=400, detail="Select at least one teammate")

    teammate_ids = {
        teammate.id
        for teammate in db.query(User).filter(User.team_leader_id == current_user.id).all()
    }
    created: list[Reservation] = []
    for item in data.bookings:
        if item.user_id not in teammate_ids:
            raise HTTPException(status_code=403, detail="One or more selected users are not in your team")
        resource = db.get(Resource, item.resource_id)
        if not resource or resource.type != ResourceType.desk:
            raise HTTPException(status_code=400, detail="Team bookings can only use desks")
        created.extend(
            create_recurring_reservations(
                db,
                db.get(User, item.user_id),
                item.resource_id,
                data.date,
                data.repeat_weeks,
                None,
                None,
                current_user,
            )
        )

    results = (
        db.query(Reservation)
        .options(joinedload(Reservation.resource), joinedload(Reservation.user))
        .filter(Reservation.id.in_([r.id for r in created]))
        .all()
    )
    for reservation in results:
        _notify_admins_reservation_created(db, reservation)
    record_audit(
        db,
        current_user,
        "team_booking",
        "reservation",
        None,
        f"Booked {len(created)} desk(s) for team on {data.date}",
    )
    db.commit()
    return [_to_out(r) for r in results]
