from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FloorPlan(Base):
    __tablename__ = "floor_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    building: Mapped[str] = mapped_column(String(100), default="HQ")
    floor: Mapped[str] = mapped_column(String(50), unique=True)
    image_path: Mapped[str] = mapped_column(String(500))
