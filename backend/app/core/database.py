import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from app.schemas import Project, RunEvent, User, VerificationRun


class RunQueueFull(RuntimeError):
    pass


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
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    expires_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
                CREATE TABLE IF NOT EXISTS auth_attempts (
                    key TEXT PRIMARY KEY,
                    count INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL
                );
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
            # Legacy projects stay unowned until an administrator assigns them explicitly.
            columns = {row[1] for row in connection.execute("PRAGMA table_info(projects)")}
            if "owner_id" not in columns:
                connection.execute(
                    "ALTER TABLE projects ADD COLUMN owner_id TEXT REFERENCES users(id)"
                )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id, created_at)"
            )
            run_columns = {row[1] for row in connection.execute("PRAGMA table_info(runs)")}
            for name in ("status", "worker_id"):
                if name not in run_columns:
                    connection.execute(f"ALTER TABLE runs ADD COLUMN {name} TEXT")
            for run_id, payload in connection.execute(
                "SELECT id, payload FROM runs WHERE status IS NULL"
            ).fetchall():
                connection.execute(
                    "UPDATE runs SET status = ? WHERE id = ?",
                    (json.loads(payload).get("status", "blocked"), run_id),
                )
            connection.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_active_project ON runs(project_id) "
                "WHERE status IN ('queued', 'running')"
            )

    def create_project(self, project: Project, owner_id: str):
        with self.connection() as connection:
            connection.execute(
                "INSERT INTO projects (id, created_at, payload, owner_id) VALUES (?, ?, ?, ?)",
                (project.id, project.created_at.isoformat(), project.model_dump_json(), owner_id),
            )

    def list_projects(self, owner_id: str) -> list[Project]:
        with self.connection() as connection:
            rows = connection.execute(
                "SELECT payload FROM projects WHERE owner_id = ? ORDER BY created_at DESC, id DESC",
                (owner_id,),
            ).fetchall()
        return [Project.model_validate_json(row[0]) for row in rows]

    def get_project(self, project_id: str, owner_id: str) -> Project | None:
        with self.connection() as connection:
            row = connection.execute(
                "SELECT payload FROM projects WHERE id = ? AND owner_id = ?",
                (project_id, owner_id),
            ).fetchone()
        return Project.model_validate_json(row[0]) if row else None

    def create_run(self, run: VerificationRun):
        with self.connection() as connection:
            connection.execute(
                "INSERT INTO runs (id, project_id, created_at, payload, status) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    run.id,
                    run.project_id,
                    run.created_at.isoformat(),
                    run.model_dump_json(),
                    run.status,
                ),
            )

    def reserve_run(
        self, run: VerificationRun, worker_id: str, capacity: int
    ) -> tuple[VerificationRun, bool]:
        """Persist before dispatch; serialize submissions so double clicks reuse active work."""
        with self.connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                "SELECT payload FROM runs WHERE project_id = ? AND status IN ('queued', 'running')",
                (run.project_id,),
            ).fetchone()
            if existing:
                return VerificationRun.model_validate_json(existing[0]), False
            count = connection.execute(
                "SELECT COUNT(*) FROM runs WHERE status IN ('queued', 'running')"
            ).fetchone()[0]
            if count >= capacity:
                raise RunQueueFull("The run queue is full. Wait for an active run to finish.")
            connection.execute(
                "INSERT INTO runs (id, project_id, created_at, payload, status, worker_id) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    run.id,
                    run.project_id,
                    run.created_at.isoformat(),
                    run.model_dump_json(),
                    run.status,
                    worker_id,
                ),
            )
        return run, True

    def update_active_run(self, run: VerificationRun, worker_id: str) -> bool:
        """A stopped or superseded worker cannot overwrite an interrupted run."""
        with self.connection() as connection:
            result = connection.execute(
                "UPDATE runs SET payload = ?, status = ? WHERE id = ? AND worker_id = ? "
                "AND status IN ('queued', 'running')",
                (run.model_dump_json(), run.status, run.id, worker_id),
            )
            return result.rowcount == 1

    def interrupt_runs(self, message: str, worker_id: str | None = None):
        with self.connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            rows = connection.execute(
                "SELECT payload FROM runs WHERE status IN ('queued', 'running') "
                + ("AND worker_id = ?" if worker_id else ""),
                (worker_id,) if worker_id else (),
            ).fetchall()
            for (payload,) in rows:
                run = VerificationRun.model_validate_json(payload)
                now = datetime.now(UTC)
                run.status = "failed"
                run.updated_at = now
                run.events.append(
                    RunEvent(
                        id=f"interrupted-{run.id}",
                        stage="interrupt",
                        created_at=now,
                        message=message,
                    )
                )
                run.report.summary = message + " Completed stage outputs are retained."
                run.report.unresolved_issues.append(message)
                connection.execute(
                    "UPDATE runs SET payload = ?, status = 'failed' WHERE id = ?",
                    (run.model_dump_json(), run.id),
                )

    def list_runs(self, project_id: str) -> list[VerificationRun]:
        with self.connection() as connection:
            rows = connection.execute(
                "SELECT payload FROM runs WHERE project_id = ? ORDER BY created_at DESC, id DESC",
                (project_id,),
            ).fetchall()
        return [VerificationRun.model_validate_json(row[0]) for row in rows]

    def recent_runs(self, owner_id: str, limit: int = 20) -> list[VerificationRun]:
        with self.connection() as connection:
            rows = connection.execute(
                "SELECT runs.payload FROM runs JOIN projects ON projects.id = runs.project_id "
                "WHERE projects.owner_id = ? ORDER BY runs.created_at DESC, runs.id DESC LIMIT ?",
                (owner_id, limit),
            ).fetchall()
        return [VerificationRun.model_validate_json(row[0]) for row in rows]

    def get_run(self, run_id: str, owner_id: str) -> VerificationRun | None:
        with self.connection() as connection:
            row = connection.execute(
                "SELECT runs.payload FROM runs JOIN projects ON projects.id = runs.project_id "
                "WHERE runs.id = ? AND projects.owner_id = ?",
                (run_id, owner_id),
            ).fetchone()
        return VerificationRun.model_validate_json(row[0]) if row else None

    def create_user(self, user: User, password_hash: str):
        with self.connection() as connection:
            connection.execute(
                "INSERT INTO users (id, email, name, password_hash, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (user.id, user.email, user.name, password_hash, user.created_at.isoformat()),
            )

    def find_credentials(self, email: str) -> tuple[User, str] | None:
        with self.connection() as connection:
            connection.row_factory = sqlite3.Row
            row = connection.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        return (User.model_validate(dict(row)), row["password_hash"]) if row else None

    def create_session(self, token_hash: str, user_id: str, expires_at: int, now: int):
        with self.connection() as connection:
            connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
            connection.execute(
                "INSERT INTO sessions VALUES (?, ?, ?)", (token_hash, user_id, expires_at)
            )

    def session_user(self, token_hash: str, now: int) -> User | None:
        with self.connection() as connection:
            connection.row_factory = sqlite3.Row
            row = connection.execute(
                "SELECT users.id, users.email, users.name, users.created_at FROM users "
                "JOIN sessions ON sessions.user_id = users.id "
                "WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
                (token_hash, now),
            ).fetchone()
        return User.model_validate(dict(row)) if row else None

    def delete_session(self, token_hash: str):
        with self.connection() as connection:
            connection.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))

    def allow_auth_attempt(self, key: str, now: int, limit: int = 20) -> bool:
        """Atomically limit expensive authentication attempts per client over 15 minutes."""
        with self.connection() as connection:
            connection.execute("DELETE FROM auth_attempts WHERE expires_at <= ?", (now,))
            connection.execute(
                "INSERT INTO auth_attempts VALUES (?, 1, ?) "
                "ON CONFLICT(key) DO UPDATE SET count = count + 1",
                (key, now + 900),
            )
            count = connection.execute(
                "SELECT count FROM auth_attempts WHERE key = ?",
                (key,),
            ).fetchone()[0]
        return count <= limit
