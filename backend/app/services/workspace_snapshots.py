"""工作区快照：每次真实变更保存后落一份 JSON，滚动保留最近若干份。

快照目录默认跟随数据库文件（<数据库目录>/backups/workspace），因此本机仓库与
Docker 数据卷都会自动持久化。写入失败只记告警，绝不影响保存结果——快照是兜底，
不是保存链路的一环。
"""

import json
import logging
import re
from datetime import UTC, datetime
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

RETAINED_SNAPSHOTS = 50
_NAME = re.compile(r"^workspace-(\d{8}-\d{6})-r(\d+)(?:-\d+)?\.json$")


def snapshot_dir() -> Path:
    if settings.SNAPSHOT_DIR:
        return Path(settings.SNAPSHOT_DIR)
    prefix = "sqlite+aiosqlite:///"
    if settings.DATABASE_URL.startswith(prefix):
        # "///./tooling.db" 相对启动目录；"////data/tooling.db" 为绝对路径。
        database = Path(settings.DATABASE_URL[len(prefix) :]).resolve()
        return database.parent / "backups" / "workspace"
    return Path.cwd() / "backups" / "workspace"


def write_snapshot(document: dict, revision: int) -> None:
    """尽力而为地留档；任何 OSError 只记录告警。"""
    try:
        directory = snapshot_dir()
        directory.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
        path = directory / f"workspace-{stamp}-r{revision}.json"
        serial = 2
        while path.exists():  # 同秒同版本几乎不可能出现；真出现时加序号，不覆盖。
            path = directory / f"workspace-{stamp}-r{revision}-{serial}.json"
            serial += 1
        path.write_text(
            json.dumps(document, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        _prune(directory)
    except OSError:
        logger.warning("Workspace snapshot could not be written", exc_info=True)


def _prune(directory: Path) -> None:
    def sort_key(path: Path) -> tuple[str, int]:
        match = _NAME.match(path.name)
        return (match[1], int(match[2])) if match else (path.name, 0)

    snapshots = [path for path in directory.iterdir() if _NAME.match(path.name)]
    for stale in sorted(snapshots, key=sort_key)[:-RETAINED_SNAPSHOTS]:
        try:
            stale.unlink()
        except OSError:
            logger.warning("Stale snapshot %s could not be removed", stale)
