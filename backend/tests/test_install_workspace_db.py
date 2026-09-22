import importlib.util
import json
import os
import sqlite3
import subprocess
import sys
from contextlib import closing
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

BACKEND = Path(__file__).resolve().parents[1]
SCRIPT = BACKEND.parent / "scripts" / "install-workspace-db.py"
SPEC = importlib.util.spec_from_file_location("install_workspace_db", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
installer = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = installer
SPEC.loader.exec_module(installer)


def make_database(path: Path, revision: int = 3, *, valid: bool = True) -> None:
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "migrations"))
    config.set_main_option("sqlalchemy.url", f"sqlite+aiosqlite:///{path}")
    config.attributes["connection_url_override"] = True
    command.upgrade(config, "0002")
    snapshot = {
        "v": 1,
        "savedAt": "2026-09-22T00:00:00Z",
        "projects": [
            {
                "id": "imported-project",
                "created": "2026-01-01",
                "team": {},
                "actions": [
                    {
                        "id": "imported-action",
                        "ph": 1,
                        "tab": "CR",
                        "act": "Input CR number on Windchill",
                        "input": "CR number",
                        "fn": "SDE",
                        "owner": "SDE",
                        "due": "2026-01-02",
                        "done": "2026-01-02",
                        "value": "CR-1",
                        "status": "approved",
                        "lead": 1,
                        "leadDefault": 1,
                        "dep": None,
                    }
                ],
                "importSource": {
                    "filename": "master.xlsx",
                    "headers": [],
                    "values": [],
                },
            }
        ],
        "PEOPLE": {},
        "EMAILS": {},
        "ADMINS": [],
        "FUNCTIONS": [],
        "TEAM_ROWS": [],
        "REQUIRED_TEAM": [],
        "MATRIX": [],
        "RULES": {
            "before": 5,
            "overdueEvery": 2,
            "escalateAfter": 5,
            "channel": "both",
        },
        "CUSTOM_SEQ": 0,
    }
    if not valid:
        snapshot["projects"][0]["created"] = "invalid"
    with closing(sqlite3.connect(path)) as database:
        database.execute(
            "INSERT INTO workspaces (id,revision,document) VALUES (1,?,?)",
            (revision, json.dumps(snapshot)),
        )
        database.commit()


def workspace(path: Path) -> tuple[int, dict]:
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as database:
        revision, document = database.execute(
            "SELECT revision,document FROM workspaces WHERE id=1"
        ).fetchone()
        return revision, json.loads(document)


def test_installs_legacy_release_and_advances_revision_without_changing_source(
    tmp_path,
):
    source = tmp_path / "release.db"
    target = tmp_path / "tooling.db"
    make_database(source)
    make_database(target, 100)
    source_before = source.read_bytes()
    old_document = workspace(target)

    result = installer.install_database(source, target)

    assert result.revision == 101
    assert (result.projects, result.imported_projects, result.imported_completed) == (
        1,
        1,
        1,
    )
    assert workspace(target)[0] == 101
    assert workspace(result.backup_directory / "snapshot.db") == old_document
    assert workspace(result.backup_directory / "tooling.db") == old_document
    assert source.read_bytes() == source_before
    with closing(sqlite3.connect(target)) as database:
        assert database.execute(
            "SELECT version_num FROM alembic_version"
        ).fetchone() == ("0005",)
        assert "date_log" in {
            row[1] for row in database.execute("PRAGMA table_info(project_actions)")
        }
        assert database.execute("PRAGMA journal_mode").fetchone() == ("delete",)
    assert not Path(f"{target}-wal").exists()
    assert not Path(f"{target}-shm").exists()
    assert not list(tmp_path.glob(".tooling-release-*"))


def test_backup_includes_committed_wal_and_installed_revision_exceeds_it(tmp_path):
    source = tmp_path / "release.db"
    target = tmp_path / "tooling.db"
    make_database(source)
    make_database(target, 2)
    # 模拟异常退出留下的已提交 WAL，确保不是只复制主文件。
    subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import sqlite3,sys,os,json; "
                "db=sqlite3.connect(sys.argv[1]); "
                "db.execute('PRAGMA journal_mode=WAL'); "
                "db.execute('PRAGMA wal_autocheckpoint=0'); "
                "row=db.execute('SELECT document FROM workspaces WHERE id=1').fetchone(); "
                "doc=json.loads(row[0]); doc['serverOnlyNote']='Keep this backup'; "
                "db.execute('UPDATE workspaces SET revision=200,document=? WHERE id=1',(json.dumps(doc),)); "
                "db.commit(); os._exit(0)"
            ),
            str(target),
        ],
        check=True,
    )
    assert Path(f"{target}-wal").stat().st_size > 0

    result = installer.install_database(source, target)

    previous_revision, previous_document = workspace(
        result.backup_directory / "snapshot.db"
    )
    assert previous_revision == 200
    assert previous_document["serverOnlyNote"] == "Keep this backup"
    assert workspace(target)[0] == 201
    assert "serverOnlyNote" not in workspace(target)[1]


def test_invalid_release_does_not_modify_target(tmp_path):
    source = tmp_path / "release.db"
    target = tmp_path / "tooling.db"
    make_database(source, valid=False)
    make_database(target, 77)
    original = target.read_bytes()

    with pytest.raises(ValueError, match="created"):
        installer.install_database(source, target)

    assert target.read_bytes() == original
    assert not (tmp_path / "backups").exists()
    assert not list(tmp_path.glob(".tooling-release-*"))


def test_repeated_installations_preserve_distinct_backups(tmp_path):
    source = tmp_path / "release.db"
    target = tmp_path / "tooling.db"
    make_database(source)
    make_database(target, 10)

    first = installer.install_database(source, target)
    second = installer.install_database(source, target)

    assert first.backup_directory != second.backup_directory
    assert workspace(first.backup_directory / "snapshot.db")[0] == 10
    assert workspace(second.backup_directory / "snapshot.db")[0] == 11
    assert workspace(target)[0] == 12


def test_replace_failure_restores_previous_database(tmp_path, monkeypatch):
    source = tmp_path / "release.db"
    target = tmp_path / "tooling.db"
    make_database(source)
    make_database(target, 88)
    previous = workspace(target)
    original_replace = installer.os.replace

    def reject_installation(source_path, target_path):
        if Path(source_path).name.startswith(".tooling-release-"):
            raise OSError("Simulated replacement failure")
        return original_replace(source_path, target_path)

    monkeypatch.setattr(installer.os, "replace", reject_installation)
    with pytest.raises(OSError, match="Simulated"):
        installer.install_database(source, target)

    assert workspace(target) == previous
    backups = list((tmp_path / "backups").glob("deploy-*/snapshot.db"))
    assert len(backups) == 1
    assert workspace(backups[0]) == previous
    assert not list(tmp_path.glob(".tooling-release-*"))


def test_fresh_volume_and_same_file_guard(tmp_path):
    source = tmp_path / "release.db"
    target = tmp_path / "volume" / "tooling.db"
    make_database(source)
    result = installer.install_database(source, target)
    assert workspace(target)[0] == 4
    assert result.backup_directory.is_dir()
    with pytest.raises(ValueError, match="different"):
        installer.install_database(source, source)


def test_migration_failure_leaves_target_unchanged(tmp_path):
    source = tmp_path / "release.db"
    target = tmp_path / "tooling.db"
    make_database(source)
    make_database(target, 77)
    with closing(sqlite3.connect(source)) as database:
        database.execute("UPDATE alembic_version SET version_num='unknown-release'")
        database.commit()
    original = target.read_bytes()

    with pytest.raises(Exception, match="unknown-release"):
        installer.install_database(source, target)

    assert target.read_bytes() == original
    assert not (tmp_path / "backups").exists()
    assert not list(tmp_path.glob(".tooling-release-*"))


def test_cli_runs_from_mounted_script_location(tmp_path):
    source = tmp_path / "release.db"
    target = tmp_path / "tooling.db"
    make_database(source)
    result = subprocess.run(
        [sys.executable, str(SCRIPT), str(source), str(target)],
        cwd=tmp_path,
        env={**os.environ, "PYTHONPATH": str(BACKEND)},
        capture_output=True,
        text=True,
        check=True,
    )
    assert "Installed workspace revision: 4" in result.stdout
    assert "Projects: 1; imported: 1; imported completed actions: 1" in result.stdout
    assert workspace(target)[0] == 4
