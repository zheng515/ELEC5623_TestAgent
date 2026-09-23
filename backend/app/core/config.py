from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="REQTEST_", env_file=".env", extra="ignore")

    database_path: Path = Path("data/reqtest.db")
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    session_cookie_secure: bool = False
    session_ttl_seconds: int = Field(default=604800, ge=60, le=2592000)

    # Agent configuration. Without credentials the app falls back to the scaffold
    # orchestrator, so the API stays usable and the test suite never calls the network.
    llm_enabled: bool = True
    # Read without the REQTEST_ prefix so the SDK's own variable name works, in the
    # environment or in backend/.env. Left unset, the SDK resolves its own credentials.
    anthropic_api_key: SecretStr | None = Field(default=None, validation_alias="ANTHROPIC_API_KEY")
    llm_model: str = "claude-opus-5"
    llm_max_tokens: int = 16000
    llm_timeout_seconds: float = 180.0
    max_requirements: int = 40

    # Repository inspection (FR4). Reading a user-supplied path is a trust-boundary
    # change, so it stays off until a root is configured, and every path must resolve
    # inside that root.
    repository_root: Path | None = None
    max_inspected_files: int = 60
    max_inspected_bytes: int = 400_000

    # Sandbox for executing generated tests. Disabled unless Docker is running and
    # the image exists; there is no host-execution fallback by design (NFR5).
    sandbox_enabled: bool = True
    sandbox_image: str = "reqtest-sandbox:1"
    docker_binary: str = "docker"
    sandbox_timeout_seconds: float = 120.0
    sandbox_memory: str = "512m"
    sandbox_cpus: str = "1"
    sandbox_pids_limit: int = 128

    @field_validator("repository_root", "anthropic_api_key", mode="before")
    @classmethod
    def _blank_means_unset(cls, value):
        """An empty value in .env means "not configured", not "the current directory".

        Copying .env.example leaves these blank, and Path("") resolves to the process
        working directory, which would silently switch repository inspection on.
        """
        return None if isinstance(value, str) and not value.strip() else value
