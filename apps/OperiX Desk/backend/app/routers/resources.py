from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from collections import Counter

from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.database import get_db
from app.models.favorite import Favorite
from app.models.floor_plan import FloorPlan
from app.models.reservation import Reservation, ReservationStatus
from app.models.resource import Resource, ResourceType
from app.models.user import User
from app.schemas.recommendation import TeamDeskRecommendation
from app.schemas.resource import (
    ResourceCreate,
    ResourceOut,
    ResourcePositionUpdate,
    ResourceUpdate,
)
from app.services.workspace import scope_query, stamp_organization

router = APIRouter(prefix="/resources", tags=["resources"])


def _apply_floor_plan_location(
    resource: Resource,
    floor_value: str,
    db: Session,
    current_user: User,
):
    plan = scope_query(
        db.query(FloorPlan).filter(FloorPlan.floor == floor_value),
        FloorPlan,
        current_user,
    ).first()
    if not plan:
        raise HTTPException(status_code=400, detail="Select an existing floor plan floor first")
    resource.floor = plan.floor
    resource.building = plan.building


def _enrich_resource(
    resource: Resource,
    booking_date: date | None,
    current_user: User,
    db: Session,
) -> ResourceOut:
    out = ResourceOut.model_validate(resource)
    out.is_available = True
    out.is_mine = False
    out.reserved_by = None
    out.is_favorite = (
        db.query(Favorite)
        .filter(
            Favorite.user_id == current_user.id,
            Favorite.resource_id == resource.id,
            Favorite.organization_id == resource.organization_id,
        )
        .first()
        is not None
    )

    if booking_date:
        reservation = (
            db.query(Reservation)
            .filter(
                Reservation.resource_id == resource.id,
                Reservation.date == booking_date,
                Reservation.status == ReservationStatus.active,
                Reservation.organization_id == resource.organization_id,
            )
            .first()
        )
        if reservation:
            out.is_available = False
            if reservation.user_id == current_user.id:
                out.is_mine = True
            else:
                reserver = db.get(User, reservation.user_id)
                out.reserved_by = reserver.full_name if reserver else "Reserved"
    return out


@router.get("", response_model=list[ResourceOut])
def list_resources(
    booking_date: date | None = Query(None, alias="date"),
    floor: str | None = None,
    zone: str | None = None,
    type: ResourceType | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = scope_query(
        db.query(Resource).filter(Resource.is_active.is_(True)),
        Resource,
        current_user,
    )
    if floor:
        query = query.filter(Resource.floor == floor)
    if zone:
        query = query.filter(Resource.zone == zone)
    if type:
        query = query.filter(Resource.type == type)
    resources = query.order_by(Resource.floor, Resource.name).all()
    return [_enrich_resource(r, booking_date, current_user, db) for r in resources]


@router.get("/recommendations/team", response_model=TeamDeskRecommendation)
def recommend_near_team(
    booking_date: date | None = Query(None, alias="date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.team_name:
        resources = (
            scope_query(db.query(Resource), Resource, current_user)
            .filter(Resource.is_active.is_(True), Resource.type == ResourceType.desk)
            .limit(6)
            .all()
        )
        return TeamDeskRecommendation(
            team_name=None,
            team_zone=None,
            resources=[_enrich_resource(r, booking_date, current_user, db) for r in resources],
        )

    teammates = (
        db.query(User.id)
        .filter(
            User.team_name == current_user.team_name,
            User.id != current_user.id,
            User.organization_id == current_user.organization_id,
        )
        .subquery()
    )
    recent_reservations = (
        db.query(Reservation, Resource.zone)
        .join(Resource, Reservation.resource_id == Resource.id)
        .filter(
            Reservation.user_id.in_(teammates),
            Reservation.status == ReservationStatus.active,
            Reservation.organization_id == current_user.organization_id,
            Resource.organization_id == current_user.organization_id,
        )
        .all()
    )
    zone = None
    if recent_reservations:
        zone = Counter(z for _, z in recent_reservations).most_common(1)[0][0]

    query = scope_query(
        db.query(Resource).filter(Resource.is_active.is_(True), Resource.type == ResourceType.desk),
        Resource,
        current_user,
    )
    if zone:
        query = query.filter(Resource.zone == zone)
    resources = query.order_by(Resource.floor, Resource.name).limit(12).all()
    return TeamDeskRecommendation(
        team_name=current_user.team_name,
        team_zone=zone,
        resources=[_enrich_resource(r, booking_date, current_user, db) for r in resources],
    )


@router.post("/{resource_id}/favorite", response_model=ResourceOut)
def add_favorite(
    resource_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    resource = scope_query(
        db.query(Resource).filter(Resource.id == resource_id), Resource, current_user
    ).first()
    if not resource or not resource.is_active:
        raise HTTPException(status_code=404, detail="Resource not found")

    favorite = (
        db.query(Favorite)
        .filter(
            Favorite.user_id == current_user.id,
            Favorite.resource_id == resource_id,
        )
        .first()
    )
    if not favorite:
        favorite = Favorite(
            user_id=current_user.id,
            resource_id=resource_id,
            organization_id=resource.organization_id or current_user.organization_id,
        )
        db.add(favorite)
        db.commit()

    return _enrich_resource(resource, None, current_user, db)


@router.delete("/{resource_id}/favorite", response_model=ResourceOut)
def remove_favorite(
    resource_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    resource = scope_query(
        db.query(Resource).filter(Resource.id == resource_id), Resource, current_user
    ).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")

    favorite = (
        db.query(Favorite)
        .filter(
            Favorite.user_id == current_user.id,
            Favorite.resource_id == resource_id,
        )
        .first()
    )
    if favorite:
        db.delete(favorite)
        db.commit()

    return _enrich_resource(resource, None, current_user, db)


@router.get("/floors")
def list_floors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    floors = scope_query(
        db.query(FloorPlan.floor), FloorPlan, current_user
    ).distinct().order_by(FloorPlan.floor).all()
    return [f[0] for f in floors]


@router.get("/zones")
def list_zones(
    floor: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = scope_query(
        db.query(Resource.zone).filter(Resource.is_active.is_(True)),
        Resource,
        current_user,
    )
    if floor:
        query = query.filter(Resource.floor == floor)
    zones = query.distinct().order_by(Resource.zone).all()
    return [z[0] for z in zones]


@router.post("", response_model=ResourceOut)
def create_resource(
    data: ResourceCreate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    resource = Resource(**data.model_dump())
    stamp_organization(resource, admin_user)
    _apply_floor_plan_location(resource, data.floor, db, admin_user)
    db.add(resource)
    db.commit()
    db.refresh(resource)
    return ResourceOut.model_validate(resource)


@router.put("/{resource_id}", response_model=ResourceOut)
def update_resource(
    resource_id: int,
    data: ResourceUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    resource = scope_query(
        db.query(Resource).filter(Resource.id == resource_id), Resource, admin_user
    ).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        if key == "building":
            continue
        setattr(resource, key, value)
    if "floor" in data.model_dump(exclude_unset=True):
        _apply_floor_plan_location(resource, resource.floor, db, admin_user)
    db.commit()
    db.refresh(resource)
    return ResourceOut.model_validate(resource)


@router.patch("/{resource_id}/position", response_model=ResourceOut)
def update_position(
    resource_id: int,
    data: ResourcePositionUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    resource = scope_query(
        db.query(Resource).filter(Resource.id == resource_id), Resource, admin_user
    ).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    resource.floor_plan_x = data.floor_plan_x
    resource.floor_plan_y = data.floor_plan_y
    db.commit()
    db.refresh(resource)
    return ResourceOut.model_validate(resource)


@router.delete("/{resource_id}")
def delete_resource(
    resource_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    resource = scope_query(
        db.query(Resource).filter(Resource.id == resource_id), Resource, admin_user
    ).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")

    reservation_count = (
        db.query(Reservation)
        .filter(
            Reservation.resource_id == resource_id,
            Reservation.organization_id == resource.organization_id,
        )
        .count()
    )
    favorite_count = (
        db.query(Favorite)
        .filter(
            Favorite.resource_id == resource_id,
            Favorite.organization_id == resource.organization_id,
        )
        .count()
    )

    db.query(Favorite).filter(
        Favorite.resource_id == resource_id,
        Favorite.organization_id == resource.organization_id,
    ).delete(
        synchronize_session=False,
    )
    db.query(Reservation).filter(
        Reservation.resource_id == resource_id,
        Reservation.organization_id == resource.organization_id,
    ).delete(
        synchronize_session=False,
    )
    db.delete(resource)
    db.commit()
    return {
        "detail": "Resource deleted",
        "affected_reservations": reservation_count,
        "affected_favorites": favorite_count,
    }
