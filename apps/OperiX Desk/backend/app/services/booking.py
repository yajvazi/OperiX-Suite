from datetime import date, time, timedelta

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.auth import user_has_permission
from app.models.reservation import Reservation, ReservationStatus
from app.models.resource import Resource, ResourceType
from app.models.user import User, UserRole
from app.services.workspace import require_organization, scope_query


def active_reservation_for_resource(
    db: Session,
    resource_id: int,
    booking_date: date,
    user: User | None = None,
) -> Reservation | None:
    query = (
        db.query(Reservation)
        .filter(
            Reservation.resource_id == resource_id,
            Reservation.date == booking_date,
            Reservation.status == ReservationStatus.active,
        )
    )
    if user:
        query = scope_query(query, Reservation, user)
    return query.first()


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
    if resource.organization_id:
        query = query.filter(Reservation.organization_id == resource.organization_id)
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
    resource: Resource | None = None,
):
    actor = actor or user
    if not user_has_permission(actor, "desk.reserve"):
        raise HTTPException(status_code=403, detail="You do not have permission to reserve workspace resources")
    today = date.today()
    max_date = today + timedelta(days=settings.max_booking_days_ahead)

    if booking_date < today:
        raise HTTPException(status_code=400, detail="Cannot book dates in the past")
    if booking_date > max_date:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot book more than {settings.max_booking_days_ahead} days ahead",
        )

    if resource is None:
        resource_query = scope_query(
            db.query(Resource).filter(Resource.id == resource_id),
            Resource,
            actor,
        )
        resource = resource_query.first()
    if not resource or not resource.is_active:
        raise HTTPException(status_code=404, detail="Resource not found or inactive")
    if not resource.organization_id and not settings.allow_legacy_unscoped_data:
        require_organization(actor)

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
            else "This desk was just reserved by another user. Choose another available desk."
            if resource.type == ResourceType.desk
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
    same_day_query = scope_query(same_day_query, Reservation, user)
    if user.organization_id:
        same_day_query = same_day_query.filter(Resource.organization_id == user.organization_id)
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
    active_query = scope_query(active_query, Reservation, user)
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
    active_query = (
        db.query(Reservation)
        .filter(
            Reservation.user_id == user.id,
            Reservation.status == ReservationStatus.active,
            Reservation.date >= today,
        )
    )
    active_count = scope_query(active_query, Reservation, user).count()
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
    effective_actor = actor or user
    resource_query = scope_query(
        db.query(Resource).filter(Resource.id == resource_id),
        Resource,
        effective_actor,
    )
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        resource_query = resource_query.with_for_update()
    resource = resource_query.first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found or inactive")
    validate_booking_rules(
        db,
        user,
        resource_id,
        booking_date,
        start_time,
        end_time,
        actor=effective_actor,
        resource=resource,
    )

    existing = (
        scope_query(db.query(Reservation), Reservation, effective_actor)
        .join(Resource)
        .filter(
            Reservation.resource_id == resource_id,
            Reservation.date == booking_date,
            Reservation.status != ReservationStatus.active,
            Resource.type != "room",
        )
        .filter(Resource.organization_id == resource.organization_id)
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
        organization_id=resource.organization_id or effective_actor.organization_id,
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
            scope_query(db.query(Reservation), Reservation, effective_actor)
            .join(Resource)
            .filter(
                Reservation.resource_id == resource_id,
                Reservation.date == booking_date,
                Reservation.status == ReservationStatus.active,
                Resource.type != "room",
            )
            .filter(Resource.organization_id == resource.organization_id)
            .first()
        )
        if existing and existing.user_id == user.id:
            return existing
        detail = (
            "This desk was just reserved by another user. Choose another available desk."
            if resource.type == ResourceType.desk
            else "This resource is already booked for the selected date"
        )
        raise HTTPException(status_code=409, detail=detail)
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
    resource_query = scope_query(
        db.query(Resource).filter(Resource.id == resource_id),
        Resource,
        reservation.user,
    )
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        resource_query = resource_query.with_for_update()
    target_resource = resource_query.first()
    if not target_resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    validate_booking_rules(
        db,
        reservation.user,
        resource_id,
        booking_date,
        start_time,
        end_time,
        exclude_reservation_id=reservation.id,
        resource=target_resource,
    )

    reservation.resource_id = resource_id
    reservation.date = booking_date
    reservation.start_time = start_time
    reservation.end_time = end_time
    db.commit()
    db.refresh(reservation)
    return reservation


def cancel_reservation(db: Session, reservation: Reservation, user: User, is_admin: bool):
    if reservation.user_id == user.id and not user_has_permission(user, "desk.cancel_own"):
        raise HTTPException(status_code=403, detail="You do not have permission to cancel reservations")
    if (
        reservation.user_id != user.id
        and not is_admin
        and not user_has_permission(user, "reservation.manage")
    ):
        raise HTTPException(status_code=403, detail="Not allowed to cancel this reservation")
    if reservation.status != ReservationStatus.active:
        raise HTTPException(status_code=400, detail="Reservation is not active")
    reservation.status = ReservationStatus.cancelled
    db.commit()
    db.refresh(reservation)
    return reservation
