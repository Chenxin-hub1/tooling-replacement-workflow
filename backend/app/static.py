from pathlib import Path

from starlette.exceptions import HTTPException
from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope


class SPAStaticFiles(StaticFiles):
    """页面深链接回退到应用入口，缺失资源或 API 仍返回 404。"""

    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if (
                exc.status_code == 404
                and not Path(path).suffix
                and path.split("/", 1)[0] not in ("api", "health", "assets")
            ):
                return await super().get_response("index.html", scope)
            raise
