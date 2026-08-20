from pydantic import BaseModel, Field


class DeviceTokenUpsert(BaseModel):
    push_token: str = Field(min_length=10, max_length=500)
    platform: str = Field(min_length=2, max_length=20)
    device_name: str | None = Field(default=None, max_length=120)
