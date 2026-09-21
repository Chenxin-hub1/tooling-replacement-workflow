"""PUT 工作区后的自动快照：真实变更留档、幂等与冲突不留档、滚动清理、失败不阻塞。"""

import json
import re
from pathlib import Path

from app.config import settings
from app.services.workspace_snapshots import RETAINED_SNAPSHOTS, write_snapshot


def document(marker: int) -> dict:
    return {
        "v": 1,
        "savedAt": "2026-09-21T00:00:00Z",
        "projects": [],
        "PEOPLE": {"SDE": ["Daniel Wu"]},
        "EMAILS": {},
        "ADMINS": ["Carrie Chen"],
        "FUNCTIONS": ["SDE"],
        "TEAM_ROWS": [["SDE", "SDE"]],
        "REQUIRED_TEAM": ["SDE"],
        "MATRIX": [],
        "RULES": {
            "before": 5,
            "overdueEvery": 2,
            "escalateAfter": 5,
            "channel": "both",
        },
        "CUSTOM_SEQ": marker,
    }


def snapshots_in(directory: Path) -> list[Path]:
    # conftest 的数据库建在 tmp_path，快照目录默认跟随数据库。
    return sorted((directory / "backups" / "workspace").glob("*.json"))


async def test_changed_save_writes_exactly_one_snapshot(client, tmp_path):
    response = await client.put(
        "/api/workspace", json={"revision": 0, "snapshot": document(0)}
    )
    assert response.status_code == 200
    files = snapshots_in(tmp_path)
    assert len(files) == 1
    assert "r1" in files[0].name
    assert (
        json.loads(files[0].read_text(encoding="utf-8")) == response.json()["snapshot"]
    )


async def test_identical_retry_and_conflict_write_no_snapshot(client, tmp_path):
    await client.put("/api/workspace", json={"revision": 0, "snapshot": document(0)})
    retry = {**document(0), "savedAt": "2026-09-21T00:00:05Z"}
    assert (
        await client.put("/api/workspace", json={"revision": 0, "snapshot": retry})
    ).status_code == 200
    conflict = await client.put(
        "/api/workspace", json={"revision": 0, "snapshot": document(1)}
    )
    assert conflict.status_code == 409
    assert len(snapshots_in(tmp_path)) == 1


async def test_snapshot_failure_does_not_block_save(client, tmp_path, monkeypatch):
    blocker = tmp_path / "not-a-directory"
    blocker.write_text("occupied", encoding="utf-8")
    monkeypatch.setattr(settings, "SNAPSHOT_DIR", str(blocker / "workspace"))
    response = await client.put(
        "/api/workspace", json={"revision": 0, "snapshot": document(0)}
    )
    assert response.status_code == 200
    assert response.json()["revision"] == 1


def test_rollover_keeps_the_newest_snapshots(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "SNAPSHOT_DIR", str(tmp_path))
    for revision in range(1, RETAINED_SNAPSHOTS + 6):
        write_snapshot({"CUSTOM_SEQ": revision}, revision)
    files = list(tmp_path.glob("workspace-*.json"))
    assert len(files) == RETAINED_SNAPSHOTS
    revisions = sorted(
        int(match.group(1))
        for path in files
        if (match := re.search(r"r(\d+)", path.name))
    )
    # 55 次留档后应保留版本号最新的 50 份（6..55）。
    assert revisions == list(range(6, 6 + RETAINED_SNAPSHOTS))
