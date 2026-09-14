from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="REQTEST_", env_file=".env", extra="ignore")

    database_path: Path = Path("data/reqtest.db")
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
