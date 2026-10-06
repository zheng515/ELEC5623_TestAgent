"""Image tag changes must not change the environment within one run."""

import json
import subprocess

import pytest
from test_runner import PINNED_IMAGE, TESTS, FakeDocker

from app.core.config import Settings
from app.services.execution_environment import EnvironmentError, parse_environment
from app.services.runner import DockerTestRunner


def test_repeated_execution_resolves_and_probes_environment_only_once():
    docker = FakeDocker()
    runner = DockerTestRunner(Settings(_env_file=None), docker).for_run()
    first = runner.execute(TESTS)
    second = runner.execute(TESTS)
    assert first.environment == second.environment
    assert first.environment.image_id == PINNED_IMAGE
    assert sum(command[1:3] == ["image", "ls"] for command in docker.commands) == 1
    assert sum("-I" in command for command in docker.commands) == 1
    for command in docker.commands:
        if command[1] == "run":
            assert PINNED_IMAGE in command
            assert "reqtest-sandbox:1" not in command
            assert command[command.index("--pull") + 1] == "never"


def test_new_verification_run_resolves_current_tag_without_mutating_prior_environment():
    second_id = "sha256:" + "b" * 64

    class RetaggedDocker(FakeDocker):
        current = PINNED_IMAGE

        def __call__(self, command, **kwargs):
            result = super().__call__(command, **kwargs)
            if command[1:3] == ["image", "ls"]:
                result.stdout = self.current
            if command[1:3] == ["image", "inspect"]:
                result.stdout = json.dumps(
                    {"Id": command[3], "RepoDigests": [], "Os": "linux", "Architecture": "arm64"}
                )
            return result

    docker = RetaggedDocker()
    factory = DockerTestRunner(Settings(_env_file=None), docker)
    original = factory.for_run()
    first = original.execute(TESTS)
    docker.current = second_id
    repaired = original.execute(TESTS)
    next_run = factory.for_run().execute(TESTS)
    assert repaired.environment.image_id == first.environment.image_id == PINNED_IMAGE
    assert next_run.environment.image_id == second_id
    assert first.environment.fingerprint != next_run.environment.fingerprint


@pytest.mark.parametrize(
    "failure", ["missing", "multiple", "inspect", "probe", "invalid_inventory"]
)
def test_unidentified_environment_never_executes_generated_tests(failure):
    class BrokenDocker(FakeDocker):
        def __call__(self, command, **kwargs):
            result = super().__call__(command, **kwargs)
            if command[1:3] == ["image", "ls"]:
                if failure == "missing":
                    result.stdout = ""
                if failure == "multiple":
                    result.stdout = PINNED_IMAGE + "\nsha256:" + "b" * 64
            if command[1:3] == ["image", "inspect"] and failure == "inspect":
                result.returncode = 1
            if "-I" in command:
                if failure == "probe":
                    result.returncode = 1
                if failure == "invalid_inventory":
                    result.stdout = "{}"
            return result

    docker = BrokenDocker()
    result = DockerTestRunner(Settings(_env_file=None), docker).execute(TESTS)
    assert result.executions == []
    assert result.environment_error
    assert not any("--junit-xml=/work/report.xml" in command for command in docker.commands)


def test_probe_timeout_removes_probe_container_and_never_starts_tests():
    class SlowDocker(FakeDocker):
        def __call__(self, command, **kwargs):
            result = super().__call__(command, **kwargs)
            if "-I" in command:
                raise subprocess.TimeoutExpired(command, 30)
            return result

    docker = SlowDocker()
    result = DockerTestRunner(Settings(_env_file=None), docker).execute(TESTS)
    assert result.environment_error
    assert "probe timed out" in result.stderr_excerpt
    assert docker.commands[-1][1:3] == ["rm", "--force"]
    assert not any("--junit-xml=/work/report.xml" in command for command in docker.commands)


def test_environment_fingerprint_is_independent_of_descriptive_tag():
    metadata = json.dumps({"Id": PINNED_IMAGE, "Os": "linux", "Architecture": "arm64"})
    inventory = json.dumps(
        {
            "python_version": "3.11",
            "platform": "Linux",
            "packages": [{"name": "pytest", "version": "9.1.1"}],
        }
    )
    first = parse_environment("image:1", PINNED_IMAGE, metadata, inventory)
    second = parse_environment("image:2", PINNED_IMAGE, metadata, inventory)
    assert first.fingerprint == second.fingerprint
    with pytest.raises(EnvironmentError):
        parse_environment("image:1", PINNED_IMAGE, metadata, inventory.replace("pytest", "other"))


def test_explicit_full_image_id_is_supported_without_a_tag_lookup():
    docker = FakeDocker()
    settings = Settings(sandbox_image=PINNED_IMAGE, _env_file=None)
    result = DockerTestRunner(settings, docker).execute(TESTS)
    assert result.environment.image_id == PINNED_IMAGE
    assert not any(command[1:3] == ["image", "ls"] for command in docker.commands)


def test_recorded_dependency_change_changes_environment_fingerprint():
    metadata = json.dumps({"Id": PINNED_IMAGE, "Os": "linux", "Architecture": "arm64"})
    inventory = json.dumps(
        {
            "python_version": "3.11",
            "platform": "Linux",
            "packages": [{"name": "pytest", "version": "9.1.1"}],
        }
    )
    first = parse_environment("image:1", PINNED_IMAGE, metadata, inventory)
    different = parse_environment(
        "image:1", PINNED_IMAGE, metadata, inventory.replace("9.1.1", "9.1.2")
    )
    assert first.fingerprint != different.fingerprint
