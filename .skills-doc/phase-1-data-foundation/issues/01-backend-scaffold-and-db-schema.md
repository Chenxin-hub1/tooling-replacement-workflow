# 01: 后端工程骨架、数据库模型与持久化层 (Backend Scaffold & DB Schema)

**What to build:**
搭建 FastAPI 后端工程骨架，配置 SQLite 异步持久化连接，定义 `Project`、`TeamMember`、`ProjectAction` 数据表模型与 Pydantic schemas，并实现启动时自动建表与健康检查。

**Blocked by:** None (can start immediately)

**Status:** closed
**Type:** task

- [x] 后端基础目录结构就绪（`backend/app/...`），环境配置与依赖声明（`pyproject.toml` 或 `requirements.txt`）完备。
- [x] SQLAlchemy 2.0 异步数据库引擎与连接会话配置完成，支持 SQLite。
- [x] 领域模型定义完成：`Project` 主表（含模具/零件主数据属性）、`TeamMember` 团队表、`ProjectAction` 阶段动作表。
- [x] 对应 Pydantic schemas 定义完成，支持严格的数据校验与序列化。
- [x] 应用启动时能够自动检查并创建数据库表结构，具备健康检查接口 `GET /health`。

2026-09-15 用户确认继续完成整个项目，Phase-1 已验收。
