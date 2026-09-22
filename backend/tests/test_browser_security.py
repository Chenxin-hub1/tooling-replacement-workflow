"""未启用账号时，外部网站不能借浏览器读取或改写本机工作区。"""


async def test_untrusted_origin_is_rejected(client):
    response = await client.get(
        "/api/workspace", headers={"Origin": "https://evil.example"}
    )
    assert response.status_code == 403
    assert "access-control-allow-origin" not in response.headers
    response = await client.post(
        "/api/workspace/identity",
        json=["part"],
        headers={"Origin": "https://evil.example"},
    )
    assert response.status_code == 403


async def test_same_origin_and_non_browser_clients_work(client):
    for headers in ({}, {"Origin": "http://test"}):
        response = await client.post(
            "/api/workspace/identity", json=["part"], headers=headers
        )
        assert response.status_code == 200


async def test_oversized_body_rejected_before_json_parsing(client):
    response = await client.put(
        "/api/workspace",
        content=b" ",
        headers={"Content-Length": str(13 * 1024 * 1024)},
    )
    assert response.status_code == 413


async def test_chunked_body_is_bounded(client):
    async def body():
        for _ in range(13):
            yield b" " * (1024 * 1024)

    response = await client.put("/api/workspace", content=body())
    assert response.status_code == 413


async def test_explicit_cross_origin_allowlist(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "CORS_ORIGINS", ["https://approved.example"])
    response = await client.post(
        "/api/workspace/identity",
        json=["part"],
        headers={"Origin": "https://approved.example"},
    )
    assert response.status_code == 200
