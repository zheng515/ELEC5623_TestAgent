"""Resolve local immutable image IDs and inspect dependencies inside that image."""

import hashlib
import json
import re

from app.schemas import ExecutionEnvironment, RuntimePackage

IMAGE_ID = re.compile(r"sha256:[0-9a-f]{64}\Z")
# This is server-authored code. It runs without project mounts or generated tests.
RUNTIME_PROBE = """import importlib.metadata, json, platform, sys
packages = sorted(
    [{"name": item.metadata["Name"], "version": item.version}
     for item in importlib.metadata.distributions()],
    key=lambda item: (item["name"].lower(), item["version"]),
)
print(json.dumps({"python_version": sys.version, "platform": platform.platform(),
                  "packages": packages}))
"""


class EnvironmentError(RuntimeError):
    """The execution image or its runtime could not be identified reliably."""


def parse_environment(requested_image: str, image_id: str, metadata: str, inventory: str):
    try:
        image = json.loads(metadata)
        runtime = json.loads(inventory)
        if not IMAGE_ID.fullmatch(image_id) or image["Id"] != image_id:
            raise ValueError("Image identity mismatch")
        packages = [RuntimePackage.model_validate(item) for item in runtime["packages"]]
        if not packages or any(
            not item.name.strip() or not item.version.strip() for item in packages
        ):
            raise ValueError("Empty package inventory")
        if not any(item.name.lower() == "pytest" for item in packages):
            raise ValueError("pytest is not installed")
        payload = {
            "requested_image": requested_image,
            "image_id": image_id,
            "repo_digests": sorted(image.get("RepoDigests") or []),
            "image_os": image["Os"],
            "image_architecture": image["Architecture"],
            "python_version": runtime["python_version"],
            "platform": runtime["platform"],
            "packages": [
                item.model_dump()
                for item in sorted(
                    packages,
                    key=lambda item: (item.name.lower(), item.version),
                )
            ],
        }
        # The tag is descriptive, not the identity. Equivalent tags must produce
        # the same environment fingerprint when they identify the same runtime.
        identity = {
            key: value
            for key, value in payload.items()
            if key not in {"requested_image", "repo_digests"}
        }
        fingerprint = hashlib.sha256(
            json.dumps(identity, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        environment = ExecutionEnvironment(**payload, fingerprint=fingerprint)
        if any(
            not value.strip()
            for value in (
                environment.image_os,
                environment.image_architecture,
                environment.python_version,
                environment.platform,
            )
        ):
            raise ValueError("Empty runtime metadata")
        return environment
    except (ValueError, KeyError, TypeError) as error:
        raise EnvironmentError(
            "Sandbox image identity or dependency inventory is invalid."
        ) from error
