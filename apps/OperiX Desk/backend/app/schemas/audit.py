from datetime import datetime

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: int
    actor_id: int
    actor_name: str
    action: str
    entity_type: str
    entity_id: int | None = None
    details: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
