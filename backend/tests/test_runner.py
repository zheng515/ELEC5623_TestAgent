"""Sandbox execution tests. Docker is never invoked; the command is captured instead."""

import subprocess
from pathlib import Path

import pytest

from app.core.config import Settings
from app.schemas import GeneratedTest
from app.services.runner import DockerTestRunner, _image_exists, create_runner

JUNIT = """<?xml version="1.0" encoding="utf-8"?>
<testsuites><testsuite name="pytest" tests="3">
  <testcase classname="test_shipping" name="test_free_shipping" time="0.012"/>
  <testcase classname="test_shipping" name="test_boundary" time="0.004">
    <failure message="assert 1000 == 0">long traceback</failure>
  </testcase>
  <testcase classname="test_orders" name="test_rejects_negative" time="0.001">
    <error message="ModuleNotFoundError: No module named 'orders'">collection failure</error>
  </testcase>
</testsuite></testsuites>
"""

TESTS = [
    GeneratedTest(
        id="T1",
        requirement_ids=["R1"],
        name="test_free_shipping",
        module="test_shipping.py",
        code="def test_free_shipping():\n    assert True\n",
        rationale="",
    ),
    GeneratedTest(
        id="T2",
        requirement_ids=["R2"],
        name="test_rejects_negative",
        module="test_orders.py",
        code="import orders\n",
        rationale="",
    ),
]


@pytest.fixture
def settings():
    return Settings(sandbox_timeout_seconds=30, _env_file=None)


class FakeDocker:
    """Stands in for subprocess.run: records the command and writes the report."""

    def __init__(self, report=JUNIT, returncode=1, stderr="", raises=None):
        self.report = report
        self.returncode = returncode
        self.stderr = stderr
        self.raises = raises
        self.commands: list[list[str]] = []
        self.written: list[str] = []

    def __call__(self, command, **kwargs):
        self.commands.append(command)
        if self.raises and command[1] == "run":
            raise self.raises
        if command[1] == "run":
            workspace = Path(command[command.index("--volume") + 1].rsplit(":", 1)[0])
            self.written = sorted(path.name for path in workspace.glob("*.py"))
            if self.report is not None:
                (workspace / "report.xml").write_text(self.report)
        return subprocess.CompletedProcess(command, self.returncode, "", self.stderr)


def test_outcomes_are_read_from_the_pytest_report(settings):
    docker = FakeDocker()

    result = DockerTestRunner(settings, docker).execute(TESTS)

    assert [(e.module, e.name, e.outcome) for e in result.executions] == [
        ("test_shipping.py", "test_free_shipping", "passed"),
        ("test_shipping.py", "test_boundary", "failed"),
        ("test_orders.py", "test_rejects_negative", "error"),
    ]
    assert result.executions[2].message.startswith("ModuleNotFoundError")
    assert result.executions[0].duration_seconds == 0.012
    assert not result.timed_out


def test_each_outcome_is_traced_back_to_the_test_that_produced_it(settings):
    result = DockerTestRunner(settings, FakeDocker()).execute(TESTS)

    assert [e.test_id for e in result.executions] == ["T1", "T1", "T2"]


def test_generated_code_runs_without_network_privileges_or_a_writable_image(settings):
    docker = FakeDocker()

    DockerTestRunner(settings, docker).execute(TESTS)

    command = " ".join(docker.commands[0])
    assert "--network none" in command
    assert "--read-only" in command
    assert "--cap-drop ALL" in command
    assert "--security-opt no-new-privileges" in command
    assert "--pids-limit 128" in command
    assert "--memory 512m" in command
    assert "--rm" in command


# Exactly the shape pytest emits: a module that failed to import has no classname
# and carries its module name in `name`, and a class method prefixes the classname.
COLLECTION_ERROR_JUNIT = """<?xml version="1.0" encoding="utf-8"?>
<testsuites name="pytest tests"><testsuite name="pytest" errors="1" tests="4">
  <testcase classname="" name="test_orders" time="0.000">
    <error message="collection failure">ModuleNotFoundError: No module named 'orders'</error>
  </testcase>
  <testcase classname="test_shipping" name="test_free_shipping" time="0.000" />
  <testcase classname="test_shipping" name="test_boundary" time="0.000">
    <failure message="assert 1000 == 0">traceback</failure>
  </testcase>
  <testcase classname="test_shipping.TestGrouped" name="test_inside_class" time="0.000" />
</testsuite></testsuites>
"""


def test_a_module_that_failed_to_import_is_still_traced_to_its_test(settings):
    docker = FakeDocker(report=COLLECTION_ERROR_JUNIT)

    result = DockerTestRunner(settings, docker).execute(TESTS)

    assert [(e.module, e.test_id, e.outcome) for e in result.executions] == [
        ("test_orders.py", "T2", "error"),
        ("test_shipping.py", "T1", "passed"),
        ("test_shipping.py", "T1", "failed"),
        ("test_shipping.py", "T1", "passed"),
    ]


def test_one_uncollectable_module_does_not_discard_the_other_results(settings):
    docker = FakeDocker()

    DockerTestRunner(settings, docker).execute(TESTS)

    # Without this flag pytest aborts the session on the first import error, and a
    # generated suite loses every result behind it.
    assert "--continue-on-collection-errors" in docker.commands[0]


def test_the_test_files_are_written_where_the_container_reads_them(settings):
    docker = FakeDocker()

    DockerTestRunner(settings, docker).execute(TESTS)

    command = docker.commands[0]
    assert command[command.index("--workdir") + 1] == "/work"
    assert command[command.index("--volume") + 1].endswith(":/work")
    assert "--junit-xml=/work/report.xml" in command


def test_a_timeout_removes_the_container_and_records_no_outcome(settings):
    docker = FakeDocker(raises=subprocess.TimeoutExpired(cmd="docker", timeout=30))

    result = DockerTestRunner(settings, docker).execute(TESTS)

    assert result.timed_out
    assert result.executions == []
    assert "30s" in result.stderr_excerpt
    assert docker.commands[1][1:3] == ["rm", "--force"]


def test_a_missing_report_is_not_treated_as_a_passing_suite(settings):
    result = DockerTestRunner(settings, FakeDocker(report=None, stderr="boom")).execute(TESTS)

    assert result.executions == []
    assert result.stderr_excerpt == "boom"


def test_an_unreadable_report_is_not_treated_as_a_passing_suite(settings):
    result = DockerTestRunner(settings, FakeDocker(report="<not xml")).execute(TESTS)

    assert result.executions == []


def test_nothing_is_executed_when_there_is_nothing_to_execute(settings):
    docker = FakeDocker()

    result = DockerTestRunner(settings, docker).execute([])

    assert docker.commands == []
    assert result.executions == []


def test_duplicate_module_names_do_not_overwrite_each_other(settings):
    docker = FakeDocker()
    duplicates = [TESTS[0], TESTS[0].model_copy(update={"id": "T9"})]

    DockerTestRunner(settings, docker).execute(duplicates)

    # Both files must reach the workspace, or the second test is silently lost.
    assert docker.written == ["test_shipping.py", "test_shipping_2.py"]


def test_each_generated_module_reaches_the_workspace(settings):
    docker = FakeDocker()

    DockerTestRunner(settings, docker).execute(TESTS)

    assert docker.written == ["test_orders.py", "test_shipping.py"]


def test_no_runner_is_created_without_a_sandbox(monkeypatch):
    assert create_runner(Settings(sandbox_enabled=False, _env_file=None)) is None
    monkeypatch.setattr("app.services.runner.shutil.which", lambda _: None)
    assert create_runner(Settings(_env_file=None)) is None


def test_no_runner_is_created_when_the_image_is_missing(monkeypatch):
    monkeypatch.setattr("app.services.runner.shutil.which", lambda _: "/usr/local/bin/docker")
    monkeypatch.setattr("app.services.runner._succeeds", lambda command: True)
    monkeypatch.setattr("app.services.runner._image_exists", lambda settings: False)
    assert create_runner(Settings(_env_file=None)) is None


def test_a_runner_is_created_when_docker_and_the_image_are_present(monkeypatch):
    monkeypatch.setattr("app.services.runner.shutil.which", lambda _: "/usr/local/bin/docker")
    monkeypatch.setattr("app.services.runner._succeeds", lambda command: True)
    monkeypatch.setattr("app.services.runner._image_exists", lambda settings: True)
    assert isinstance(create_runner(Settings(_env_file=None)), DockerTestRunner)


def test_the_image_is_looked_up_by_id_not_by_inspecting_it(monkeypatch):
    """`docker image inspect <short-name>` gives a false negative on the containerd
    image store, for an image `docker run <short-name>` starts fine."""
    commands = []

    def fake_run(command, **kwargs):
        commands.append(command)
        return subprocess.CompletedProcess(command, 0, "d8166849c6e8\n", "")

    monkeypatch.setattr("app.services.runner.subprocess.run", fake_run)
    assert _image_exists(Settings(_env_file=None)) is True
    assert commands[0][1:4] == ["image", "ls", "--quiet"]


def test_an_empty_image_listing_means_the_image_is_absent(monkeypatch):
    monkeypatch.setattr(
        "app.services.runner.subprocess.run",
        lambda command, **kwargs: subprocess.CompletedProcess(command, 0, "\n", ""),
    )
    assert _image_exists(Settings(_env_file=None)) is False
