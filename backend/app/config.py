from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Tooling Replacement Workflow"
    API_V1_STR: str = "/api"
    DATABASE_URL: str = "sqlite+aiosqlite:///./tooling.db"
    # 空值时快照目录跟随数据库文件（<数据库目录>/backups/workspace）。
    SNAPSHOT_DIR: str = ""
    CORS_ORIGINS: list[str] = ["*"]
    DEBUG: bool = False

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )


settings = Settings()
