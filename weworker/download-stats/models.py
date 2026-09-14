from typing import List

from pydantic import BaseModel


class DownloadRequest(BaseModel):
    version: str
    platform: str


class DownloadResponse(BaseModel):
    version: str
    platform: str
    count: int
    updated_at: str


class VersionSummary(BaseModel):
    version: str
    count: int


class PlatformSummary(BaseModel):
    platform: str
    total_count: int
    versions: List[VersionSummary]


class SummaryResponse(BaseModel):
    platforms: List[PlatformSummary]
    grand_total: int
