"""停服后安装 Git 中的工作区数据库，先验证、迁移并备份，再替换数据文件。"""

import argparse
import os
import sqlite3
import tempfile
from contextlib import closing
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from app.db.migrations import migrate_database
from app.schemas.workspace import WorkspaceSnapshot


@dataclass(frozen=True)
class InstallationResult:
    backup_directory: Path
    revision: int
    projects: int
    imported_projects: int
    imported_completed: int


def read_revision(database: sqlite3.Connection) -> int:
    if not database.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='workspaces'"
    ).fetchone():
        return 0
    row = database.execute("SELECT revision FROM workspaces WHERE id=1").fetchone()
    if row is None:
        return 0
    revision = row[0]
    if type(revision) is not int or revision < 0:
        raise ValueError("Workspace revision must be a nonnegative integer")
    return revision


def validate_database(database: sqlite3.Connection) -> None:
    if database.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
        raise ValueError("Database integrity check failed")
    if database.execute("PRAGMA foreign_key_check").fetchall():
        raise ValueError("Database foreign key check failed")


def read_workspace(database: sqlite3.Connection) -> WorkspaceSnapshot:
    row = database.execute("SELECT document FROM workspaces WHERE id=1").fetchone()
    if row is None:
        raise ValueError("Release database does not contain workspace 1")
    return WorkspaceSnapshot.model_validate_json(row[0])


def companions(database: Path) -> tuple[Path, Path, Path]:
    return database, Path(f"{database}-wal"), Path(f"{database}-shm")


def install_database(source: Path, target: Path) -> InstallationResult:
    source = source.resolve()
    target = target.resolve()
    if not source.is_file():
        raise ValueError("Release database does not exist")
    if source == target or (target.exists() and source.samefile(target)):
        raise ValueError("Release and target databases must be different files")
    source_wal = Path(f"{source}-wal")
    if source_wal.exists() and source_wal.stat().st_size:
        raise ValueError("Release database has a WAL file; checkpoint it first")
    if not target.exists() and any(path.exists() for path in companions(target)[1:]):
        raise ValueError("Target has SQLite sidecars without a database")

    # Git 数据库必须已合并 WAL；immutable 避免只读挂载仍尝试创建 SHM 文件。
    with closing(
        sqlite3.connect(source.as_uri() + "?mode=ro&immutable=1", uri=True)
    ) as release:
        validate_database(release)
        snapshot = read_workspace(release)
        release_revision = read_revision(release)
        target.parent.mkdir(parents=True, exist_ok=True)
        descriptor, name = tempfile.mkstemp(
            prefix=".tooling-release-", suffix=".db", dir=target.parent
        )
        os.close(descriptor)
        staged = Path(name)
        try:
            with closing(sqlite3.connect(staged)) as candidate:
                release.backup(candidate)
            # 迁移只作用于临时副本；迁移失败时服务器数据库尚未改动。
            migrate_database(f"sqlite+aiosqlite:///{staged}")
            with closing(sqlite3.connect(staged)) as candidate:
                validate_database(candidate)
                read_workspace(candidate)

            backups = target.parent / "backups"
            backups.mkdir(exist_ok=True)
            stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S-")
            backup_directory = Path(
                tempfile.mkdtemp(prefix=f"deploy-{stamp}", dir=backups)
            )
            old_revision = 0
            if target.exists():
                # 旧库不能使用 immutable：备份必须包括已提交但尚未合并的 WAL。
                with closing(
                    sqlite3.connect(target.as_uri() + "?mode=ro", uri=True)
                ) as previous:
                    validate_database(previous)
                    old_revision = read_revision(previous)
                    with closing(
                        sqlite3.connect(backup_directory / "snapshot.db")
                    ) as backup:
                        previous.backup(backup)
                        validate_database(backup)

            revision = max(old_revision, release_revision) + 1
            with closing(sqlite3.connect(staged)) as candidate:
                candidate.execute(
                    "UPDATE workspaces SET revision=? WHERE id=1", (revision,)
                )
                candidate.commit()
                # 安装的是独立主文件；不把临时文件名对应的 WAL 遗留在数据卷。
                if (
                    candidate.execute("PRAGMA journal_mode=DELETE").fetchone()[0]
                    != "delete"
                ):
                    raise ValueError("Staged database could not leave WAL mode")
                validate_database(candidate)
                read_workspace(candidate)
            with staged.open("rb") as handle:
                os.fsync(handle.fileno())

            moved: list[tuple[Path, Path]] = []
            try:
                # 目标与临时库的连接已经关闭，才允许移动原文件及其伴随文件。
                for current in companions(target):
                    if current.exists():
                        archived = backup_directory / current.name
                        os.replace(current, archived)
                        moved.append((current, archived))
                os.replace(staged, target)
            except BaseException:
                for current, archived in reversed(moved):
                    os.replace(archived, current)
                raise
        finally:
            for temporary in companions(staged):
                temporary.unlink(missing_ok=True)

    imported = [
        project
        for project in snapshot.projects
        if (project.model_extra or {}).get("importSource")
    ]
    return InstallationResult(
        backup_directory=backup_directory,
        revision=revision,
        projects=len(snapshot.projects),
        imported_projects=len(imported),
        imported_completed=sum(
            bool(action.get("done"))
            for project in imported
            for action in project.actions
        ),
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Install a release workspace database after stopping the application."
    )
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    arguments = parser.parse_args()
    result = install_database(arguments.source, arguments.target)
    print(f"Backup directory: {result.backup_directory}")
    print(f"Installed workspace revision: {result.revision}")
    print(
        f"Projects: {result.projects}; imported: {result.imported_projects}; imported completed actions: {result.imported_completed}"
    )


if __name__ == "__main__":
    main()
