from collections import defaultdict
from datetime import date, timedelta
import csv
import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_manager_or_admin
from app.database import get_db
from app.models.reservation import Reservation, ReservationStatus
from app.models.resource import Resource, ResourceType
from app.models.user import User, UserRole
from app.schemas.analytics import (
    AnalyticsDashboard,
    DailyOccupancy,
    DayCount,
    DeskUsage,
    FloorUtilization,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _recent_activity_for_user(db: Session, current_user: User) -> list[str]:
    query = (
        db.query(Reservation)
        .options(joinedload(Reservation.resource), joinedload(Reservation.user))
        .order_by(Reservation.id.desc())
    )
    if current_user.role not in (UserRole.admin, UserRole.manager):
        query = query.filter(Reservation.user_id == current_user.id)
    recent = query.limit(8).all()
    return [
        f"{r.user.full_name} booked {r.resource.name} for {r.date} ({r.status.value})"
        for r in recent
    ]


@router.get("/dashboard", response_model=AnalyticsDashboard)
def dashboard(
    days: int = Query(30, ge=7, le=90),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin),
):

    total_desks = (
        db.query(Resource)
        .filter(Resource.is_active.is_(True), Resource.type == ResourceType.desk)
        .count()
    )
    total_rooms = (
        db.query(Resource)
        .filter(Resource.is_active.is_(True), Resource.type == ResourceType.room)
        .count()
    )
    today = date.today()
    active_reservations = (
        db.query(Reservation)
        .filter(
            Reservation.status == ReservationStatus.active,
            Reservation.date >= today,
        )
        .count()
    )

    occupancy_trend = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        booked = (
            db.query(Reservation)
            .join(Resource)
            .filter(
                Reservation.date == d,
                Reservation.status == ReservationStatus.active,
                Resource.type == ResourceType.desk,
                Resource.is_active.is_(True),
            )
            .count()
        )
        occ = (booked / total_desks * 100) if total_desks else 0
        occupancy_trend.append(
            DailyOccupancy(
                date=d.isoformat(),
                occupancy=round(occ, 1),
                booked=booked,
                total=total_desks,
            )
        )

    today_occ = occupancy_trend[-1].occupancy if occupancy_trend else 0

    day_counts: dict[int, int] = defaultdict(int)
    range_start = today - timedelta(days=days)
    reservations_range = (
        db.query(Reservation)
        .filter(
            Reservation.date >= range_start,
            Reservation.status == ReservationStatus.active,
        )
        .all()
    )
    for r in reservations_range:
        day_counts[r.date.weekday()] += 1
    busiest_days = [
        DayCount(day=DAY_NAMES[i], count=day_counts.get(i, 0)) for i in range(7)
    ]

    floor_stats: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    desks = (
        db.query(Resource)
        .filter(Resource.is_active.is_(True), Resource.type == ResourceType.desk)
        .all()
    )
    for desk in desks:
        floor_stats[desk.floor][1] += 1

    desk_bookings = (
        db.query(Resource.name, func.count(Reservation.id))
        .join(Reservation, Reservation.resource_id == Resource.id)
        .filter(
            Reservation.date >= range_start,
            Reservation.status == ReservationStatus.active,
            Resource.type == ResourceType.desk,
        )
        .group_by(Resource.id, Resource.name)
        .all()
    )

    booking_map = {name: count for name, count in desk_bookings}
    max_bookings = max(booking_map.values()) if booking_map else 1

    for desk in desks:
        floor_stats[desk.floor][0] += booking_map.get(desk.name, 0)

    floor_utilization = [
        FloorUtilization(
            floor=floor,
            utilization=round((stats[0] / (stats[1] * max(days, 1))) * 100, 1) if stats[1] else 0,
        )
        for floor, stats in sorted(floor_stats.items())
    ]

    sorted_desks = sorted(desk_bookings, key=lambda x: x[1], reverse=True)
    most_used = [
        DeskUsage(
            name=name,
            bookings=count,
            utilization=round(count / max(days, 1) * 100 / max(max_bookings, 1) * 100, 1),
        )
        for name, count in sorted_desks[:5]
    ]
    least_used = [
        DeskUsage(
            name=name,
            bookings=count,
            utilization=round(count / max(days, 1) * 100 / max(max_bookings, 1) * 100, 1),
        )
        for name, count in sorted(desk_bookings, key=lambda x: x[1])[:5]
    ]

    recent_activity = _recent_activity_for_user(db, current_user)

    return AnalyticsDashboard(
        total_desks=total_desks,
        total_rooms=total_rooms,
        active_reservations=active_reservations,
        occupancy_rate=today_occ,
        occupancy_trend=occupancy_trend,
        busiest_days=busiest_days,
        floor_utilization=floor_utilization,
        most_used_desks=most_used,
        least_used_desks=least_used,
        recent_activity=recent_activity,
    )


@router.get("/export")
def export_analytics_csv(
    days: int = Query(30, ge=7, le=90),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin),
):
    data = dashboard(days=days, db=db, current_user=current_user)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["date", "occupancy_percent", "booked_desks", "total_desks"])
    for point in data.occupancy_trend:
        writer.writerow([point.date, point.occupancy, point.booked, point.total])
    writer.writerow([])
    writer.writerow(["desk_name", "bookings", "utilization_percent"])
    for desk in data.most_used_desks:
        writer.writerow([desk.name, desk.bookings, desk.utilization])
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=deskdibs-analytics-{days}d.csv"},
    )


@router.get("/recent-activity", response_model=list[str])
def recent_activity(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _recent_activity_for_user(db, current_user)


@router.get("/employee-summary")
def employee_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    total_desks = (
        db.query(Resource)
        .filter(Resource.is_active.is_(True), Resource.type == ResourceType.desk)
        .count()
    )
    total_rooms = (
        db.query(Resource)
        .filter(Resource.is_active.is_(True), Resource.type == ResourceType.room)
        .count()
    )
    booked_today = (
        db.query(Reservation)
        .join(Resource)
        .filter(
            Reservation.date == today,
            Reservation.status == ReservationStatus.active,
        )
        .count()
    )
    my_count = (
        db.query(Reservation)
        .filter(
            Reservation.user_id == current_user.id,
            Reservation.status == ReservationStatus.active,
            Reservation.date >= today,
        )
        .count()
    )
    available_desks = total_desks - (
        db.query(Reservation)
        .join(Resource)
        .filter(
            Reservation.date == today,
            Reservation.status == ReservationStatus.active,
            Resource.type == ResourceType.desk,
        )
        .count()
    )
    available_rooms = total_rooms - (
        db.query(Reservation)
        .join(Resource)
        .filter(
            Reservation.date == today,
            Reservation.status == ReservationStatus.active,
            Resource.type == ResourceType.room,
        )
        .count()
    )
    occupancy = (booked_today / (total_desks + total_rooms) * 100) if (total_desks + total_rooms) else 0

    trend = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        booked = (
            db.query(Reservation)
            .filter(
                Reservation.date == d,
                Reservation.status == ReservationStatus.active,
            )
            .count()
        )
        trend.append({"date": d.isoformat(), "booked": booked})

    floor_overview = []
    floors = db.query(Resource.floor).distinct().all()
    for (floor,) in floors:
        floor_desks = (
            db.query(Resource)
            .filter(
                Resource.floor == floor,
                Resource.is_active.is_(True),
                Resource.type == ResourceType.desk,
            )
            .count()
        )
        floor_booked = (
            db.query(Reservation)
            .join(Resource)
            .filter(
                Resource.floor == floor,
                Reservation.date == today,
                Reservation.status == ReservationStatus.active,
                Resource.type == ResourceType.desk,
            )
            .count()
        )
        floor_overview.append({
            "floor": floor,
            "occupancy": round(floor_booked / floor_desks * 100, 1) if floor_desks else 0,
        })

    return {
        "occupancy": round(occupancy, 1),
        "available_desks": available_desks,
        "available_rooms": available_rooms,
        "my_reservations": my_count,
        "trend": trend,
        "floor_overview": floor_overview,
    }
