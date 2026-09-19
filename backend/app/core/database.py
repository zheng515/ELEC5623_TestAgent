import sqlite3
from contextlib import contextmanager
from pathlib import Path

from app.schemas import Project, VerificationRun


class Store:
    """Small local store; each request uses its own SQLite connection."""

    def __init__(self, path: Path):
        self.path = path

    @contextmanager
    def connection(self):
        connection = sqlite3.connect(self.path, timeout=10)
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def initialize(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS runs (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(id),
                    created_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id, created_at);
            """)

    def create_project(self, project: Project):
        with self.connection() as connection:
            connection.execute(
                "INSERT INTO projects VALUES (?, ?, ?)",
                (project.id, project.created_at.isoformat(), project.model_dump_json()),
            )

    def list_projects(self) -> list[Project]:
        with self.connection() as connection:
            rows = connection.execute(
                "SELECT payload FROM projects ORDER BY created_at DESC, id DESC"
            ).fetchall()
        return [Project.model_validate_json(row[0]) for row in rows]

    def get_project(self, project_id: str) -> Project | None:
        with self.connection() as connection:
            row = connection.execute(
                "SELECT payload FROM projects WHERE id = ?", (project_id,)
            ).fetchone()
        return Project.model_validate_json(row[0]) if row else None

    def create_run(self, run: VerificationRun):
        with self.connection() as connection:
            connection.execute(
                "INSERT INTO runs VALUES (?, ?, ?, ?)",
                (run.id, run.project_id, run.created_at.isoformat(), run.model_dump_json()),
            )

    def list_runs(self, project_id: str) -> list[VerificationRun]:
        with self.connection() as connection:
            rows = connection.execute(
                "SELECT payload FROM runs WHERE project_id = ? ORDER BY created_at DESC, id DESC",
                (project_id,),
            ).fetchall()
        return [VerificationRun.model_validate_json(row[0]) for row in rows]

    def recent_runs(self, limit: int = 20) -> list[VerificationRun]:
        with self.connection() as connection:
            rows = connection.execute(
                "SELECT payload FROM runs ORDER BY created_at DESC, id DESC LIMIT ?", (limit,)
            ).fetchall()
        return [VerificationRun.model_validate_json(row[0]) for row in rows]

    def get_run(self, run_id: str) -> VerificationRun | None:
        with self.connection() as connection:
            row = connection.execute("SELECT payload FROM runs WHERE id = ?", (run_id,)).fetchone()
        return VerificationRun.model_validate_json(row[0]) if row else None
