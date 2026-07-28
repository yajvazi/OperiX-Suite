from pydantic import BaseModel


class FloorPlanOut(BaseModel):
    id: int
    name: str | None = None
    building: str
    floor: str
    image_url: str

    model_config = {"from_attributes": True}


class FloorPlanUpdate(BaseModel):
    name: str | None = None
    building: str
    floor: str
