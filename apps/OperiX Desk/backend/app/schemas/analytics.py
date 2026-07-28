from pydantic import BaseModel


class DailyOccupancy(BaseModel):
    date: str
    occupancy: float
    booked: int
    total: int


class DeskUsage(BaseModel):
    name: str
    bookings: int
    utilization: float


class DayCount(BaseModel):
    day: str
    count: int


class FloorUtilization(BaseModel):
    floor: str
    utilization: float


class AnalyticsDashboard(BaseModel):
    total_desks: int
    total_rooms: int
    active_reservations: int
    occupancy_rate: float
    occupancy_trend: list[DailyOccupancy]
    busiest_days: list[DayCount]
    floor_utilization: list[FloorUtilization]
    most_used_desks: list[DeskUsage]
    least_used_desks: list[DeskUsage]
    recent_activity: list[str]
