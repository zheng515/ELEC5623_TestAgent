FROM node:22-bookworm-slim AS node
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-eng libreoffice-writer fonts-liberation && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir pytest==8.4.2 mutmut[patch]==2.5.1 pypdf==6.21.1 python-docx==1.2.0 packaging==25.0 pillow==11.3.0
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /opt/npm
RUN node /opt/npm/bin/npm-cli.js install --prefix /tool/node tsx@4.23.0 typescript@5.9.3 @stryker-mutator/core@10.0.0 diff@8.0.2 semver@7.7.2 && mkdir -p /opt/reqtest-deps /opt/reqtest-node && chmod 777 /opt/reqtest-deps /opt/reqtest-node
COPY node-worker.cjs node-reporter.mjs prepare.py /tool/
COPY worker.py /tool/worker.py
COPY documents.py /tool/documents.py
ENV PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 PYTHONHASHSEED=0
WORKDIR /work
USER 65534:65534
ENTRYPOINT ["python", "/tool/worker.py"]
