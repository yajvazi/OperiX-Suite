from datetime import date, time

from pydantic import BaseModel

from app.models.reservation import ReservationStatus
from app.schemas.resource import ResourceOut


class ReservationCreate(BaseModel):
    resource_id: int
    date: date
    start_time: time | None = None
    end_time: time | None = None
    repeat_weeks: int = 0


class TeamDeskBookingItem(BaseModel):
    user_id: int
    resource_id: int


class TeamDeskBookingCreate(BaseModel):
    date: date
    bookings: list[TeamDeskBookingItem]
    repeat_weeks: int = 0


class ReservationUpdate(BaseModel):
    resource_id: int
    date: date
    start_time: time | None = None
    end_time: time | None = None


class ReservationOut(BaseModel):
    id: int
    user_id: int
    resource_id: int
    date: date
    start_time: time | None = None
    end_time: time | None = None
    status: ReservationStatus
    resource: ResourceOut | None = None
    user_name: str | None = None

    model_config = {"from_attributes": True}
