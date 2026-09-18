from datetime import date
from io import BytesIO

import pytest
from openpyxl import Workbook, load_workbook
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import Project


def workbook(rows, title="Projects", teams=None, actions=None):
    book = Workbook()
    sheet = book.active
    sheet.title = title
    for row in rows:
        sheet.append(row)
    if teams:
        sheet = book.create_sheet("Teams")
        for row in teams:
            sheet.append(row)
    if actions:
        sheet = book.create_sheet("Actions")
        for row in actions:
            sheet.append(row)
    output = BytesIO()
    book.save(output)
    book.close()
    return output.getvalue()


def upload(content):
    return {
        "file": (
            "test.xlsx",
            content,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    }


async def test_preview_is_read_only_then_import_persists(client):
    content = workbook(
        [["id", "pn", "desc"], ["XL-1", "00123", "Housing"]],
        teams=[["project_id", "function", "name"], ["XL-1", "SDE", "Alice"]],
    )
    response = await client.post("/api/excel/preview", files=upload(content))
    assert response.status_code == 200, response.text
    assert response.json()["valid"]
    assert response.json()["created_projects"] == 1
    assert (await client.get("/api/projects")).json() == []
    response = await client.post("/api/excel/import", files=upload(content))
    assert response.status_code == 200, response.text
    project = (await client.get("/api/projects/XL-1")).json()
    assert project["pn"] == "00123"
    assert len(project["actions"]) == 31
    assert project["actions"][0]["owner"] == "Alice"


async def test_import_aliases_header_offset_and_excel_date(client):
    content = workbook(
        [
            ["Tooling master list"],
            ["项目编号", "零件号", "零件描述", "工厂", "立项日期"],
            ["CN-1", "P1", "Housing", "Changchun", date(2026, 1, 2)],
        ],
        title="Master Changes",
    )
    response = await client.post("/api/excel/import", files=upload(content))
    assert response.status_code == 200, response.text
    project = (await client.get("/api/projects/CN-1")).json()
    assert project["created_at"] == "2026-01-02"
    assert project["plant"] == "Changchun"


async def test_invalid_row_rolls_back_entire_workbook(client):
    content = workbook(
        [["id", "pn", "desc"], ["XL-1", "P1", "Good"], ["XL-2", None, "Missing part"]]
    )
    preview = (await client.post("/api/excel/preview", files=upload(content))).json()
    assert not preview["valid"]
    assert preview["errors"][0]["row"] == 3
    assert (
        await client.post("/api/excel/import", files=upload(content))
    ).status_code == 422
    assert (await client.get("/api/projects")).json() == []


async def test_create_conflict_and_explicit_upsert(client):
    await client.post(
        "/api/projects",
        json={"id": "XL-1", "pn": "old", "desc": "Original", "plant": "Keep"},
    )
    content = workbook([["id", "pn", "desc"], ["XL-1", "new", "Updated"]])
    assert not (await client.post("/api/excel/preview", files=upload(content))).json()[
        "valid"
    ]
    assert (
        await client.post("/api/excel/import", files=upload(content))
    ).status_code == 422
    assert (
        await client.post("/api/excel/import?mode=upsert", files=upload(content))
    ).status_code == 200
    project = (await client.get("/api/projects/XL-1")).json()
    assert project["pn"] == "new"
    assert project["plant"] == "Keep"


async def test_export_reimport_roundtrip_preserves_values_and_links(client, db_engine):
    await client.post(
        "/api/projects",
        json={
            "id": "RT-1",
            "pn": "00012",
            "desc": "Roundtrip",
            "created_at": "2026-01-01",
            "team": {"SDE": "Alice"},
        },
    )
    await client.patch(
        "/api/projects/RT-1/actions/RT-1-0",
        json={
            "value": "=not_a_formula",
            "comment": "note",
            "link": "https://example.com/file",
            "done_date": "2026-01-02",
        },
    )
    await client.post(
        "/api/projects/RT-1/actions",
        json={
            "ph": 0,
            "tab": "Review",
            "act": "Review",
            "input_type": "Date",
            "fn": "SDE",
            "lead": None,
            "due_date": "2026-01-10",
        },
    )
    before = (await client.get("/api/projects/RT-1")).json()
    response = await client.get("/api/excel/export?project_id=RT-1")
    assert response.status_code == 200
    content = response.content
    book = load_workbook(BytesIO(content))
    assert book.sheetnames == ["Projects", "Teams", "Actions", "Summary"]
    text_cells = [
        cell
        for row in book["Actions"]
        for cell in row
        if cell.value == "=not_a_formula"
    ]
    assert len(text_cells) == 1 and text_cells[0].data_type == "s"
    book.close()
    async with async_sessionmaker(db_engine)() as session:
        await session.execute(delete(Project))
        await session.commit()
    response = await client.post("/api/excel/import", files=upload(content))
    assert response.status_code == 200, response.text
    after = (await client.get("/api/projects/RT-1")).json()
    for key in ("id", "pn", "desc", "created_at", "actions", "summary"):
        assert after[key] == before[key], key
    assert [(t["function"], t["name"]) for t in after["team_members"]] == [
        (t["function"], t["name"]) for t in before["team_members"]
    ]


@pytest.mark.parametrize("kind", ["duplicate", "cycle", "cross_project"])
async def test_invalid_graph_or_ids_reject_workbook(client, kind):
    rows = [["id", "pn", "desc"], ["XL-1", "P1", "Test"]]
    action_rows = [
        [
            "id",
            "project_id",
            "ph",
            "tab",
            "act",
            "input_type",
            "fn",
            "dep_id",
            "is_custom",
            "lead",
        ],
        ["custom-a", "XL-1", 1, "A", "A", "Date", "SDE", "custom-b", True, 1],
        ["custom-b", "XL-1", 1, "B", "B", "Date", "SDE", "custom-a", True, 1],
    ]
    if kind == "duplicate":
        rows.append(["XL-1", "P2", "Duplicate"])
        action_rows = None
    if kind == "cross_project":
        assert action_rows is not None
        action_rows[1][7] = "other-project-action"
    content = workbook(rows, actions=action_rows)
    assert (
        await client.post("/api/excel/import", files=upload(content))
    ).status_code == 422
    assert (await client.get("/api/projects")).json() == []


async def test_bad_file_and_formula_report_errors(client):
    assert (
        await client.post("/api/excel/preview", files=upload(b"not excel"))
    ).status_code == 422
    content = workbook([["id", "pn", "desc"], ["XL-1", "P1", '=HYPERLINK("bad")']])
    report = (await client.post("/api/excel/preview", files=upload(content))).json()
    assert not report["valid"]
    assert "Formula" in report["errors"][0]["message"]


async def test_template_and_actions_filter(client):
    template = await client.get("/api/excel/template")
    report = (
        await client.post("/api/excel/preview", files=upload(template.content))
    ).json()
    assert report["valid"] and report["created_projects"] == 0
    await client.post(
        "/api/projects",
        json={
            "id": "LIST-1",
            "pn": "P",
            "desc": "Action list",
            "team": {"SDE": "Alice"},
        },
    )
    response = await client.get("/api/actions?owner=Alice")
    assert response.status_code == 200
    assert all(
        a["owner"] == "Alice" and a["project_description"] == "Action list"
        for a in response.json()
    )


async def test_corrupt_worksheet_returns_validation_error(client):
    from zipfile import ZipFile

    content = workbook([["id", "pn", "desc"], ["XL-1", "P1", "Test"]])
    output = BytesIO()
    with ZipFile(BytesIO(content)) as source, ZipFile(output, "w") as destination:
        for item in source.infolist():
            destination.writestr(
                item,
                b"<invalid"
                if item.filename == "xl/worksheets/sheet1.xml"
                else source.read(item.filename),
            )
    response = await client.post("/api/excel/preview", files=upload(output.getvalue()))
    assert response.status_code == 422
    assert (await client.get("/api/projects")).json() == []
