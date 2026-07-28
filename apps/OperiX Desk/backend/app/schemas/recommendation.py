from pydantic import BaseModel

from app.schemas.resource import ResourceOut


class TeamDeskRecommendation(BaseModel):
    team_name: str | None = None
    team_zone: str | None = None
    resources: list[ResourceOut]
