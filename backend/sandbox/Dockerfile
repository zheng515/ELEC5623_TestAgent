# Execution sandbox for model-generated tests (NFR5).
#
# Generated test code is untrusted model output. It runs only inside this image,
# never on the host, and `docker run` adds --network none, a read-only root
# filesystem, dropped capabilities, and memory/CPU/PID limits on top.
FROM python:3.11-slim

# Pin pytest and its dependencies. The runner also records the actual Python
# version and binds every attempt in one run to an immutable local image ID.
COPY requirements.lock /tmp/requirements.lock
RUN pip install --no-cache-dir -r /tmp/requirements.lock

RUN useradd --create-home --uid 10001 sandbox
USER sandbox
WORKDIR /work

ENTRYPOINT ["python", "-m", "pytest"]
