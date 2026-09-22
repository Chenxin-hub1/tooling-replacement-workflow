"""浏览器来源与请求大小边界；不将无账号的选人模式当成身份认证。"""

from starlette.datastructures import URL, Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import settings

MAX_REQUEST_BYTES = 12 * 1024 * 1024


class RequestBoundary:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope["path"].startswith(
            settings.API_V1_STR + "/"
        ):
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        origin = headers.get("origin")
        url = URL(scope=scope)
        allowed = {f"{url.scheme}://{url.netloc}", *settings.CORS_ORIGINS}
        # 通配符不授予外部网站工作区访问权限。
        allowed.discard("*")
        if origin and origin not in allowed:
            await JSONResponse({"detail": "Origin is not allowed"}, 403)(
                scope, receive, send
            )
            return
        try:
            declared = int(headers.get("content-length", "0"))
        except ValueError:
            declared = -1
        if declared < 0:
            await JSONResponse({"detail": "Invalid Content-Length"}, 400)(
                scope, receive, send
            )
            return
        if declared > MAX_REQUEST_BYTES:
            await JSONResponse({"detail": "Request exceeds 12 MB"}, 413)(
                scope, receive, send
            )
            return
        # 同时限制分块传输；在 JSON / multipart 解析与数据库依赖运行前拒绝超限。
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > MAX_REQUEST_BYTES:
                await JSONResponse({"detail": "Request exceeds 12 MB"}, 413)(
                    scope, receive, send
                )
                return
            if not message.get("more_body", False):
                break
        delivered = False

        async def replay() -> Message:
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)
