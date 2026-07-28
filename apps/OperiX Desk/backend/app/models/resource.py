import enum

from sqlalchemy import Boolean, Enum, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ResourceType(str, enum.Enum):
    desk = "desk"
    room = "room"
    amenity = "amenity"


class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    type: Mapped[ResourceType] = mapped_column(Enum(ResourceType))
    building: Mapped[str] = mapped_column(String(120), default="HQ - Prishtina")
    floor: Mapped[str] = mapped_column(String(50))
    zone: Mapped[str] = mapped_column(String(100))
    floor_plan_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    floor_plan_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    capacity: Mapped[int] = mapped_column(default=1)
    amenities: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    restricted_to_team_leaders: Mapped[bool] = mapped_column(Boolean, default=False)
    desk_type: Mapped[str | None] = mapped_column(String(100), nullable=True)

    reservations = relationship("Reservation", back_populates="resource")
    favorites = relationship("Favorite", back_populates="resource", cascade="all, delete-orphan")
