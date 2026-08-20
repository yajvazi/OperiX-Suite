"""Organization scoping helpers shared by Desk routers and services.

The legacy Desk schema uses integer identifiers.  The OperiX Suite uses a
UUID company identifier, so this module deliberately treats the bridge as an
opaque string and applies it to every Desk query.  Rows without a company are
not silently exposed in shared-auth production mode.
"""

from __future__ import annotations

from typing import Any, TypeVar

from fastapi import HTTPException
from sqlalchemy import false
from sqlalchemy.orm import Query

from app.config import settings

ModelT = TypeVar("ModelT")


def require_organization(user: Any) -> str:
    organization_id = getattr(user, "organization_id", None) or settings.default_company_id
    if not organization_id:
        raise HTTPException(
            status_code=403,
            detail="Your OperiX account has no active organization membership",
        )
    return str(organization_id)


def scope_query(query: Query, model: type[ModelT], user: Any) -> Query:
    """Scope a SQLAlchemy query to the caller's active organization.

    `ALLOW_LEGACY_UNSCOPED_DATA` exists only for a controlled migration window.
    It is disabled by default so a missing backfill cannot become a tenant
    isolation bug.
    """

    organization_id = getattr(user, "organization_id", None) or settings.default_company_id
    column = getattr(model, "organization_id", None)
    if column is None:
        return query.filter(false())
    if organization_id:
        return query.filter(column == str(organization_id))
    if settings.allow_legacy_unscoped_data:
        return query.filter(column.is_(None))
    return query.filter(false())


def stamp_organization(entity: Any, user: Any) -> Any:
    entity.organization_id = require_organization(user)
    return entity


def assert_same_organization(entity: Any, user: Any) -> Any:
    expected = require_organization(user)
    actual = getattr(entity, "organization_id", None)
    if actual != expected:
        raise HTTPException(status_code=404, detail="Resource not found")
    return entity


def same_organization(left: Any, right: Any) -> bool:
    left_id = getattr(left, "organization_id", None)
    right_id = getattr(right, "organization_id", None)
    if left_id and right_id:
        return str(left_id) == str(right_id)
    return bool(settings.allow_legacy_unscoped_data and not left_id and not right_id)
