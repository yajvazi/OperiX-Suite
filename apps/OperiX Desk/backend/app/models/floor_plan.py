from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FloorPlan(Base):
    __tablename__ = "floor_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[str | None] = mapped_column(
        "company_id", String(64), nullable=True, index=True
    )
    name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    building: Mapped[str] = mapped_column(String(100), default="HQ")
    # Floor names repeat across organizations; tenant-scoped uniqueness is
    # enforced by the shared migration instead of a global ORM constraint.
    floor: Mapped[str] = mapped_column(String(50))
    image_path: Mapped[str] = mapped_column(String(500))
