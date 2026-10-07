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
    # environment or in backend/.env. An unset key leaves agent stages disconnected.
    openai_api_key: SecretStr | None = Field(default=None, validation_alias="OPENAI_API_KEY")
    llm_model: str = "gpt-6-luna"
    llm_max_tokens: int = 16000
    llm_timeout_seconds: float = 180.0
    max_requirements: int = 40
    max_scenarios: int = Field(default=80, ge=1, le=200)
    max_active_runs: int = Field(default=20, ge=1, le=1000)

    document_ocr_enabled: bool = True
    document_ocr_languages: str = Field(
        default="eng", max_length=80, pattern=r"^[A-Za-z0-9_]+(?:\+[A-Za-z0-9_]+)*$"
    )
    document_tesseract_binary: str = "tesseract"
    document_converter_binary: str = "soffice"
    document_ocr_max_pages: int = Field(default=20, ge=1, le=100)
    document_import_timeout_seconds: int = Field(default=120, ge=30, le=600)

    # Repository inspection (FR4). Reading a user-supplied path is a trust-boundary
    # change, so it stays off until a root is configured, and every path must resolve
    # inside that root.
    repository_root: Path | None = None
    max_inspected_files: int = 60
    max_inspected_bytes: int = 400_000
    # Persist code separately from the mutable project directory. None uses the
    # database directory's repository-snapshots subdirectory.
    repository_snapshot_root: Path | None = None
    max_snapshot_files: int = Field(default=2000, ge=1, le=100000)
    max_snapshot_bytes: int = Field(default=20_000_000, ge=1, le=1_000_000_000)

    # GitHub repositories (FR4). A GitHub URL as the repository reference downloads that
    # repository at a pinned commit through the GitHub API, so it needs no repository
    # root: nothing on this server's filesystem is exposed. The optional token reads
    # private repositories and raises the API rate limit. It is shared server
    # configuration, so every account can read whatever the token can read.
    github_enabled: bool = True
    github_token: SecretStr | None = None
    github_timeout_seconds: float = Field(default=60.0, gt=0, le=600)
    github_max_archive_bytes: int = Field(default=50_000_000, ge=1, le=1_000_000_000)

    # Repository watching. Each watched GitHub project is polled for a new commit at this
    # interval (two API calls per check); a new commit queues an incremental run.
    watch_enabled: bool = True
    watch_interval_seconds: int = Field(default=600, ge=60, le=86400)

    # Sandbox for executing generated tests. Disabled unless Docker is running and
    # the image exists; there is no host-execution fallback by design (NFR5).
    sandbox_enabled: bool = True
    sandbox_image: str = "reqtest-sandbox:1"
    docker_binary: str = "docker"
    sandbox_timeout_seconds: float = 120.0
    sandbox_memory: str = "512m"
    sandbox_cpus: str = "1"
    sandbox_pids_limit: int = 128

    @field_validator(
        "repository_root",
        "repository_snapshot_root",
        "openai_api_key",
        "github_token",
        mode="before",
    )
    @classmethod
    def _blank_means_unset(cls, value):
        """An empty value in .env means "not configured", not "the current directory".

        Copying .env.example leaves these blank, and Path("") resolves to the process
        working directory, which would silently switch repository inspection on.
        """
        return None if isinstance(value, str) and not value.strip() else value
