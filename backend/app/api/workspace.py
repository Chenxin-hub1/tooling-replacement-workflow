from typing import Annotated

from fastapi import APIRouter, Body, HTTPException, Response
from starlette.concurrency import run_in_threadpool

from app.api.routes import Database, WriteDatabase, save
from app.models.workspace import Workspace
from app.schemas.workspace import WorkspaceResponse, WorkspaceWrite
from app.services.workspace_identity import tool_identity
from app.services.workspace_snapshots import write_snapshot

router = APIRouter(prefix="/workspace", tags=["Workspace"])


@router.get("", response_model=WorkspaceResponse)
async def get_workspace(db: Database, response: Response):
    response.headers["Cache-Control"] = "no-store"
    workspace = await db.get(Workspace, 1)
    return {
        "revision": workspace.revision if workspace else 0,
        "snapshot": workspace.document if workspace else None,
    }


@router.put("", response_model=WorkspaceResponse)
async def put_workspace(data: WorkspaceWrite, db: WriteDatabase):
    # 整个样板工作区作为一个事务保存；过期页面不得覆盖其他人的更新。
    workspace = await db.get(Workspace, 1)
    revision = workspace.revision if workspace else 0
    document = data.snapshot.model_dump(mode="json")
    if workspace is not None and (
        {k: v for k, v in document.items() if k != "savedAt"}
        == {k: v for k, v in workspace.document.items() if k != "savedAt"}
    ):
        # 已提交但响应丢失的重试，不增加版本或误报冲突。
        return {"revision": workspace.revision, "snapshot": workspace.document}
    if data.revision != revision:
        raise HTTPException(
            409,
            "Workspace changed on another page. Save a workspace file before reloading.",
        )
    if workspace is None:
        workspace = Workspace(id=1, revision=1, document=document)
        db.add(workspace)
    else:
        workspace.revision += 1
        workspace.document = document
    await save(db)
    # 每次真实变更后留一份服务端快照；尽力而为，失败不影响保存结果。
    await run_in_threadpool(write_snapshot, document, workspace.revision)
    return {"revision": workspace.revision, "snapshot": workspace.document}


@router.post("/identity")
def import_identity(parts: Annotated[list[str], Body(max_length=8)]):
    if any(len(part) > 2048 for part in parts):
        raise HTTPException(422, "Tool identity field is too long")
    return {"id": tool_identity(parts)}
