import asyncio
from datetime import timedelta

import pytest
from sqlalchemy import text

from app.dates import local_today
from app.engine.scheduler import STANDARD_MATRIX


async def create(client, **overrides):
    payload = {
        "id": "TR-test",
        "pn": "PN-001",
        "desc": "Housing",
        "plant": "Changchun",
        "bu": "Airbag",
        "created_at": "2026-09-01",
        "team": {"SDE": "Alice", "PM": "Bob"},
    }
    payload.update(overrides)
    response = await client.post("/api/projects", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


async def test_create_persists_project_team_actions_and_schedule(client):
    project = await create(client)
    loaded = (await client.get("/api/projects/TR-test")).json()
    assert loaded == project
    assert len(loaded["actions"]) == len(STANDARD_MATRIX)
    assert loaded["actions"][0]["due_date"] == "2026-09-08"
    assert loaded["actions"][0]["owner"] == "Alice"
    dependent = next(a for a in loaded["actions"] if a["id"] == "TR-test-10")
    assert dependent["predecessor"]["id"] == "TR-test-9"
    assert loaded["summary"]["phase_statuses"][0] == "completed"
    assert len(loaded["summary"]["phases"]) == 4
    cvs = [a for a in loaded["actions"] if a["tab"] == "CVS CR"]
    assert len(cvs) == 2
    assert all(a["ph"] == 1 for a in cvs)
    assert dependent["id"] == "TR-test-10"


async def test_completion_cascades_and_cancellation_reverts(client):
    await create(client)
    url = "/api/projects/TR-test/actions/"
    response = await client.patch(url + "TR-test-10", json={"lead": 10})
    assert response.json()["due_date"] == "2026-09-11"
    response = await client.patch(
        url + "TR-test-9", json={"value": "Applicable", "done_date": "2026-09-15"}
    )
    assert response.status_code == 200
    loaded = (await client.get("/api/projects/TR-test")).json()
    assert (
        next(a for a in loaded["actions"] if a["id"] == "TR-test-10")["due_date"]
        == "2026-09-25"
    )
    assert (
        await client.patch(url + "TR-test-9", json={"done_date": None})
    ).status_code == 200
    loaded = (await client.get("/api/projects/TR-test")).json()
    assert (
        next(a for a in loaded["actions"] if a["id"] == "TR-test-10")["due_date"]
        == "2026-09-11"
    )


async def test_team_patch_transfers_only_open_work_and_preserves_other_roles(client):
    await create(client)
    await client.patch(
        "/api/projects/TR-test/actions/TR-test-0",
        json={"value": "CR-DONE", "status": "approved", "done_date": "2026-09-02"},
    )
    response = await client.patch(
        "/api/projects/TR-test", json={"team": {"SDE": "Carol"}, "desc": "Updated"}
    )
    assert response.status_code == 200
    loaded = (await client.get("/api/projects/TR-test")).json()
    assert loaded["desc"] == "Updated"
    assert {m["function"]: m["name"] for m in loaded["team_members"]} == {
        "SDE": "Carol",
        "PM": "Bob",
    }
    sde = [a for a in loaded["actions"] if a["fn"] == "SDE"]
    assert next(a for a in sde if a["id"] == "TR-test-0")["owner"] == "Alice"
    assert all(a["owner"] == "Carol" for a in sde if a["done_date"] is None)


async def test_custom_actions_manual_dates_dependencies_and_deletion(client):
    await create(client)
    url = "/api/projects/TR-test/actions"
    root = await client.post(
        url,
        json={
            "ph": 0,
            "tab": "Review",
            "act": "Review tooling",
            "input_type": "Date",
            "fn": "SDE",
            "due_date": "2026-09-10",
        },
    )
    assert root.status_code == 201, root.text
    root_id = root.json()["id"]
    child = await client.post(
        url,
        json={
            "ph": 2,
            "tab": "Follow-up",
            "act": "Approve",
            "input_type": "Date",
            "fn": "PM",
            "dep_id": root_id,
            "lead": 3,
        },
    )
    assert child.status_code == 201, child.text
    child_id = child.json()["id"]
    assert child.json()["due_date"] == "2026-09-13"
    assert root.json()["owner"] == "Alice"
    assert (await client.delete(f"{url}/{root_id}")).status_code == 409
    assert (await client.delete(f"{url}/TR-test-0")).status_code == 409
    assert (
        await client.patch(f"{url}/{root_id}", json={"due_date": "2026-10-01"})
    ).status_code == 200
    loaded = (await client.get("/api/projects/TR-test")).json()
    assert (
        next(a for a in loaded["actions"] if a["id"] == child_id)["due_date"]
        == "2026-10-04"
    )
    assert (await client.delete(f"{url}/{child_id}")).status_code == 204
    assert (await client.delete(f"{url}/{root_id}")).status_code == 204
    assert len((await client.get("/api/projects/TR-test")).json()["actions"]) == len(
        STANDARD_MATRIX
    )


async def test_filtering_and_portfolio_kpis(client):
    old = (local_today() - timedelta(days=400)).isoformat()
    future = (local_today() + timedelta(days=400)).isoformat()
    project = await create(client, created_at=old)
    await create(
        client, id="TR-other", plant="Aschau", bu="Seatbelt", created_at=future
    )
    for query in ("plant=Changchun", "bu=Airbag", "status=red"):
        response = await client.get("/api/projects?" + query)
        assert response.status_code == 200
        assert [p["id"] for p in response.json()] == ["TR-test"]
    assert (await client.get("/api/projects?plant=Missing")).json() == []
    kpi = (await client.get("/api/kpi/summary")).json()
    assert kpi["total_projects"] == 2
    assert kpi["total_actions"] == len(STANDARD_MATRIX) * 2
    expected = sum(a["status"] == "red" for a in project["actions"])
    assert kpi["overdue_actions"] == expected
    assert sum(row["overdue_actions"] for row in kpi["overdue_by_owner"]) == expected
    assert sum(row["overdue_actions"] for row in kpi["overdue_by_function"]) == expected
    assert kpi["overdue_by_project"] == [
        {"project_id": "TR-test", "overdue_actions": expected}
    ]
    assert sum(row["projects"] for row in kpi["phase_distribution"]) == 2


@pytest.mark.parametrize(
    "patch",
    [
        {"pn": None},
        {"desc": None},
        {"pn": "  "},
        {"team": None},
        {"team": {"Unknown": "Person"}},
        {"unexpected": 1},
    ],
)
async def test_invalid_project_patch_is_rejected_without_change(client, patch):
    original = await create(client)
    response = await client.patch("/api/projects/TR-test", json=patch)
    assert response.status_code == 422
    assert (await client.get("/api/projects/TR-test")).json() == original


@pytest.mark.parametrize(
    "invalid",
    [
        {"ph": 99},
        {"ph": -1},
        {"ph": True},
        {"lead": -1},
        {"lead": True},
        {"fn": "Unknown"},
        {"act": ""},
        {"tab": "  "},
        {"is_custom": False},
    ],
)
async def test_invalid_custom_actions_rejected(client, invalid):
    await create(client)
    body = {
        "ph": 1,
        "tab": "Review",
        "act": "Review",
        "input_type": "Date",
        "fn": "SDE",
    }
    body.update(invalid)
    assert (
        await client.post("/api/projects/TR-test/actions", json=body)
    ).status_code == 422
    assert len((await client.get("/api/projects/TR-test")).json()["actions"]) == len(
        STANDARD_MATRIX
    )


async def test_cross_project_action_access_and_dependencies_rejected(client):
    await create(client)
    await create(client, id="TR-other")
    assert (
        await client.patch(
            "/api/projects/TR-test/actions/TR-other-0", json={"value": "bad"}
        )
    ).status_code == 404
    assert (
        await client.delete("/api/projects/TR-test/actions/TR-other-0")
    ).status_code == 404
    body = {
        "ph": 1,
        "tab": "Test",
        "act": "Test",
        "input_type": "Date",
        "fn": "SDE",
        "dep_id": "TR-other-0",
    }
    assert (
        await client.post("/api/projects/TR-test/actions", json=body)
    ).status_code == 404


async def test_duplicate_ids_and_generated_ids(client):
    await create(client)
    assert (
        await client.post(
            "/api/projects", json={"id": "TR-test", "pn": "other", "desc": "Duplicate"}
        )
    ).status_code == 409
    created = await asyncio.gather(
        *[
            client.post("/api/projects", json={"pn": "generated", "desc": "Generated"})
            for _ in range(3)
        ]
    )
    assert [r.status_code for r in created] == [201, 201, 201]
    assert {r.json()["id"] for r in created} == {
        f"TR-{local_today().year}-{n:03d}" for n in (1, 2, 3)
    }


async def test_manual_due_date_requires_explicit_lead_clear(client):
    await create(client)
    url = "/api/projects/TR-test/actions/TR-test-0"
    assert (
        await client.patch(
            url, json={"due_date": "2026-10-01", "comment": "must rollback"}
        )
    ).status_code == 422
    response = await client.patch(url, json={"lead": None, "due_date": "2026-10-01"})
    assert response.status_code == 200
    assert response.json()["due_date"] == "2026-10-01"
    assert response.json()["comment"] == ""


async def test_missing_project_and_empty_kpi(client):
    assert (await client.get("/api/projects/missing")).status_code == 404
    summary = (await client.get("/api/kpi/summary")).json()
    assert summary["total_projects"] == summary["overdue_actions"] == 0
    assert len(summary["phase_distribution"]) == 4


async def test_schedule_overflow_rolls_back_change(client):
    await create(client)
    url = "/api/projects/TR-test/actions/TR-test-0"
    await client.patch(url, json={"lead": None, "due_date": "9999-12-31"})
    response = await client.post(
        "/api/projects/TR-test/actions",
        json={
            "ph": 1,
            "tab": "Overflow",
            "act": "Test",
            "input_type": "Date",
            "fn": "SDE",
            "dep_id": "TR-test-0",
            "lead": 1,
        },
    )
    assert response.status_code == 422
    assert len((await client.get("/api/projects/TR-test")).json()["actions"]) == len(
        STANDARD_MATRIX
    )


async def test_approval_status_does_not_collide_with_health(client):
    await create(client)
    response = await client.patch(
        "/api/projects/TR-test/actions/TR-test-0",
        json={"value": "CR-1", "status": "in_progress"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["approval_status"] == "in_progress"
    assert response.json()["status"] in ("green", "red", "yellow", "gray")
    loaded = await client.get("/api/projects/TR-test")
    assert loaded.status_code == 200
    assert loaded.json()["actions"][0]["approval_status"] == "in_progress"


async def test_approval_downgrade_reopens_and_dates_keep_baseline(client):
    await create(client)
    url = "/api/projects/TR-test/actions/TR-test-0"
    assert (
        await client.patch(url, json={"done_date": "2026-09-02"})
    ).status_code == 422
    response = await client.patch(url, json={"value": "CR-1", "status": "approved"})
    assert response.json()["done_date"]
    response = await client.patch(url, json={"status": "in_progress"})
    assert response.json()["done_date"] is None
    url = "/api/projects/TR-test/actions/TR-test-2"
    await client.patch(url, json={"value": "2026-11-01"})
    response = await client.patch(url, json={"value": "2026-11-03"})
    assert response.json()["orig"] == "2026-11-01"
    assert response.json()["value"] == "2026-11-03"


async def test_changed_completed_value_requires_explicit_reconfirmation(client):
    await create(client)
    url = "/api/projects/TR-test/actions/TR-test-1"
    response = await client.patch(url, json={"value": "PPAP-1"})
    assert response.json()["done_date"] is None
    response = await client.patch(url, json={"done_date": "2026-09-01"})
    assert response.json()["done_date"] == "2026-09-01"
    response = await client.patch(url, json={"value": "PPAP-2"})
    assert response.json()["done_date"] is None


async def test_changed_approved_reference_requires_explicit_reapproval(client):
    await create(client)
    url = "/api/projects/TR-test/actions/TR-test-0"
    await client.patch(url, json={"value": "CR-1", "status": "approved"})
    response = await client.patch(url, json={"value": "CR-2"})
    assert response.json()["done_date"] is None
    assert response.json()["approval_status"] == "in_progress"
    response = await client.patch(url, json={"value": "CR-3", "status": "approved"})
    assert response.json()["done_date"]
    assert response.json()["approval_status"] == "approved"


@pytest.mark.parametrize("index", [2, 3, 4, 13, 17, 19])
async def test_date_history_persists_every_change_and_keeps_original(client, index):
    await create(client)
    url = f"/api/projects/TR-test/actions/TR-test-{index}"
    for value in ("2026-04-01", "2026-11-01", "2026-11-01", "", "2026-12-01"):
        response = await client.patch(url, json={"value": value})
        assert response.status_code == 200, response.text
        assert response.json()["done_date"] is None
        assert response.json()["orig"] == "2026-04-01"
    loaded = (await client.get("/api/projects/TR-test")).json()
    action = next(a for a in loaded["actions"] if a["id"] == f"TR-test-{index}")
    assert [(entry["from"], entry["to"]) for entry in action["date_log"]] == [
        ("", "2026-04-01"),
        ("2026-04-01", "2026-11-01"),
        ("2026-11-01", ""),
        ("", "2026-12-01"),
    ]
    assert all(
        e["by"] == "API" and e["source"] == "edit" and e["ts"].endswith("Z")
        for e in action["date_log"]
    )
    for patch in (
        {"value": "2026-02-30", "comment": "must not save"},
        {"value": "20261101"},
        {"value": "2026-09-01", "done_date": "9999-01-01"},
        {"date_log": []},
    ):
        response = await client.patch(url, json=patch)
        assert response.status_code == 422
        assert (await client.get("/api/projects/TR-test")).json() == loaded


async def test_changed_approved_date_reopens_and_same_value_keeps_completion(client):
    await create(client)
    url = "/api/projects/TR-test/actions/TR-test-13"
    response = await client.patch(
        url,
        json={"value": "2026-04-01", "status": "approved", "done_date": "2026-09-01"},
    )
    assert response.status_code == 200, response.text
    response = await client.patch(url, json={"value": "2026-04-01"})
    assert response.json()["done_date"] == "2026-09-01"
    assert len(response.json()["date_log"]) == 1
    response = await client.patch(url, json={"value": "2026-11-01"})
    assert response.json()["done_date"] is None
    assert response.json()["approval_status"] == "in_progress"
    assert response.json()["orig"] == "2026-04-01"
    before = (await client.get("/api/projects/TR-test")).json()
    assert (
        await client.patch(url, json={"done_date": "2026-09-01"})
    ).status_code == 422
    assert (await client.get("/api/projects/TR-test")).json() == before


async def test_explicit_final_ppap_selection_confirms_approval(client):
    await create(client)
    url = "/api/projects/TR-test/actions/TR-test-11"
    response = await client.patch(url, json={"value": "Full approved"})
    assert response.json()["done_date"]
    await client.patch(url, json={"done_date": None})
    response = await client.patch(url, json={"comment": "Still awaiting confirmation"})
    assert response.json()["done_date"] is None
    response = await client.patch(url, json={"done_date": "2026-09-01"})
    assert response.json()["done_date"] == "2026-09-01"
    response = await client.patch(url, json={"value": "Draft"})
    assert response.json()["done_date"] is None


@pytest.mark.parametrize(
    "value",
    [
        "TBD",
        "tbc",
        "Pending",
        "Pending approval",
        "pend",
        "N/A",
        "na",
        "Not applicable",
        "unknown",
        "Not started",
        "--?",
        "",
        " ",
    ],
)
async def test_placeholder_or_empty_reference_cannot_be_approved(client, value):
    original = await create(client)
    response = await client.patch(
        "/api/projects/TR-test/actions/TR-test-0",
        json={"value": value, "status": "approved", "comment": "must rollback"},
    )
    assert response.status_code == 422, response.text
    assert (await client.get("/api/projects/TR-test")).json() == original


async def test_not_applicable_choice_can_complete_but_placeholder_id_cannot(client):
    original = await create(client)
    response = await client.patch(
        "/api/projects/TR-test/actions/TR-test-1",
        json={"value": "Not applicable", "done_date": "2026-09-01"},
    )
    assert response.status_code == 422
    assert (await client.get("/api/projects/TR-test")).json() == original
    response = await client.patch(
        "/api/projects/TR-test/actions/TR-test-9",
        json={"value": "Not applicable", "done_date": "2026-09-01"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["done_date"] == "2026-09-01"


async def test_unchanged_legacy_placeholder_is_preserved_until_reconfirmation(
    client, db_engine
):
    await create(client)
    async with db_engine.begin() as connection:
        await connection.execute(
            text(
                "UPDATE project_actions SET value='TBD',status='approved',done_date='2026-09-01' WHERE id='TR-test-0'"
            )
        )
    url = "/api/projects/TR-test/actions/TR-test-0"
    for patch in ({"comment": "Keep legacy record"}, {"value": "TBD"}):
        response = await client.patch(url, json=patch)
        assert response.status_code == 200, response.text
        assert response.json()["done_date"] == "2026-09-01"
    before = (await client.get("/api/projects/TR-test")).json()
    assert (await client.patch(url, json={"status": "approved"})).status_code == 422
    assert (await client.get("/api/projects/TR-test")).json() == before
