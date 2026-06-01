from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, field_serializer


class FileResponse(BaseModel):
    id: UUID
    filename: str
    original_filename: str
    status: str
    file_size_bytes: int
    row_count: int | None
    date_min: datetime | None
    date_max: datetime | None
    stations: list[str]
    connector_types: list[str]
    created_at: datetime
    processed_at: datetime | None
    error_message: str | None

    model_config = {"from_attributes": True}

    @field_serializer("id")
    def serialize_id(self, v: UUID) -> str:
        return str(v)
