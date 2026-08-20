from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import csv
import io

from app.auth import get_current_user, require_admin, user_has_permission
from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.search import SearchResults, SearchResourceResult, SearchUserResult
from app.services.audit import record_audit
from app.schemas.team import TeamAssignment, TeamProfileUpdate
from app.schemas.auth import UserOut, UserUpdate
from app.models.resource import Resource
from app.models.reservation import Reservation
from app.models.favorite import Favorite
from app.services.workspace import scope_query
from datetime import date

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/today")
def who_is_in_today(
    floor: str | None = None,
    team: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return colleagues with an active desk reservation for today.

    This is intentionally reservation-backed: the Desk UI never fabricates
    attendance from a profile or seed list.
    """

    query = (
        scope_query(db.query(Reservation), Reservation, current_user)
        .join(User, Reservation.user_id == User.id)
        .join(Resource, Reservation.resource_id == Resource.id)
        .filter(
            Reservation.date == date.today(),
            Reservation.status == "active",
            Resource.type == "desk",
            User.organization_id == current_user.organization_id,
            Resource.organization_id == current_user.organization_id,
        )
        .order_by(User.full_name)
    )
    if floor:
        query = query.filter(Resource.floor == floor)
    if team:
        query = query.filter(User.team_name == team)

    people = []
    seen: set[int] = set()
    for reservation in query.all():
        if reservation.user_id in seen:
            continue
        seen.add(reservation.user_id)
        person = reservation.user
        resource = reservation.resource
        people.append(
            {
                "id": person.id,
                "full_name": person.full_name,
                "team_name": person.team_name,
                "job_title": person.job_title,
                "floor": resource.floor,
                "desk": resource.name,
                "zone": resource.zone,
                "resource_id": resource.id,
            }
        )
    return people


def _sync_team_members(
    db: Session,
    leader: User,
    teammate_ids: list[int],
    team_name: str | None = None,
    *,
    allow_reassign: bool = False,
    actor: User | None = None,
) -> User:
    if leader.role != UserRole.team_leader:
        raise HTTPException(status_code=400, detail="Selected user is not a team leader")

    if team_name is not None:
        cleaned_name = team_name.strip()
        if cleaned_name:
            leader.team_name = cleaned_name

    selected_ids = set(teammate_ids)
    teammates = (
        scope_query(db.query(User).filter(User.id.in_(selected_ids)), User, leader).all()
        if selected_ids
        else []
    )

    if len(teammates) != len(selected_ids):
        raise HTTPException(status_code=404, detail="One or more team members were not found")

    for teammate in teammates:
        if teammate.role != UserRole.employee:
            raise HTTPException(
                status_code=400,
                detail=f"{teammate.full_name} cannot be added to a team (employees only)",
            )
        if teammate.id == leader.id:
            raise HTTPException(status_code=400, detail="A team leader cannot be their own teammate")
        if (
            teammate.team_leader_id is not None
            and teammate.team_leader_id != leader.id
            and not allow_reassign
        ):
            raise HTTPException(
                status_code=400,
                detail=f"{teammate.full_name} is already assigned to another team",
            )

    current_teammates = (
        scope_query(db.query(User).filter(User.team_leader_id == leader.id), User, leader).all()
    )
    for member in current_teammates:
        if member.id not in selected_ids:
            member.team_leader_id = None
            if leader.team_name and member.team_name == leader.team_name:
                member.team_name = None

    resolved_team_name = leader.team_name
    for teammate in teammates:
        teammate.team_leader_id = leader.id
        if resolved_team_name:
            teammate.team_name = resolved_team_name

    db.commit()
    db.refresh(leader)
    if actor:
        record_audit(
            db,
            actor,
            "assign_team",
            "team",
            leader.id,
            f"Updated team '{leader.team_name or leader.full_name}' with {len(teammate_ids)} member(s)",
        )
        db.commit()
    return leader


@router.get("/search", response_model=SearchResults)
def search_workspace(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    term = f"%{q.strip()}%"
    resources = (
        scope_query(db.query(Resource), Resource, current_user)
        .filter(
            Resource.is_active.is_(True),
            (
                Resource.name.ilike(term)
                | Resource.floor.ilike(term)
                | Resource.zone.ilike(term)
                | Resource.type.ilike(term)
            ),
        )
        .order_by(Resource.name)
        .limit(8)
        .all()
    )
    users = (
        scope_query(db.query(User), User, current_user)
        .filter(
            User.full_name.ilike(term)
            | User.email.ilike(term)
            | User.job_title.ilike(term)
            | User.team_name.ilike(term)
        )
        .order_by(User.full_name)
        .limit(8)
        .all()
    )
    return SearchResults(
        resources=[
            SearchResourceResult(
                id=resource.id,
                name=resource.name,
                type=resource.type.value,
                floor=resource.floor,
                zone=resource.zone,
            )
            for resource in resources
        ],
        users=[
            SearchUserResult(
                id=user.id,
                full_name=user.full_name,
                email=user.email,
                role=user.role.value,
                job_title=user.job_title,
                team_name=user.team_name,
            )
            for user in users
        ],
    )


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    return scope_query(db.query(User), User, admin_user).order_by(User.full_name).all()


@router.get("/team-members", response_model=list[UserOut])
def list_team_members(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not user_has_permission(current_user, "team.read"):
        raise HTTPException(status_code=403, detail="Team leader access required")
    teammates = (
        scope_query(
            db.query(User).filter(User.team_leader_id == current_user.id), User, current_user
        )
        .order_by(User.full_name)
        .all()
    )
    return teammates


@router.get("/available-for-team", response_model=list[UserOut])
def list_available_for_team(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not user_has_permission(current_user, "team.manage"):
        raise HTTPException(status_code=403, detail="Team management access required")

    query = scope_query(db.query(User).filter(User.role == UserRole.employee), User, current_user)
    if current_user.role == UserRole.team_leader and not user_has_permission(current_user, "workspace.manage"):
        query = query.filter(
            (User.team_leader_id.is_(None)) | (User.team_leader_id == current_user.id)
        )
    query = query.order_by(User.full_name)
    return query.all()


@router.put("/me/team", response_model=UserOut)
def update_my_team(
    data: TeamProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not user_has_permission(current_user, "team.manage"):
        raise HTTPException(status_code=403, detail="Team leader access required")
    return _sync_team_members(
        db,
        current_user,
        data.teammate_ids,
        data.team_name,
        allow_reassign=False,
        actor=current_user,
    )


@router.post("/{leader_id}/team", response_model=UserOut)
def assign_team_members(
    leader_id: int,
    data: TeamAssignment,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    leader = scope_query(
        db.query(User).filter(User.id == leader_id), User, admin_user
    ).first()
    if not leader:
        raise HTTPException(status_code=404, detail="User not found")
    return _sync_team_members(
        db,
        leader,
        data.teammate_ids,
        data.team_name,
        allow_reassign=True,
        actor=admin_user,
    )


@router.get("/export")
def export_users_csv(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    users = scope_query(db.query(User), User, admin_user).order_by(User.full_name).all()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "id",
        "full_name",
        "email",
        "role",
        "job_title",
        "department",
        "specialization",
        "experience_level",
        "skills",
        "availability",
        "team_name",
        "team_leader_id",
    ])
    for user in users:
        skills = user.skills if isinstance(user.skills, list) else []
        writer.writerow([
            user.id,
            user.full_name,
            user.email,
            user.role.value,
            user.job_title or "",
            user.department or "",
            user.specialization.value if user.specialization else "",
            user.experience_level.value if user.experience_level else "",
            ", ".join(skills),
            user.availability if user.availability is not None else "",
            user.team_name or "",
            user.team_leader_id or "",
        ])
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=operix-desk-users.csv"},
    )


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    user = scope_query(
        db.query(User).filter(User.id == user_id), User, admin_user
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if data.full_name is not None:
        user.full_name = data.full_name
    if data.role is not None:
        user.role = data.role
    if data.job_title is not None:
        user.job_title = data.job_title
    if data.team_name is not None:
        user.team_name = data.team_name
    if data.department is not None:
        user.department = data.department
    if data.specialization is not None:
        user.specialization = data.specialization
    if data.experience_level is not None:
        user.experience_level = data.experience_level
    if data.skills is not None:
        user.skills = data.skills
    if data.availability is not None:
        user.availability = data.availability
    if data.team_leader_id is not None:
        leader = scope_query(
            db.query(User).filter(User.id == data.team_leader_id), User, admin_user
        ).first()
        if not leader or leader.role != UserRole.team_leader:
            raise HTTPException(status_code=400, detail="Invalid team leader")
        user.team_leader_id = data.team_leader_id

    db.commit()
    db.refresh(user)
    record_audit(
        db,
        admin_user,
        "update_user",
        "user",
        user.id,
        f"Updated {user.email}",
    )
    db.commit()
    return user


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    user = scope_query(
        db.query(User).filter(User.id == user_id), User, current_user
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    email = user.email
    scope_query(
        db.query(User).filter(User.team_leader_id == user.id), User, current_user
    ).update(
        {User.team_leader_id: None}, synchronize_session=False
    )
    db.query(Reservation).filter(
        Reservation.user_id == user.id,
        Reservation.organization_id == user.organization_id,
    ).delete(
        synchronize_session=False
    )
    db.query(Favorite).filter(
        Favorite.user_id == user.id,
        Favorite.organization_id == user.organization_id,
    ).delete(
        synchronize_session=False
    )
    db.delete(user)
    record_audit(
        db,
        current_user,
        "delete_user",
        "user",
        user_id,
        f"Deleted {email}",
    )
    db.commit()
    return {"detail": "User deleted"}
