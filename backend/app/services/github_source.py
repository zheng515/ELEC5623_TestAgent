"""Download a GitHub repository at a pinned commit for inspection (FR4).

A GitHub URL is user input. Only the owner, repository, ref and folder are taken from
it; requests go to the GitHub API, never to the URL as given. The ref is resolved to a
commit first and the archive of exactly that commit is downloaded, so a run records
which code it read even when the branch later moves. The archive is streamed under
byte and time limits, and only ordinary files and directories inside the requested
folder are unpacked: absolute and `..` paths refuse the whole archive, and links and
device entries are skipped. The unpacked tree is temporary. The snapshot capture copies
and fingerprints it, and the download is deleted afterwards. Nothing in it runs here.
"""

import http.client
import io
import json
import re
import shutil
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
import zlib
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from urllib.parse import parse_qsl, quote, unquote, urlsplit

from app.core.config import Settings
from app.schemas import RepositorySource
from app.services.repository_snapshot import SKIPPED_DIRECTORIES

API_URL = "https://api.github.com"
API_VERSION = "2022-11-28"
GITHUB_HOSTS = {"github.com", "www.github.com"}
# The API answers on api.github.com and serves archives from codeload.github.com.
DOWNLOAD_HOSTS = {"api.github.com", "codeload.github.com"}
CREDENTIAL_PARAMETERS = {"token", "access_token", "private_token"}
MAX_METADATA_BYTES = 1_000_000
# A small archive can expand enormously; stop decompressing long before that matters.
MAX_UNPACKED_BYTES = 2_000_000_000
# /tree/<ref>/<folder>: a ref may itself contain slashes, so prefixes are tried in turn.
MAX_REF_SEGMENTS = 10
MAX_TREE_SEGMENTS = 32

OWNER = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")
NAME = re.compile(r"^[A-Za-z0-9._-]{1,100}$")
COMMIT = re.compile(r"^[0-9a-f]{40}(?:[0-9a-f]{24})?$")
ABBREVIATED_COMMIT = re.compile(r"^[0-9a-fA-F]{7,64}$")

USAGE = (
    "Use a GitHub repository URL such as https://github.com/owner/repository, optionally "
    "followed by /tree/<branch>/<folder> or /commit/<sha>."
)
CREDENTIALS = (
    "Repository URLs must not contain credentials. Remove them; private GitHub "
    "repositories are read with REQTEST_GITHUB_TOKEN on the server."
)
RATE_LIMITED = (
    "GitHub's API rate limit was reached. Try again later, or set REQTEST_GITHUB_TOKEN "
    "on the server for a higher limit."
)
TIMED_OUT = "Downloading from GitHub took longer than REQTEST_GITHUB_TIMEOUT_SECONDS allows."


class GitHubError(RuntimeError):
    """The URL is not a usable GitHub reference, or its code could not be downloaded."""


class _StatusError(GitHubError):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class GitHubLocation:
    owner: str
    name: str
    # Path segments after /tree/ (a ref, possibly followed by a folder), or one commit.
    tree: tuple[str, ...] = ()

    @property
    def repository(self) -> str:
        return f"{self.owner}/{self.name}"


def is_remote(reference: str) -> bool:
    """A reference that names a network location rather than a local path."""
    return "://" in reference or reference.strip().startswith("git@")


def contains_credentials(reference: str) -> bool:
    """Whether a remote reference embeds a secret that must not be stored."""
    if not is_remote(reference) or reference.strip().startswith("git@"):
        return False
    try:
        parts = urlsplit(reference.strip())
    except ValueError:
        return False
    if parts.password is not None:
        return True
    if parts.username is not None and not (parts.scheme == "ssh" and parts.username == "git"):
        return True
    return any(key.lower() in CREDENTIAL_PARAMETERS for key, _ in parse_qsl(parts.query))


def parse_github_url(reference: str) -> GitHubLocation:
    """Take the owner, repository and optional ref or folder from a GitHub URL."""
    reference = reference.strip()
    if contains_credentials(reference):
        raise GitHubError(CREDENTIALS)
    if reference.startswith("git@"):
        host, _, path = reference.removeprefix("git@").partition(":")
        if host.lower() not in GITHUB_HOSTS:
            raise GitHubError("Only GitHub repositories can be downloaded. " + USAGE)
        segments = _segments(path)
        if len(segments) != 2:
            raise GitHubError("This GitHub URL does not name a repository. " + USAGE)
        return _location(segments[0], segments[1], ())

    try:
        parts = urlsplit(reference)
        host = (parts.hostname or "").lower()
    except ValueError as error:
        raise GitHubError("The repository URL is not valid. " + USAGE) from error
    if parts.scheme.lower() not in {"https", "http", "ssh"} or host not in GITHUB_HOSTS:
        raise GitHubError("Only GitHub repositories can be downloaded. " + USAGE)

    segments = _segments(parts.path)
    if len(segments) < 2:
        raise GitHubError("This GitHub URL does not name a repository. " + USAGE)
    owner, name, rest = segments[0], segments[1], segments[2:]
    if not rest:
        return _location(owner, name, ())
    if rest[0] == "tree" and len(rest) > 1:
        return _location(owner, name, tuple(rest[1:]))
    if rest[0] == "commit" and len(rest) == 2 and ABBREVIATED_COMMIT.match(rest[1]):
        return _location(owner, name, (rest[1].lower(),))
    raise GitHubError("This GitHub URL does not name a repository or folder. " + USAGE)


def names_fixed_commit(reference: str) -> bool:
    """Whether a GitHub URL pins one commit (/commit/<sha> or /tree/<full sha>)."""
    location = parse_github_url(reference)
    if reference.strip().startswith("git@") or not location.tree:
        return False
    marker = _segments(urlsplit(reference.strip()).path)[2]
    return marker == "commit" or bool(COMMIT.fullmatch(location.tree[0].lower()))


def _segments(path: str) -> list[str]:
    return [unquote(item) for item in path.split("/") if item]


def _location(owner: str, name: str, tree: tuple[str, ...]) -> GitHubLocation:
    name = name.removesuffix(".git")
    if not OWNER.match(owner) or not NAME.match(name) or name in {".", ".."}:
        raise GitHubError("The GitHub owner or repository name is not valid. " + USAGE)
    if len(tree) > MAX_TREE_SEGMENTS or any(
        segment in {".", ".."} or len(segment) > 255 or "\\" in segment or not segment.isprintable()
        for segment in tree
    ):
        raise GitHubError("The branch or folder in this GitHub URL is not valid. " + USAGE)
    return GitHubLocation(owner, name, tree)


def latest_commit(reference: str, settings: Settings) -> str:
    """The commit a GitHub URL names right now, resolved without downloading it."""
    location = parse_github_url(reference)
    deadline = time.monotonic() + settings.github_timeout_seconds
    repository, default_branch = _repository(location, settings, deadline)
    return _commit_for(location, repository, default_branch, settings, deadline)[2]


@contextmanager
def download_repository(
    location: GitHubLocation, settings: Settings
) -> Iterator[tuple[Path, RepositorySource, list[str]]]:
    """Yield a temporary unpacked tree of one pinned commit, then delete it."""
    deadline = time.monotonic() + settings.github_timeout_seconds
    repository, default_branch = _repository(location, settings, deadline)
    requested, ref, commit, folder = _commit_for(
        location, repository, default_branch, settings, deadline
    )
    url = f"https://github.com/{repository}/tree/{commit}"
    if folder:
        url += "/" + "/".join(quote(segment) for segment in folder)
    source = RepositorySource(
        repository=repository,
        url=url,
        requested_ref=requested,
        ref=ref,
        commit_sha=commit,
        subdirectory="/".join(folder),
    )
    try:
        temporary = tempfile.TemporaryDirectory(
            prefix="reqtest-github-", ignore_cleanup_errors=True
        )
        root = Path(temporary.name, "source")
        root.mkdir()
    except OSError as error:
        raise GitHubError(f"No temporary space for the GitHub download: {error}.") from error
    with temporary:
        skipped = _download(repository, commit, folder, root, settings, deadline)
        yield root, source, skipped


def _repository(location: GitHubLocation, settings: Settings, deadline: float) -> tuple[str, str]:
    """Confirm the repository exists, and learn its canonical name and default branch."""
    try:
        with _get(f"/repos/{location.repository}", settings, deadline) as response:
            body = response.read(MAX_METADATA_BYTES + 1)
    except _StatusError as error:
        if error.status == 404:
            raise GitHubError(
                f"GitHub repository {location.repository} was not found. If it is private, "
                "set REQTEST_GITHUB_TOKEN on the server to a token that can read it."
            ) from None
        raise
    try:
        if len(body) > MAX_METADATA_BYTES:
            raise ValueError("metadata too large")
        metadata = json.loads(body)
        full_name, default_branch = metadata["full_name"], metadata["default_branch"]
        owner, _, name = full_name.partition("/")
        if not OWNER.match(owner) or not NAME.match(name) or not isinstance(default_branch, str):
            raise ValueError("unexpected metadata")
    except (ValueError, KeyError, TypeError, AttributeError) as error:
        raise GitHubError("GitHub returned unexpected repository metadata.") from error
    return full_name, default_branch


def _commit_for(
    location: GitHubLocation,
    repository: str,
    default_branch: str,
    settings: Settings,
    deadline: float,
) -> tuple[str | None, str, str, tuple[str, ...]]:
    """Resolve the URL's ref to one commit; what follows the ref is a folder."""
    if not location.tree:
        commit = _commit(repository, default_branch, settings, deadline)
        if commit is None:
            raise GitHubError(f"The default branch of {repository} has no commits.")
        return None, default_branch, commit, ()
    for length in range(1, min(len(location.tree), MAX_REF_SEGMENTS) + 1):
        ref = "/".join(location.tree[:length])
        commit = _commit(repository, ref, settings, deadline)
        if commit is not None:
            return ref, ref, commit, location.tree[length:]
    raise GitHubError(
        f"No branch, tag or commit in {repository} matches '{'/'.join(location.tree)}'."
    )


def _commit(repository: str, ref: str, settings: Settings, deadline: float) -> str | None:
    path = f"/repos/{repository}/commits/{quote(ref, safe='/')}"
    try:
        with _get(path, settings, deadline, accept="application/vnd.github.sha") as response:
            body = response.read(200)
    except _StatusError as error:
        if error.status in {404, 422}:
            return None
        if error.status == 409:
            raise GitHubError(f"GitHub repository {repository} is empty.") from None
        raise
    commit = body.decode("ascii", errors="replace").strip()
    if not COMMIT.match(commit):
        raise GitHubError("GitHub returned an unexpected commit identifier.")
    return commit


def _download(
    repository: str,
    commit: str,
    folder: tuple[str, ...],
    root: Path,
    settings: Settings,
    deadline: float,
) -> list[str]:
    with _get(f"/repos/{repository}/tarball/{commit}", settings, deadline) as response:
        stream = _Limited(response, settings.github_max_archive_bytes, deadline)
        try:
            with tarfile.open(fileobj=stream, mode="r|gz") as archive:
                return _unpack(archive, root, folder, repository, commit, settings)
        except (tarfile.TarError, zlib.error, EOFError, http.client.HTTPException) as error:
            raise GitHubError("The GitHub archive could not be read.") from error
        except TimeoutError as error:
            raise GitHubError(TIMED_OUT) from error
        except (OSError, ValueError) as error:
            raise GitHubError(
                f"The GitHub archive could not be downloaded and unpacked: {error}."
            ) from error


def _unpack(
    archive: tarfile.TarFile,
    root: Path,
    folder: tuple[str, ...],
    repository: str,
    commit: str,
    settings: Settings,
) -> list[str]:
    """Write ordinary files and directories under `folder`; refuse unsafe archives."""
    top: str | None = None
    found = not folder
    entries = written = scanned = 0
    skipped: list[str] = []
    for member in archive:
        path = PurePosixPath(member.name)
        if not path.parts or path.is_absolute() or ".." in path.parts:
            raise GitHubError("The GitHub archive contains an unsafe path; it was not used.")
        if top is None:
            top = path.parts[0]
        elif path.parts[0] != top:
            raise GitHubError("The GitHub archive has an unexpected layout; it was not used.")
        scanned += max(member.size, 0)
        if scanned > MAX_UNPACKED_BYTES:
            raise GitHubError("The GitHub archive expands beyond the unpacking limit.")

        relative = path.parts[1:]
        if relative[: len(folder)] != folder:
            continue
        relative = relative[len(folder) :]
        found = True
        if not relative:
            if not member.isdir():
                raise GitHubError(f"'{'/'.join(folder)}' is a file in {repository}, not a folder.")
            continue
        parents = relative if member.isdir() else relative[:-1]
        if any(name in SKIPPED_DIRECTORIES for name in parents):
            continue

        target = root.joinpath(*relative)
        if member.isdir():
            entries += 1
            target.mkdir(parents=True, exist_ok=True)
        elif member.isreg():
            entries += 1
            written += member.size
            if written > settings.max_snapshot_bytes:
                raise GitHubError(
                    "Repository snapshot byte limit exceeded; no partial copy is used."
                )
            target.parent.mkdir(parents=True, exist_ok=True)
            content = archive.extractfile(member)
            with target.open("xb") as output:
                shutil.copyfileobj(content, output)
            target.chmod(0o755 if member.mode & 0o111 else 0o644)
        else:
            kind = "symbolic link" if member.issym() else "link or special file"
            skipped.append(f"{'/'.join(relative)}: {kind} in the GitHub archive; not unpacked")
        if entries > settings.max_snapshot_files:
            raise GitHubError("Repository snapshot entry limit exceeded; no partial copy is used.")

    if top is None:
        raise GitHubError("The GitHub archive was empty.")
    if not found:
        raise GitHubError(
            f"No folder '{'/'.join(folder)}' exists in {repository} at commit {commit[:12]}."
        )
    return skipped


class _Limited(io.RawIOBase):
    """Pass the response through, failing once it exceeds its byte or time budget."""

    def __init__(self, stream, limit: int, deadline: float):
        self._stream = stream
        self._limit = limit
        self._deadline = deadline
        self._received = 0

    def readable(self) -> bool:
        return True

    def readinto(self, buffer) -> int:
        if time.monotonic() > self._deadline:
            raise GitHubError(TIMED_OUT)
        chunk = self._stream.read(min(len(buffer), 1 << 16))
        self._received += len(chunk)
        if self._received > self._limit:
            raise GitHubError(
                "The GitHub archive is larger than REQTEST_GITHUB_MAX_ARCHIVE_BYTES allows."
            )
        buffer[: len(chunk)] = chunk
        return len(chunk)


def _get(path: str, settings: Settings, deadline: float, accept="application/vnd.github+json"):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise GitHubError(TIMED_OUT)
    request = urllib.request.Request(
        API_URL + path,
        headers={
            "Accept": accept,
            "User-Agent": "ReqTest",
            "X-GitHub-Api-Version": API_VERSION,
        },
    )
    if settings.github_token is not None:
        # Unredirected: the token goes to the API only, never to a redirect target.
        request.add_unredirected_header(
            "Authorization", f"Bearer {settings.github_token.get_secret_value()}"
        )
    try:
        return _open(request, remaining)
    except urllib.error.HTTPError as error:
        status, headers = error.code, error.headers
        error.close()
        if status == 429 or (
            status == 403
            and (headers.get("x-ratelimit-remaining") == "0" or "retry-after" in headers)
        ):
            raise _StatusError(status, RATE_LIMITED) from None
        if status == 401:
            raise _StatusError(
                status,
                "GitHub rejected REQTEST_GITHUB_TOKEN. Check that it is valid and unexpired."
                if settings.github_token is not None
                else "GitHub requires authentication for this repository.",
            ) from None
        raise _StatusError(status, f"GitHub answered HTTP {status}.") from None
    except TimeoutError as error:
        raise GitHubError(TIMED_OUT) from error
    except urllib.error.URLError as error:
        raise GitHubError(f"GitHub could not be reached: {error.reason}.") from error
    except (OSError, http.client.HTTPException) as error:
        raise GitHubError(f"GitHub could not be reached: {error!r}.") from error


class _GitHubRedirects(urllib.request.HTTPRedirectHandler):
    """Follow redirects only within GitHub's own API and archive hosts, over HTTPS."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urlsplit(newurl)
        if target.scheme != "https" or (target.hostname or "") not in DOWNLOAD_HOSTS:
            fp.close()
            raise GitHubError("GitHub redirected to an unexpected host; it was not followed.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _open(request: urllib.request.Request, timeout: float):
    """The only network access in this module. Tests replace it."""
    return urllib.request.build_opener(_GitHubRedirects).open(request, timeout=timeout)
