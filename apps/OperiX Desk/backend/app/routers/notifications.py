from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.device_token import DeviceToken
from app.models.user import User
from app.schemas.device_token import DeviceTokenUpsert
from app.services.workspace import require_organization

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post("/devices", status_code=204)
def register_device(
    data: DeviceTokenUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    organization_id = require_organization(current_user)
    token = db.query(DeviceToken).filter(DeviceToken.push_token == data.push_token).first()
    if token and (token.user_id != current_user.id or token.organization_id != organization_id):
        raise HTTPException(status_code=409, detail="This device token belongs to another account")
    if not token:
        token = DeviceToken(
            push_token=data.push_token,
            user_id=current_user.id,
            organization_id=organization_id,
            platform=data.platform,
            device_name=data.device_name,
        )
        db.add(token)
    else:
        token.user_id = current_user.id
        token.organization_id = organization_id
        token.platform = data.platform
        token.device_name = data.device_name
        token.is_active = True
        token.last_seen_at = datetime.now(timezone.utc)
    db.commit()


@router.delete("/devices", status_code=204)
def unregister_device(
    push_token: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    organization_id = require_organization(current_user)
    token = (
        db.query(DeviceToken)
        .filter(
            DeviceToken.push_token == push_token,
            DeviceToken.user_id == current_user.id,
            DeviceToken.organization_id == organization_id,
        )
        .first()
    )
    if token:
        token.is_active = False
        db.commit()
