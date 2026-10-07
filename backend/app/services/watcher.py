"""Poll watched GitHub repositories and queue an incremental run for each new commit.

A watch is per project and only for GitHub URLs. Each check resolves the URL's branch
to a commit without downloading anything. A commit that differs from the last one
handled queues a watch-triggered run, which grows the latest completed run's suite
(see `incremental`). The commit only counts as handled once its run is queued, so a
busy project or a full queue is simply retried at the next check. Failures are
recorded on the watch rather than raised; one bad repository never stops the loop.
"""

import logging
from collections.abc import Callable
from threading import Event, Thread

from app.core.config import Settings
from app.core.database import RunQueueFull, Store
from app.schemas import Project, VerificationRun
from app.services.github_source import GitHubError, latest_commit
from app.services.jobs import JobInterrupted, RunManager

logger = logging.getLogger(__name__)


class RepositoryWatcher:
    def __init__(
        self,
        store: Store,
        runs: RunManager,
        settings: Settings,
        *,
        resolve: Callable[[str, Settings], str] = latest_commit,
    ):
        self._store = store
        self._runs = runs
        self._settings = settings
        self._resolve = resolve
        self._stopped = Event()
        self._wake = Event()
        self._thread = Thread(target=self._loop, name="reqtest-watcher", daemon=True)

    def start(self):
        self._thread.start()

    def stop(self):
        self._stopped.set()
        self._wake.set()
        self._thread.join(timeout=1)

    def wake(self):
        """Check now instead of at the end of the current interval."""
        self._wake.set()

    def _loop(self):
        while not self._stopped.is_set():
            self._wake.wait(self._settings.watch_interval_seconds)
            self._wake.clear()
            if not self._stopped.is_set():
                self.check_all()

    def check_all(self) -> list[VerificationRun]:
        queued = []
        for project, watch in self._store.enabled_watches():
            if self._stopped.is_set():
                break
            try:
                run = self.check(project, watch["last_commit"])
            except Exception:
                logger.exception("Watch check for project %s failed", project.id)
                continue
            if run is not None:
                queued.append(run)
        return queued

    def check(self, project: Project, last_commit: str | None) -> VerificationRun | None:
        try:
            commit = self._resolve(project.repository_ref, self._settings)
        except GitHubError as error:
            self._store.record_watch_check(project.id, error=str(error))
            return None
        if commit == last_commit:
            self._store.record_watch_check(project.id)
            return None
        try:
            run = self._runs.submit_watch(project)
        except (RunQueueFull, JobInterrupted) as error:
            self._store.record_watch_check(project.id, error=f"New commit not queued: {error}")
            return None
        if run is None:
            self._store.record_watch_check(
                project.id,
                error=f"Commit {commit[:12]} waits for the project's active run to finish.",
            )
            return None
        self._store.record_watch_check(project.id, commit=commit, run_id=run.id)
        return run
