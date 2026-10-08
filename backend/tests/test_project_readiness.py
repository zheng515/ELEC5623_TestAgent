"""No environment check may silently invent readiness or consume model calls."""

import json

from test_runner import TESTS, FakeDocker

from app.core.config import Settings
from app.services.project_readiness import check_project_readiness
from app.services.runner import DockerTestRunner


def test_readiness_prepares_the_same_image_used_for_execution_and_sets_src_path():
    class ReadinessDocker(FakeDocker):
        def __call__(self, command, **kwargs):
            result = super().__call__(command, **kwargs)
            if "-I" in command and "modules" in command[-1]:
                result.stdout = json.dumps(
                    dict(status="ready", checks=[], notes=[], import_roots=["src", "."])
                )
            return result

    docker = ReadinessDocker()
    runner = DockerTestRunner(Settings(_env_file=None), docker).for_run()
    readiness = runner.preflight("/saved-copy", ["src", "."], [("shipping", "src/shipping.py")])
    execution = runner.execute(TESTS, "/saved-copy")
    assert readiness.status == "ready"
    assert readiness.environment == execution.environment
    commands = [command for command in docker.commands if command[1] == "run"]
    preflight = next(command for command in commands if "modules" in command[-1])
    assert json.loads(preflight[-1])["modules"] == [["shipping", "src/shipping.py"]]
    assert any("/saved-copy:/repo:ro" in command for command in commands)
    assert "PYTHONPATH=/repo/src:/repo" in commands[-1]
    assert sum(command[1:3] == ["image", "ls"] for command in docker.commands) == 1


def test_missing_repository_is_unknown_instead_of_ready():
    readiness = check_project_readiness(None, None, Settings(_env_file=None))
    assert readiness.status == "unknown"


def test_invalid_readiness_output_blocks_execution_proposals():
    runner = DockerTestRunner(Settings(_env_file=None), FakeDocker()).for_run()
    readiness = runner.preflight("/snapshot", ["."], [("shipping", "shipping.py")])
    assert readiness.status == "blocked"
    assert any("could not be established" in note for note in readiness.notes)
