import aiosqlite
import uuid
from datetime import datetime, timezone
from typing import Optional

from config import DB_PATH


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class DownloadStore:
    def __init__(self, db_path=DB_PATH):
        self.db_path = db_path

    async def init(self):
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS download_records (
                    id TEXT PRIMARY KEY,
                    version TEXT NOT NULL,
                    platform TEXT NOT NULL,
                    count INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(version, platform)
                )
            """)
            await db.commit()

    async def record_download(self, version: str, platform: str) -> dict:
        now = _now()
        async with aiosqlite.connect(self.db_path) as db:
            # Try to increment existing record
            cursor = await db.execute(
                "UPDATE download_records SET count = count + 1, updated_at = ? WHERE version = ? AND platform = ?",
                (now, version, platform),
            )
            if cursor.rowcount == 0:
                # No existing record, create one
                record_id = str(uuid.uuid4())
                await db.execute(
                    "INSERT INTO download_records (id, version, platform, count, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
                    (record_id, version, platform, now, now),
                )
            await db.commit()

            # Fetch the updated/inserted record
            async with db.execute(
                "SELECT version, platform, count, updated_at FROM download_records WHERE version = ? AND platform = ?",
                (version, platform),
            ) as cur:
                row = await cur.fetchone()
            return {"version": row[0], "platform": row[1], "count": row[2], "updated_at": row[3]}

    async def get_summary(self, platform: Optional[str] = None) -> dict:
        async with aiosqlite.connect(self.db_path) as db:
            if platform:
                # Get total count per platform
                async with db.execute(
                    "SELECT platform, SUM(count) as total_count FROM download_records WHERE platform = ? GROUP BY platform",
                    (platform,),
                ) as cur:
                    platform_rows = await cur.fetchall()
                # Get version details for the platform
                async with db.execute(
                    "SELECT version, count FROM download_records WHERE platform = ? ORDER BY count DESC",
                    (platform,),
                ) as cur:
                    version_rows = await cur.fetchall()
            else:
                # Get total count per platform
                async with db.execute(
                    "SELECT platform, SUM(count) as total_count FROM download_records GROUP BY platform",
                ) as cur:
                    platform_rows = await cur.fetchall()
                # Get all version details
                async with db.execute(
                    "SELECT platform, version, count FROM download_records ORDER BY platform, count DESC",
                ) as cur:
                    version_rows = await cur.fetchall()

        # Build platform summaries with version details
        platforms_dict = {}
        for r in platform_rows:
            platforms_dict[r[0]] = {"platform": r[0], "total_count": r[1], "versions": []}

        if platform:
            for vr in version_rows:
                platforms_dict[platform]["versions"].append({"version": vr[0], "count": vr[1]})
        else:
            for vr in version_rows:
                platforms_dict[vr[0]]["versions"].append({"version": vr[1], "count": vr[2]})

        platforms = list(platforms_dict.values())
        grand_total = sum(p["total_count"] for p in platforms)
        return {"platforms": platforms, "grand_total": grand_total}


# Global singleton
store = DownloadStore()
