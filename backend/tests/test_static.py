import pytest
from httpx import ASGITransport, AsyncClient

from app.static import SPAStaticFiles


@pytest.mark.parametrize(
    "path", ["/projects/TR-001", "/actions", "/management", "/data"]
)
async def test_spa_deep_links_serve_index(tmp_path, path):
    (tmp_path / "index.html").write_text("<html>Tooling app</html>")
    app = SPAStaticFiles(directory=tmp_path, html=True)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get(path)
    assert response.status_code == 200 and "Tooling app" in response.text


@pytest.mark.parametrize(
    "path", ["/api", "/api/missing", "/assets/missing.js", "/assets/missing"]
)
async def test_spa_does_not_hide_missing_api_or_assets(tmp_path, path):
    from fastapi import FastAPI

    (tmp_path / "index.html").write_text("Tooling app")
    app = FastAPI()
    app.mount("/", SPAStaticFiles(directory=tmp_path, html=True))
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get(path)
    assert response.status_code == 404
