# Execution sandbox for model-generated tests (NFR5).
#
# Generated test code is untrusted model output. It runs only inside this image,
# never on the host, and `docker run` adds --network none, a read-only root
# filesystem, dropped capabilities, and memory/CPU/PID limits on top.
FROM python:3.11-slim

# Pinned so an execution result is reproducible (NFR6).
RUN pip install --no-cache-dir pytest==9.1.1

RUN useradd --create-home --uid 10001 sandbox
USER sandbox
WORKDIR /work

ENTRYPOINT ["python", "-m", "pytest"]
