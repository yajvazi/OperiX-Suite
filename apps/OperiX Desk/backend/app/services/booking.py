from datetime import date, time, timedelta

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.models.reservation import Reservation, ReservationStatus
from app.models.resource import Resource
from app.models.user import User, UserRole


def active_reservation_for_resource(
    db: Session,
    resource_id: int,
    booking_date: date,
) -> Reservation | None:
    return (
        db.query(Reservation)
        .filter(
            Reservation.resource_id == resource_id,
            Reservation.date == booking_date,
            Reservation.status == ReservationStatus.active,
        )
        .first()
    )


def conflicting_reservation_for_resource(
    db: Session,
    resource: Resource,
    booking_date: date,
    start_time: time | None = None,
    end_time: time | None = None,
    exclude_reservation_id: int | None = None,
) -> Reservation | None:
    query = db.query(Reservation).filter(
        Reservation.resource_id == resource.id,
        Reservation.date == booking_date,
        Reservation.status == ReservationStatus.active,
    )
    if exclude_reservation_id is not None:
        query = query.filter(Reservation.id != exclude_reservation_id)

    if resource.type != "room":
        return query.first()

    if start_time is None or end_time is None:
        return query.first()

    return (
        query.filter(
            (Reservation.start_time.is_(None))
            | (Reservation.end_time.is_(None))
            | (
                (Reservation.start_time < end_time)
                & (Reservation.end_time > start_time)
            )
        )
        .first()
    )


def validate_booking_rules(
    db: Session,
    user: User,
    resource_id: int,
    booking_date: date,
    start_time: time | None = None,
    end_time: time | None = None,
    exclude_reservation_id: int | None = None,
    actor: User | None = None,
):
    actor = actor or user
    today = date.today()
    max_date = today + timedelta(days=settings.max_booking_days_ahead)

    if booking_date < today:
        raise HTTPException(status_code=400, detail="Cannot book dates in the past")
    if booking_date > max_date:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot book more than {settings.max_booking_days_ahead} days ahead",
        )

    resource = db.get(Resource, resource_id)
    if not resource or not resource.is_active:
        raise HTTPException(status_code=404, detail="Resource not found or inactive")

    if resource.type not in ("desk", "room"):
        raise HTTPException(
            status_code=400,
            detail="This resource is an amenity marker and cannot be reserved",
        )

    if resource.restricted_to_team_leaders and actor.role != UserRole.team_leader:
        raise HTTPException(
            status_code=403,
            detail="This resource can only be reserved by team leaders",
        )

    if resource.type == "room" and actor.role not in (UserRole.team_leader, UserRole.manager):
        raise HTTPException(
            status_code=403,
            detail="Only team leaders and managers can reserve meeting rooms",
        )
    if resource.type == "room":
        if bool(start_time) != bool(end_time):
            raise HTTPException(
                status_code=400,
                detail="Room reservations need both a start and end time, or neither for all-day",
            )
        if start_time and end_time and start_time >= end_time:
            raise HTTPException(
                status_code=400,
                detail="Room reservation end time must be after the start time",
            )
    else:
        if start_time or end_time:
            raise HTTPException(
                status_code=400,
                detail="Desk reservations do not use time slots",
            )

    conflict = conflicting_reservation_for_resource(
        db,
        resource,
        booking_date,
        start_time,
        end_time,
        exclude_reservation_id,
    )
    if conflict:
        detail = (
            "This room is already booked during the selected time"
            if resource.type == "room" and start_time and end_time
            else "This resource is already booked for the selected date"
        )
        raise HTTPException(status_code=409, detail=detail)

    same_day_query = (
        db.query(Reservation)
        .join(Resource)
        .filter(
            Reservation.user_id == user.id,
            Reservation.status == ReservationStatus.active,
            Reservation.date == booking_date,
            Resource.type == "desk",
        )
    )
    if exclude_reservation_id is not None:
        same_day_query = same_day_query.filter(Reservation.id != exclude_reservation_id)

    same_day_count = same_day_query.count()
    if same_day_count >= 1:
        raise HTTPException(
            status_code=400,
            detail="Only one desk reservation is allowed per employee per day",
        )

    active_query = db.query(Reservation).filter(
        Reservation.user_id == user.id,
        Reservation.status == ReservationStatus.active,
        Reservation.date >= today,
    )
    if exclude_reservation_id is not None:
        active_query = active_query.filter(Reservation.id != exclude_reservation_id)

    active_count = active_query.count()
    if active_count >= settings.max_active_reservations:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Maximum {settings.max_active_reservations} active reservations allowed. "
                "Cancel an existing booking first."
            ),
        )


def get_booking_limits(db: Session, user: User) -> dict:
    today = date.today()
    active_count = (
        db.query(Reservation)
        .filter(
            Reservation.user_id == user.id,
            Reservation.status == ReservationStatus.active,
            Reservation.date >= today,
        )
        .count()
    )
    return {
        "max_active_reservations": settings.max_active_reservations,
        "max_booking_days_ahead": settings.max_booking_days_ahead,
        "active_reservations": active_count,
        "remaining_slots": max(0, settings.max_active_reservations - active_count),
    }


def create_reservation(
    db: Session,
    user: User,
    resource_id: int,
    booking_date: date,
    start_time: time | None = None,
    end_time: time | None = None,
    actor: User | None = None,
) -> Reservation:
    validate_booking_rules(db, user, resource_id, booking_date, start_time, end_time, actor=actor)

    existing = (
        db.query(Reservation)
        .join(Resource)
        .filter(
            Reservation.resource_id == resource_id,
            Reservation.date == booking_date,
            Reservation.status != ReservationStatus.active,
            Resource.type != "room",
        )
        .first()
    )
    if existing:
        existing.user_id = user.id
        existing.status = ReservationStatus.active
        existing.start_time = start_time
        existing.end_time = end_time
        db.commit()
        db.refresh(existing)
        return existing

    reservation = Reservation(
        user_id=user.id,
        resource_id=resource_id,
        date=booking_date,
        start_time=start_time,
        end_time=end_time,
        status=ReservationStatus.active,
    )
    db.add(reservation)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = (
            db.query(Reservation)
            .join(Resource)
            .filter(
                Reservation.resource_id == resource_id,
                Reservation.date == booking_date,
                Reservation.status == ReservationStatus.active,
                Resource.type != "room",
            )
            .first()
        )
        if existing and existing.user_id == user.id:
            return existing
        raise HTTPException(status_code=409, detail="This resource is already booked for the selected date")
    db.refresh(reservation)
    return reservation

def create_recurring_reservations(
    db: Session,
    user: User,
    resource_id: int,
    booking_date: date,
    repeat_weeks: int,
    start_time: time | None = None,
    end_time: time | None = None,
    actor: User | None = None,
) -> list[Reservation]:
    created = [
        create_reservation(db, user, resource_id, booking_date, start_time, end_time, actor),
    ]
    for week in range(1, max(0, repeat_weeks) + 1):
        created.append(
            create_reservation(
                db,
                user,
                resource_id,
                booking_date + timedelta(days=7 * week),
                start_time,
                end_time,
                actor,
            )
        )
    return created


def update_reservation(
    db: Session,
    reservation: Reservation,
    resource_id: int,
    booking_date: date,
    start_time: time | None = None,
    end_time: time | None = None,
):
    validate_booking_rules(
        db,
        reservation.user,
        resource_id,
        booking_date,
        start_time,
        end_time,
        exclude_reservation_id=reservation.id,
    )

    reservation.resource_id = resource_id
    reservation.date = booking_date
    reservation.start_time = start_time
    reservation.end_time = end_time
    db.commit()
    db.refresh(reservation)
    return reservation


def cancel_reservation(db: Session, reservation: Reservation, user: User, is_admin: bool):
    if reservation.user_id != user.id and not is_admin:
        raise HTTPException(status_code=403, detail="Not allowed to cancel this reservation")
    if reservation.status != ReservationStatus.active:
        raise HTTPException(status_code=400, detail="Reservation is not active")
    reservation.status = ReservationStatus.cancelled
    db.commit()
    db.refresh(reservation)
    return reservation
