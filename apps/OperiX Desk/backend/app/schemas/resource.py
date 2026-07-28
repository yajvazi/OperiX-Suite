from pydantic import BaseModel, Field

from app.models.resource import ResourceType


class ResourceBase(BaseModel):
    name: str
    type: ResourceType
    building: str = "HQ - Prishtina"
    floor: str
    zone: str
    capacity: int = 1
    amenities: str | None = None
    desk_type: str | None = None
    restricted_to_team_leaders: bool = False
    floor_plan_x: float | None = None
    floor_plan_y: float | None = None


class ResourceCreate(ResourceBase):
    pass


class ResourceUpdate(BaseModel):
    name: str | None = None
    type: ResourceType | None = None
    building: str | None = None
    floor: str | None = None
    zone: str | None = None
    capacity: int | None = None
    amenities: str | None = None
    desk_type: str | None = None
    restricted_to_team_leaders: bool | None = None
    floor_plan_x: float | None = None
    floor_plan_y: float | None = None
    is_active: bool | None = None


class ResourceOut(ResourceBase):
    id: int
    is_active: bool
    is_available: bool | None = None
    reserved_by: str | None = None
    is_mine: bool | None = None
    is_favorite: bool | None = None

    model_config = {"from_attributes": True}


class ResourcePositionUpdate(BaseModel):
    floor_plan_x: float = Field(ge=0, le=100)
    floor_plan_y: float = Field(ge=0, le=100)
