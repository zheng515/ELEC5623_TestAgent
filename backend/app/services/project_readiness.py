"""Check a saved project before planning or generating executable tests."""

from app.core.config import Settings
from app.schemas import ProjectReadiness, RepositorySnapshot
from app.services.repository_snapshot import SnapshotError, verified_snapshot_root
from app.services.runner import TestRunner


def check_project_readiness(
    repository: RepositorySnapshot | None, runner: TestRunner | None, settings: Settings
) -> ProjectReadiness:
    if repository is None or repository.artifact is None:
        return ProjectReadiness(
            status="unknown",
            notes=["No saved repository is available for project readiness checks."],
        )
    if runner is None:
        return ProjectReadiness(
            status="unknown",
            import_roots=repository.import_roots,
            notes=[
                "No sandbox is available. Dependency versions and import availability "
                "were not checked; generated tests remain proposals."
            ],
        )
    try:
        root = verified_snapshot_root(repository.artifact, settings)
        result = runner.preflight(
            str(root), repository.import_roots, [module.path for module in repository.modules]
        )
        verified_snapshot_root(repository.artifact, settings)
        return result
    except SnapshotError as error:
        return ProjectReadiness(
            status="blocked",
            import_roots=repository.import_roots,
            notes=[f"Project readiness snapshot check failed: {error}"],
        )
