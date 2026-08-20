from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import requests
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import func, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User, UserRole

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

DESK_PERMISSIONS = {
    "desk.reserve",
    "desk.cancel_own",
    "desk.view_floor",
    "reservation.read_all",
    "reservation.manage",
    "floor.read",
    "floor.manage",
    "resource.read",
    "resource.manage",
    "team.read",
    "team.manage",
    "analytics.read",
    "audit.read",
    "workspace.manage",
}

EMPLOYEE_PERMISSIONS = {
    "desk.reserve",
    "desk.cancel_own",
    "desk.view_floor",
    "floor.read",
    "resource.read",
    "team.read",
}


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def _shared_key() -> str | None:
    return settings.supabase_publishable_key or settings.supabase_anon_key


def _supabase_user(token: str) -> dict[str, Any] | None:
    """Validate a Supabase access token through the Auth user endpoint.

    This intentionally avoids shipping or configuring a service-role key in
    the Desk API.  Supabase's user endpoint validates the bearer token and
    returns the canonical Auth user identity.
    """

    if not settings.shared_auth_enabled or not settings.supabase_url:
        return None
    headers = {"Authorization": f"Bearer {token}"}
    if _shared_key():
        headers["apikey"] = _shared_key() or ""
    try:
        response = requests.get(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers=headers,
            timeout=settings.supabase_auth_timeout_seconds,
        )
    except requests.RequestException:
        return None
    if response.status_code != 200:
        return None
    try:
        payload = response.json()
    except ValueError:
        return None
    return payload if payload.get("id") else None


def _legacy_user_id(token: str) -> int | None:
    if not settings.legacy_auth_enabled:
        return None
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        value = payload.get("sub")
        return int(value) if value is not None else None
    except (JWTError, TypeError, ValueError):
        return None


def _organization_from_shared_identity(
    db: Session,
    supabase_user_id: str,
    metadata: dict[str, Any],
) -> tuple[str | None, str | None, str | None, set[str]]:
    """Resolve active company, company label, membership role and permissions."""

    company_id = None
    company_name = None
    membership_role = None
    permissions: set[str] = set()

    # Profiles are the same active-company source used by the existing
    # OperiX web/mobile clients.  The guarded query keeps the Desk bridge
    # importable during an incremental deployment before every shared table is
    # present in a local test database.
    try:
        profile = db.execute(
            text(
                """
                select coalesce(profile.active_company_id, profile.company_id)::text as company_id,
                       company.company_name
                from public.profiles profile
                left join public.companies company
                  on company.id = coalesce(profile.active_company_id, profile.company_id)
                where profile.id = :user_id
                """
            ),
            {"user_id": supabase_user_id},
        ).mappings().first()
        if profile:
            company_id = profile.get("company_id")
            company_name = profile.get("company_name")
    except SQLAlchemyError:
        db.rollback()

    # A profile can select the active company without carrying the membership
    # role itself. Resolve that role for the active company so owners,
    # administrators, and managers do not fall back to employee permissions.
    if company_id:
        for query in (
            """
            select membership.role
            from public.memberships membership
            where membership.user_id = :user_id
              and membership.company_id = cast(:company_id as uuid)
              and coalesce(membership.status, 'active') in ('active', 'approved')
            order by membership.created_at
            limit 1
            """,
            """
            select membership.role
            from public.memberships membership
            where membership.user_id = :user_id
              and membership.company_id = cast(:company_id as uuid)
            order by membership.created_at
            limit 1
            """,
        ):
            try:
                membership_role_row = db.execute(
                    text(query),
                    {"user_id": supabase_user_id, "company_id": company_id},
                ).mappings().first()
                if membership_role_row:
                    membership_role = membership_role_row.get("role")
                    break
            except SQLAlchemyError:
                db.rollback()

    # Memberships remain authoritative when a profile has not selected an
    # active company.  `status` was added after the original company schema,
    # so retry without it for older installations.
    if not company_id:
        membership = None
        for query in (
            """
            select membership.company_id::text as company_id,
                   membership.role,
                   company.company_name
            from public.memberships membership
            left join public.companies company on company.id = membership.company_id
            where membership.user_id = :user_id
              and coalesce(membership.status, 'active') in ('active', 'approved')
            order by membership.created_at
            limit 1
            """,
            """
            select membership.company_id::text as company_id,
                   membership.role,
                   company.company_name
            from public.memberships membership
            left join public.companies company on company.id = membership.company_id
            where membership.user_id = :user_id
            order by membership.created_at
            limit 1
            """,
        ):
            try:
                membership = db.execute(text(query), {"user_id": supabase_user_id}).mappings().first()
                if membership:
                    break
            except SQLAlchemyError:
                db.rollback()
        if membership:
            company_id = membership.get("company_id")
            company_name = membership.get("company_name")
            membership_role = membership.get("role")

    if not company_id and settings.default_company_id:
        company_id = settings.default_company_id

    # Resolve granular Desk permissions if the shared role tables are present.
    if company_id:
        try:
            rows = db.execute(
                text(
                    """
                    select distinct role_permission.permission_code
                    from public.memberships membership
                    join public.membership_role_assignments assignment
                      on assignment.membership_id = membership.id
                    join public.app_roles role on role.id = assignment.role_id
                    join public.app_role_permissions role_permission
                      on role_permission.role_id = role.id
                    where membership.user_id = :user_id
                      and membership.company_id = cast(:company_id as uuid)
                    """
                ),
                {"user_id": supabase_user_id, "company_id": company_id},
            ).all()
            permissions.update(row[0] for row in rows if row[0] in DESK_PERMISSIONS)
        except SQLAlchemyError:
            db.rollback()

    metadata_role = str(metadata.get("role") or metadata.get("app_role") or "").lower()
    effective_role = str(membership_role or metadata_role).lower()
    if effective_role in {
        "owner",
        "admin",
        "company_admin",
        "company_administrator",
        "super_administrator",
        "desk_admin",
    }:
        permissions.update(DESK_PERMISSIONS)
    elif effective_role in {"workspace_manager", "manager"}:
        permissions.update(
            {
                "desk.reserve",
                "desk.cancel_own",
                "desk.view_floor",
                "reservation.read_all",
                "reservation.manage",
                "floor.read",
                "resource.read",
                "team.read",
                "analytics.read",
                "workspace.manage",
            }
        )
    elif effective_role in {"team_manager", "team_leader", "lead"}:
        permissions.update(
            {
                "desk.reserve",
                "desk.cancel_own",
                "desk.view_floor",
                "floor.read",
                "resource.read",
                "team.read",
                "team.manage",
                "reservation.read_all",
            }
        )
    else:
        permissions.update(EMPLOYEE_PERMISSIONS)

    return company_id, company_name, effective_role or None, permissions


def _legacy_permissions(user: User) -> set[str]:
    if user.role == UserRole.admin:
        return set(DESK_PERMISSIONS)
    if user.role == UserRole.manager:
        return {
            "desk.reserve",
            "desk.cancel_own",
            "desk.view_floor",
            "reservation.read_all",
            "reservation.manage",
            "floor.read",
            "resource.read",
            "team.read",
            "analytics.read",
            "workspace.manage",
        }
    if user.role == UserRole.team_leader:
        return {
            "desk.reserve",
            "desk.cancel_own",
            "desk.view_floor",
            "floor.read",
            "resource.read",
            "team.read",
            "team.manage",
            "reservation.read_all",
        }
    return set(EMPLOYEE_PERMISSIONS)


def _link_user(
    db: Session,
    *,
    supabase_identity: dict[str, Any] | None = None,
    legacy_user_id: int | None = None,
) -> User | None:
    if supabase_identity:
        supabase_id = str(supabase_identity["id"])
        email = (supabase_identity.get("email") or "").strip().lower()
        user = db.query(User).filter(User.supabase_user_id == supabase_id).first()
        if not user and email:
            user = db.query(User).filter(func.lower(User.email) == email).first()
        organization_id, organization_name, shared_role, permissions = _organization_from_shared_identity(
            db, supabase_id, supabase_identity.get("user_metadata") or {}
        )
        if not user:
            if not email:
                return None
            metadata = supabase_identity.get("user_metadata") or {}
            full_name = (
                metadata.get("full_name")
                or metadata.get("name")
                or email.split("@", 1)[0]
            )
            user = User(
                email=email,
                hashed_password=hash_password(f"operix-shared-{supabase_id}"),
                full_name=str(full_name),
                role=UserRole.employee,
                supabase_user_id=supabase_id,
                organization_id=organization_id,
            )
            db.add(user)
        else:
            user.supabase_user_id = supabase_id
            if organization_id:
                user.organization_id = organization_id
        if shared_role in {"owner", "admin", "company_admin", "company_administrator", "super_administrator", "desk_admin"}:
            user.role = UserRole.admin
        elif shared_role in {"workspace_manager", "manager"} and user.role not in {UserRole.admin, UserRole.team_leader}:
            user.role = UserRole.manager
        elif shared_role in {"team_manager", "team_leader", "lead"} and user.role == UserRole.employee:
            user.role = UserRole.team_leader
        user._desk_permissions = permissions
        user._desk_role = shared_role or user.role.value
        user._organization_name = organization_name
        db.commit()
        db.refresh(user)
        # Refreshing clears only persisted state; reattach request metadata.
        user._desk_permissions = permissions
        user._desk_role = shared_role or user.role.value
        user._organization_name = organization_name
        return user

    if legacy_user_id is None:
        return None
    user = db.get(User, legacy_user_id)
    if user:
        user._desk_permissions = _legacy_permissions(user)
        user._desk_role = user.role.value
    return user


def get_current_user(
    token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception

    shared_identity = _supabase_user(token)
    user = _link_user(db, supabase_identity=shared_identity)
    if not user:
        user = _link_user(db, legacy_user_id=_legacy_user_id(token))
    if not user:
        raise credentials_exception
    if shared_identity and not getattr(user, "organization_id", None) and not settings.allow_legacy_unscoped_data:
        raise HTTPException(
            status_code=403,
            detail="Your OperiX account has no active organization membership",
        )
    return user


def user_has_permission(user: User, permission: str) -> bool:
    return permission in getattr(user, "_desk_permissions", set())


def require_permission(permission: str):
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if not user_has_permission(current_user, permission):
            raise HTTPException(status_code=403, detail=f"Missing permission: {permission}")
        return current_user

    return dependency


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not user_has_permission(current_user, "workspace.manage"):
        raise HTTPException(status_code=403, detail="Workspace administration required")
    return current_user


def require_manager_or_admin(current_user: User = Depends(get_current_user)) -> User:
    if not user_has_permission(current_user, "analytics.read"):
        raise HTTPException(status_code=403, detail="Manager or admin access required")
    return current_user
