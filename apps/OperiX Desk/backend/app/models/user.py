import enum
from datetime import datetime
from typing import ClassVar

from sqlalchemy import DateTime, Enum, Float, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class UserRole(str, enum.Enum):
    employee = "employee"
    team_leader = "team_leader"
    manager = "manager"
    admin = "admin"


class ExperienceLevel(str, enum.Enum):
    junior = "junior"
    mid = "mid"
    senior = "senior"


class Specialization(str, enum.Enum):
    frontend = "frontend"
    backend = "backend"
    fullstack = "fullstack"
    ai_ml = "ai_ml"
    data_engineering = "data_engineering"
    data_science = "data_science"
    devops = "devops"
    qa = "qa"
    design = "design"
    product = "product"
    operations = "operations"
    general = "general"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    # `company_id` is the shared OperiX organization identifier.  The Desk
    # database keeps its legacy integer primary keys, while this bridge lets
    # shared Supabase Auth users own the same records without a destructive
    # rewrite.
    supabase_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    organization_id: Mapped[str | None] = mapped_column(
        "company_id", String(64), nullable=True, index=True
    )
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.employee)
    full_name: Mapped[str] = mapped_column(String(255))
    job_title: Mapped[str | None] = mapped_column(String(150), nullable=True)
    team_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    department: Mapped[str | None] = mapped_column(String(120), nullable=True)
    specialization: Mapped[Specialization | None] = mapped_column(
        Enum(Specialization), nullable=True
    )
    experience_level: Mapped[ExperienceLevel | None] = mapped_column(
        Enum(ExperienceLevel), nullable=True
    )
    skills: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    availability: Mapped[float | None] = mapped_column(Float, nullable=True)
    profile_image_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    team_leader_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    password_reset_token_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_reset_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    must_change_password: Mapped[bool] = mapped_column(default=False)

    # Populated by the shared-auth resolver for the lifetime of a request.
    # It is intentionally not persisted on the legacy Desk users table.
    _desk_permissions: ClassVar[set[str]] = set()
    _desk_role: ClassVar[str | None] = None
    _organization_name: ClassVar[str | None] = None

    @property
    def permissions(self) -> list[str]:
        return sorted(self._desk_permissions)

    @property
    def desk_role(self) -> str | None:
        return self._desk_role

    @property
    def organization_name(self) -> str | None:
        return self._organization_name

    reservations = relationship("Reservation", back_populates="user")
    favorites = relationship("Favorite", back_populates="user", cascade="all, delete-orphan")
    teammates = relationship(
        "User",
        back_populates="team_leader",
        cascade="all",
        foreign_keys="User.team_leader_id",
    )
    team_leader = relationship(
        "User",
        back_populates="teammates",
        remote_side="User.id",
        foreign_keys=[team_leader_id],
    )

    def __repr__(self) -> str:
        return f"<User {self.email} role={self.role.value}>"
