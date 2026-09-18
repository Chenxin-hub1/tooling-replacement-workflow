import asyncio
from datetime import timedelta

import pytest

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
    assert len(loaded["summary"]["phases"]) == 6


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
        "/api/projects/TR-test/actions/TR-test-0", json={"done_date": "2026-09-02"}
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
    assert len(summary["phase_distribution"]) == 6


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
