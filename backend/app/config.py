from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Tooling Replacement Workflow"
    API_V1_STR: str = "/api"
    DATABASE_URL: str = "sqlite+aiosqlite:///./tooling.db"
    CORS_ORIGINS: list[str] = ["*"]
    DEBUG: bool = False

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )


settings = Settings()
