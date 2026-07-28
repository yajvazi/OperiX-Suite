from pydantic import BaseModel, Field


class TeamAssignment(BaseModel):
    teammate_ids: list[int] = Field(default_factory=list)
    team_name: str | None = None


class TeamProfileUpdate(BaseModel):
    team_name: str | None = None
    teammate_ids: list[int] = Field(default_factory=list)
