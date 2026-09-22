import asyncio

import pytest


@pytest.fixture
def snapshot():
    return {
        "v": 1,
        "savedAt": "2026-09-15T00:00:00Z",
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
        "CUSTOM_SEQ": 0,
    }


async def test_workspace_roundtrip_and_version_conflict(client, snapshot):
    response = await client.get("/api/workspace")
    assert response.json() == {"revision": 0, "snapshot": None}
    assert response.headers["cache-control"] == "no-store"
    response = await client.put(
        "/api/workspace", json={"revision": 0, "snapshot": snapshot}
    )
    assert response.status_code == 200
    assert response.json() == {"revision": 1, "snapshot": snapshot}
    changed = {**snapshot, "CUSTOM_SEQ": 2}
    response = await client.put(
        "/api/workspace", json={"revision": 0, "snapshot": changed}
    )
    assert response.status_code == 409
    assert (await client.get("/api/workspace")).json()["snapshot"] == snapshot


async def test_simultaneous_first_writes_do_not_overwrite(client, snapshot):
    responses = await asyncio.gather(
        *[
            client.put("/api/workspace", json={"revision": 0, "snapshot": snapshot})
            for _ in range(2)
        ]
    )
    assert sorted(r.status_code for r in responses) == [200, 200]
    assert (await client.get("/api/workspace")).json()["revision"] == 1


async def test_invalid_workspace_does_not_replace_existing(client, snapshot):
    await client.put("/api/workspace", json={"revision": 0, "snapshot": snapshot})
    invalid = {
        **snapshot,
        "projects": [{"id": "P", "created": "bad", "team": {}, "actions": []}],
    }
    response = await client.put(
        "/api/workspace", json={"revision": 1, "snapshot": invalid}
    )
    assert response.status_code == 422
    assert (await client.get("/api/workspace")).json()["snapshot"] == snapshot


async def test_workspace_preserves_template_extensions_and_project_fields(
    client, snapshot
):
    snapshot["MATRIX"] = [
        {
            "ph": 0,
            "tab": "Custom",
            "act": "Check quality",
            "input": "Confirmation",
            "fn": "Quality",
            "lead": None,
            "dep": None,
        }
    ]
    snapshot["projects"] = [
        {
            "id": "TR-TEST",
            "created": "2026-09-12",
            "team": {"Quality": "Test"},
            "actions": [],
            "tooOwner": "ZF",
            "saving": "42000",
            "oem": "Test OEM",
        }
    ]
    response = await client.put(
        "/api/workspace", json={"revision": 0, "snapshot": snapshot}
    )
    assert response.status_code == 200
    assert (await client.get("/api/workspace")).json()["snapshot"] == snapshot


async def test_retry_after_lost_response_is_idempotent(client, snapshot):
    await client.put("/api/workspace", json={"revision": 0, "snapshot": snapshot})
    retry = {**snapshot, "savedAt": "2026-09-15T00:00:02Z"}
    response = await client.put(
        "/api/workspace", json={"revision": 0, "snapshot": retry}
    )
    assert response.status_code == 200
    assert response.json()["revision"] == 1


async def test_invalid_reminder_interval_is_rejected(client, snapshot):
    snapshot["RULES"]["overdueEvery"] = 0
    response = await client.put(
        "/api/workspace", json={"revision": 0, "snapshot": snapshot}
    )
    assert response.status_code == 422


async def test_concurrent_different_changes_do_not_overwrite(client, snapshot):
    responses = await asyncio.gather(
        client.put("/api/workspace", json={"revision": 0, "snapshot": snapshot}),
        client.put(
            "/api/workspace",
            json={"revision": 0, "snapshot": {**snapshot, "CUSTOM_SEQ": 1}},
        ),
    )
    assert sorted(response.status_code for response in responses) == [200, 409]


async def test_identity_calculation_is_stable_and_does_not_write(client):
    from app.services.workspace_identity import tool_identity

    parts = ["Part-1", "Tool-2", "4", "PPAP-3", "模具"]
    response = await client.post("/api/workspace/identity", json=parts)
    assert response.json() == {"id": tool_identity(parts)}
    assert (await client.get("/api/workspace")).json()["revision"] == 0


async def test_validation_is_read_only_and_rejects_prototype_keys(client, snapshot):
    response = await client.post("/api/workspace/validate", json=snapshot)
    assert response.status_code == 200
    assert (await client.get("/api/workspace")).json()["revision"] == 0
    snapshot["PEOPLE"]["__proto__"] = ["pollution"]
    assert (
        await client.post("/api/workspace/validate", json=snapshot)
    ).status_code == 422


async def test_invalid_template_dependency_does_not_replace_workspace(client, snapshot):
    snapshot["MATRIX"] = [
        {
            "ph": 1,
            "tab": "CR",
            "act": "Check CR",
            "input": "CR number",
            "lead": None,
            "fn": "SDE",
            "dep": 0,
        }
    ]
    assert (
        await client.post("/api/workspace/validate", json=snapshot)
    ).status_code == 422
    assert (await client.get("/api/workspace")).json()["revision"] == 0


@pytest.fixture
def snapshot_with_date_history(snapshot):
    snapshot["projects"] = [
        {
            "id": "P",
            "created": "2026-01-01",
            "team": {},
            "actions": [
                {
                    "id": "A",
                    "ph": 1,
                    "tab": "FOT Date",
                    "act": "Set FOT date",
                    "input": "Date",
                    "fn": "SDE",
                    "owner": "Alice",
                    "due": "",
                    "lead": None,
                    "leadDefault": None,
                    "dep": None,
                    "done": None,
                    "value": "2026-11-01",
                    "orig": "2026-04-01",
                    "dateLog": [
                        {
                            "ts": "2026-09-22T01:02:03.456Z",
                            "by": "Alice",
                            "from": "2026-04-01",
                            "to": "2026-11-01",
                            "source": "edit",
                        }
                    ],
                }
            ],
        }
    ]
    return snapshot


async def test_workspace_keeps_history_and_accepts_older_snapshots(
    client, snapshot_with_date_history
):
    snapshot = snapshot_with_date_history
    response = await client.put(
        "/api/workspace", json={"revision": 0, "snapshot": snapshot}
    )
    assert response.status_code == 200, response.text
    assert (await client.get("/api/workspace")).json()["snapshot"] == snapshot
    del snapshot["projects"][0]["actions"][0]["dateLog"]
    assert (
        await client.post("/api/workspace/validate", json=snapshot)
    ).status_code == 200


@pytest.mark.parametrize(
    "invalid",
    [
        None,
        {},
        [None],
        [{}],
        [
            {
                "ts": "invalid",
                "by": "Alice",
                "from": "",
                "to": "2026-04-01",
                "source": "edit",
            }
        ],
        [
            {
                "ts": "2026-09-22",
                "by": "Alice",
                "from": "",
                "to": "2026-04-01",
                "source": "edit",
            }
        ],
        [
            {
                "ts": "2026-09-22T01:02:03+08:00",
                "by": "Alice",
                "from": "",
                "to": "2026-04-01",
                "source": "edit",
            }
        ],
        [
            {
                "ts": "2026-09-22T01:02:03Z",
                "by": " ",
                "from": "",
                "to": "2026-04-01",
                "source": "edit",
            }
        ],
        [
            {
                "ts": "2026-09-22T01:02:03Z",
                "by": "Alice",
                "from": "",
                "to": "2026-02-30",
                "source": "edit",
            }
        ],
        [
            {
                "ts": "2026-09-22T01:02:03Z",
                "by": "Alice",
                "from": "",
                "to": "20260401",
                "source": "edit",
            }
        ],
        [
            {
                "ts": "2026-09-22T01:02:03Z",
                "by": "Alice",
                "from": "",
                "to": "",
                "source": "edit",
            }
        ],
        [
            {
                "ts": "2026-09-22T01:02:03Z",
                "by": "Alice",
                "from": "",
                "to": "2026-04-01",
                "source": "unknown",
            }
        ],
    ],
)
async def test_invalid_date_history_never_overwrites_workspace(
    client, snapshot_with_date_history, invalid
):
    snapshot = snapshot_with_date_history
    await client.put("/api/workspace", json={"revision": 0, "snapshot": snapshot})
    previous = (await client.get("/api/workspace")).json()
    snapshot["projects"][0]["actions"][0]["dateLog"] = invalid
    response = await client.put(
        "/api/workspace", json={"revision": 1, "snapshot": snapshot}
    )
    assert response.status_code == 422
    assert (await client.get("/api/workspace")).json() == previous


@pytest.mark.parametrize("defect", ["gap", "chronology", "current"])
async def test_workspace_rejects_inconsistent_history_chain(
    client, snapshot_with_date_history, defect
):
    snapshot = snapshot_with_date_history
    action = snapshot["projects"][0]["actions"][0]
    history = action["dateLog"]
    history.insert(
        0,
        {
            "ts": "2026-09-21T01:00:00Z",
            "by": "Alice",
            "from": "",
            "to": "2026-04-01",
            "source": "edit",
        },
    )
    if defect == "gap":
        history[1]["from"] = "2026-05-01"
    elif defect == "chronology":
        history[1]["ts"] = "2026-09-20T01:00:00Z"
    else:
        action["value"] = "2026-12-01"
    response = await client.put(
        "/api/workspace", json={"revision": 0, "snapshot": snapshot}
    )
    assert response.status_code == 422, response.text
    assert (await client.get("/api/workspace")).json()["revision"] == 0
