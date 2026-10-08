"""Persisted, bounded background runs for a single local API process."""

import logging
from datetime import UTC, datetime
from queue import Queue
from threading import Event, Lock, Thread
from typing import Literal
from uuid import uuid4

from app.core.database import Store
from app.schemas import Project, RunEvent, VerificationReport, VerificationRun
from app.services.orchestrator import Orchestrator
from app.services.run_context import new_run

logger = logging.getLogger(__name__)


class JobInterrupted(RuntimeError):
    pass


class RunManager:
    def __init__(self, store: Store, orchestrator: Orchestrator, capacity: int = 20):
        self.store = store
        self.orchestrator = orchestrator
        self.capacity = capacity
        self.worker_id = str(uuid4())
        self._queue: Queue[tuple[Project, VerificationRun] | None] = Queue()
        self._stopped = Event()
        self._lock = Lock()
        self._thread = Thread(target=self._work, name="reqtest-worker", daemon=True)

    def start(self):
        self.store.interrupt_runs(
            "The backend restarted before this run finished. Start a new run to retry."
        )
        self._thread.start()

    def submit(self, project: Project) -> VerificationRun:
        return self._submit(project, "manual")[0]

    def submit_watch(self, project: Project) -> VerificationRun | None:
        """Queue an incremental run, or None while another run for the project is active."""
        run, created = self._submit(project, "watch")
        return run if created else None

    def _submit(
        self, project: Project, trigger: Literal["manual", "watch"]
    ) -> tuple[VerificationRun, bool]:
        context = new_run(
            project, mode=getattr(self.orchestrator, "mode", "scaffold"), trigger=trigger
        )
        queued = context.model_copy(
            update={
                "updated_at": context.created_at,
                "status": "queued",
                "events": [
                    RunEvent(
                        id=str(uuid4()),
                        stage="queue",
                        created_at=context.created_at,
                        message="Run queued. Waiting for the background worker.",
                    )
                ],
                "report": VerificationReport(
                    summary="Run queued. Results will appear as stages finish.",
                    requirement_document=project.requirement_document,
                ),
            }
        )
        with self._lock:
            if self._stopped.is_set():
                raise JobInterrupted("The backend is stopping. Retry after it restarts.")
            run, created = self.store.reserve_run(queued, self.worker_id, self.capacity)
            if created:
                self._queue.put((project, run))
        return run, created

    def stop(self):
        with self._lock:
            self._stopped.set()
            self.store.interrupt_runs(
                "The backend stopped before this run finished. Start a new run to retry.",
                self.worker_id,
            )
            self._queue.put(None)
        self._thread.join(timeout=1)

    def _work(self):
        while not self._stopped.is_set():
            item = self._queue.get()
            if item is None:
                return
            self._execute(*item)

    def _execute(self, project: Project, queued: VerificationRun):
        latest = queued.model_copy(deep=True)

        def save(snapshot: VerificationRun):
            nonlocal latest
            if self._stopped.is_set():
                raise JobInterrupted()
            latest = snapshot.model_copy(
                update={
                    "updated_at": datetime.now(UTC),
                    "events": [queued.events[0], *snapshot.events],
                },
                deep=True,
            )
            if not self.store.update_active_run(latest, self.worker_id):
                raise JobInterrupted()

        try:
            save(
                queued.model_copy(
                    update={
                        "status": "running",
                        "events": [],
                        "report": VerificationReport(summary="Agent run started."),
                    }
                )
            )
            options = {}
            if queued.trigger == "watch":
                # The latest completed run is looked up now, so a run that finished while
                # this one waited in the queue is the baseline.
                options = {
                    "incremental": True,
                    "baseline": self.store.latest_completed_run(project.id),
                }
            result = self.orchestrator.run(project, on_progress=save, run=queued, **options)
            save(result)
        except JobInterrupted:
            return
        except Exception as error:
            if self._stopped.is_set():
                return
            logger.exception("Background run %s failed", queued.id)
            latest.status = "failed"
            latest.updated_at = datetime.now(UTC)
            message = f"The worker stopped after an unexpected {type(error).__name__}."
            latest.report.summary = message + " Completed stage outputs are retained."
            latest.report.unresolved_issues.append(message)
            latest.events.append(
                RunEvent(
                    id=str(uuid4()),
                    stage="interrupt",
                    created_at=latest.updated_at,
                    message=message,
                )
            )
            self.store.update_active_run(latest, self.worker_id)
