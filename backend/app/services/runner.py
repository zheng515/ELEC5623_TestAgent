"""Sandboxed pytest execution for generated tests (FR9, FR10, NFR5).

Generated test code is untrusted model output, so it runs only inside a container
with no network, a read-only root filesystem, dropped capabilities, and memory, CPU,
PID and wall-clock limits. There is deliberately no host-subprocess fallback: when
Docker is unavailable, execution stays unconnected and the report says so.
"""

import logging
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ElementTree
from pathlib import Path
from typing import Protocol
from uuid import uuid4

from app.core.config import Settings
from app.schemas import ExecutedTest, ExecutionResult, GeneratedTest
from app.services.execution_environment import (
    IMAGE_ID,
    RUNTIME_PROBE,
    EnvironmentError,
    parse_environment,
)

logger = logging.getLogger(__name__)

MESSAGE_LIMIT = 2000
STDERR_LIMIT = 4000


class TestRunner(Protocol):
    def for_run(self) -> "TestRunner": ...

    def execute(
        self, tests: list[GeneratedTest], repository_root: str | None = None
    ) -> ExecutionResult: ...


class SandboxUnavailable(RuntimeError):
    """Docker, or the sandbox image, is missing."""


class DockerTestRunner:
    def __init__(self, settings: Settings, run_command=subprocess.run):
        self._settings = settings
        self._run = run_command
        self._environment = None

    def for_run(self) -> "DockerTestRunner":
        """Each verification run resolves its image once, independently of other runs."""
        return DockerTestRunner(self._settings, self._run)

    def execute(
        self, tests: list[GeneratedTest], repository_root: str | None = None
    ) -> ExecutionResult:
        if not tests:
            return ExecutionResult(executions=[], exit_code=0, timed_out=False, stderr_excerpt="")

        try:
            if self._environment is None:
                self._environment = self._prepare_environment()
        except (EnvironmentError, OSError, subprocess.SubprocessError) as error:
            message = f"Sandbox environment could not be established: {error}"
            return ExecutionResult(
                executions=[],
                exit_code=-1,
                timed_out=False,
                stderr_excerpt=message,
                environment_error=message,
            )

        with tempfile.TemporaryDirectory(prefix="reqtest-run-") as directory:
            workspace = Path(directory)
            modules = self._write_tests(workspace, tests)
            container = f"reqtest-run-{uuid4().hex[:12]}"
            try:
                completed = self._run(
                    self._command(workspace, container, repository_root),
                    capture_output=True,
                    text=True,
                    timeout=self._settings.sandbox_timeout_seconds,
                )
            except subprocess.TimeoutExpired:
                self._force_remove(container)
                return ExecutionResult(
                    executions=[],
                    exit_code=-1,
                    timed_out=True,
                    stderr_excerpt=(
                        f"Execution exceeded {self._settings.sandbox_timeout_seconds:.0f}s "
                        "and the container was removed."
                    ),
                    environment=self._environment,
                )
            except OSError as error:
                return ExecutionResult(
                    executions=[],
                    exit_code=-1,
                    timed_out=False,
                    stderr_excerpt=f"Sandbox could not start: {error}",
                    environment=self._environment,
                    environment_error=f"Sandbox could not start: {error}",
                )
            return ExecutionResult(
                executions=_parse_junit(workspace / "report.xml", modules),
                exit_code=completed.returncode,
                timed_out=False,
                stderr_excerpt=(completed.stderr or "")[:STDERR_LIMIT],
                environment=self._environment,
            )

    def _prepare_environment(self):
        settings = self._settings
        if IMAGE_ID.fullmatch(settings.sandbox_image):
            identifier = settings.sandbox_image
        else:
            result = self._run(
                [
                    settings.docker_binary,
                    "image",
                    "ls",
                    "--quiet",
                    "--no-trunc",
                    settings.sandbox_image,
                ],
                capture_output=True,
                text=True,
                timeout=30,
            )
            identifiers = sorted(set(result.stdout.split()))
            if result.returncode or len(identifiers) != 1 or not IMAGE_ID.fullmatch(identifiers[0]):
                raise EnvironmentError(
                    "Configured sandbox image does not resolve to one local immutable image ID."
                )
            identifier = identifiers[0]
        metadata = self._run(
            [settings.docker_binary, "image", "inspect", identifier, "--format", "{{json .}}"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if metadata.returncode:
            raise EnvironmentError("Pinned sandbox image is missing or unreadable.")
        container = f"reqtest-probe-{uuid4().hex[:12]}"
        try:
            probe = self._run(
                [
                    *self._base_command(container),
                    "--entrypoint",
                    "python",
                    identifier,
                    "-I",
                    "-c",
                    RUNTIME_PROBE,
                ],
                capture_output=True,
                text=True,
                timeout=min(settings.sandbox_timeout_seconds, 30),
            )
        except subprocess.TimeoutExpired:
            self._force_remove(container)
            raise EnvironmentError("Sandbox dependency probe timed out.") from None
        if probe.returncode:
            raise EnvironmentError(
                "Pinned image could not provide its Python dependency inventory."
            )
        return parse_environment(settings.sandbox_image, identifier, metadata.stdout, probe.stdout)

    def _write_tests(self, workspace: Path, tests: list[GeneratedTest]) -> dict[str, str]:
        """Write each test module and map its module name back to the test id (FR8)."""
        modules: dict[str, str] = {}
        for index, test in enumerate(tests, start=1):
            name = Path(test.module).name or f"test_generated_{index}.py"
            if name in modules:
                name = f"{Path(name).stem}_{index}.py"
            (workspace / name).write_text(test.code)
            modules[name] = test.id
        return modules

    def _command(
        self, workspace: Path, container: str, repository_root: str | None = None
    ) -> list[str]:
        # The project under test is mounted read-only and put on the import path, so a
        # generated test can import it but cannot modify it.
        repository = (
            ["--volume", f"{repository_root}:/repo:ro", "--env", "PYTHONPATH=/repo"]
            if repository_root
            else []
        )
        return [
            *self._base_command(container),
            "--volume",
            f"{workspace}:/work",
            "--workdir",
            "/work",
            *repository,
            "--entrypoint",
            "python",
            self._environment.image_id,
            "-m",
            "pytest",
            "-q",
            "--no-header",
            "-p",
            "no:cacheprovider",
            "--continue-on-collection-errors",
            "--junit-xml=/work/report.xml",
        ]

    def _base_command(self, container: str) -> list[str]:
        settings = self._settings
        return [
            settings.docker_binary,
            "run",
            "--rm",
            "--name",
            container,
            "--pull",
            "never",
            # Generated code gets no network, no writable image, and no privileges.
            "--network",
            "none",
            "--read-only",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--pids-limit",
            str(settings.sandbox_pids_limit),
            "--memory",
            settings.sandbox_memory,
            "--cpus",
            settings.sandbox_cpus,
            "--tmpfs",
            "/tmp:rw,size=64m",
        ]

    def _force_remove(self, container: str):
        try:
            self._run(
                [self._settings.docker_binary, "rm", "--force", container],
                capture_output=True,
                text=True,
                timeout=30,
            )
        except (subprocess.SubprocessError, OSError) as error:
            logger.warning("Could not remove the timed-out container %s: %s", container, error)


def _parse_junit(path: Path, modules: dict[str, str]) -> list[ExecutedTest]:
    """Read pytest's own JUnit XML. A missing or malformed file means nothing ran."""
    if not path.exists():
        return []
    try:
        root = ElementTree.parse(path).getroot()
    except ElementTree.ParseError:
        logger.warning("The sandbox produced an unreadable JUnit report.")
        return []

    executions = []
    for case in root.iter("testcase"):
        outcome, message = "passed", ""
        for kind, label in (("failure", "failed"), ("error", "error"), ("skipped", "skipped")):
            found = case.find(kind)
            if found is not None:
                outcome = label
                message = (found.get("message") or found.text or "")[:MESSAGE_LIMIT]
                break
        module = _module_name(case, modules)
        executions.append(
            ExecutedTest(
                test_id=modules.get(module),
                module=module,
                name=case.get("name", "unknown"),
                outcome=outcome,
                duration_seconds=float(case.get("time") or 0.0),
                message=message,
            )
        )
    return executions


def _module_name(case, modules: dict[str, str]) -> str:
    """Recover the module a case belongs to.

    pytest reports `test_shipping` or `test_shipping.TestClass` as the classname for a
    test it ran. For a module that failed to import there is no classname at all and
    the module name is in `name` instead, which is the case that matters most here.
    """
    classname = case.get("classname") or ""
    if classname:
        candidate = f"{classname.split('.')[0]}.py"
        if candidate in modules:
            return candidate
        return candidate
    from_name = f"{case.get('name', '')}.py"
    if from_name in modules:
        return from_name
    return Path(case.get("file") or "unknown.py").name


def create_runner(settings: Settings) -> DockerTestRunner | None:
    """Return a runner only when Docker is running and the sandbox image exists."""
    if not settings.sandbox_enabled:
        return None
    if shutil.which(settings.docker_binary) is None:
        logger.warning("Docker is not installed; generated tests will not be executed.")
        return None
    try:
        if not _succeeds([settings.docker_binary, "info"]):
            logger.warning(
                "The Docker daemon is not running; generated tests will not be executed."
            )
            return None
        if not _image_exists(settings):
            logger.warning(
                "The sandbox image %s is missing. Run: bash scripts/build-sandbox.sh",
                settings.sandbox_image,
            )
            return None
    except (subprocess.SubprocessError, OSError) as error:
        logger.warning(
            "Docker could not be queried (%s); generated tests will not be executed.", error
        )
        return None
    return DockerTestRunner(settings)


def _succeeds(command: list[str]) -> bool:
    return subprocess.run(command, capture_output=True, text=True, timeout=30).returncode == 0


def _image_exists(settings: Settings) -> bool:
    """Ask for the image id rather than inspecting it.

    With Docker's containerd image store, `docker image inspect <short-name>` fails
    for an image that `docker run <short-name>` starts happily, because inspect does
    not normalise the reference. Listing the id works on both image stores.
    """
    if IMAGE_ID.fullmatch(settings.sandbox_image):
        result = subprocess.run(
            [
                settings.docker_binary,
                "image",
                "inspect",
                settings.sandbox_image,
                "--format",
                "{{.Id}}",
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return result.returncode == 0 and result.stdout.strip() == settings.sandbox_image
    result = subprocess.run(
        [settings.docker_binary, "image", "ls", "--quiet", settings.sandbox_image],
        capture_output=True,
        text=True,
        timeout=30,
    )
    return result.returncode == 0 and bool(result.stdout.strip())
