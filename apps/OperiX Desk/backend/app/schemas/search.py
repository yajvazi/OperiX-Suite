from pydantic import BaseModel


class SearchResourceResult(BaseModel):
    id: int
    name: str
    type: str
    floor: str
    zone: str


class SearchUserResult(BaseModel):
    id: int
    full_name: str
    email: str
    role: str
    job_title: str | None = None
    team_name: str | None = None


class SearchResults(BaseModel):
    resources: list[SearchResourceResult]
    users: list[SearchUserResult]
