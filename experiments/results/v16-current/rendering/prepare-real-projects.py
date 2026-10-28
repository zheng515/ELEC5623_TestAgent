"""Fetch complete, pinned upstream repositories. Never execute their code on the host."""
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import urllib.request
import zipfile

BASE = Path('.evidence/opensource-candidates')
SPECS = [
    ('click', 'pallets/click', '8.1.7', '874ca2bc1c30d93a4ac6e36a15ed685eafe89097', '459d5c6f369274c2e119a5bee01f35225bf518ec0a9076c6f009e2808694a79a', 'src/click', ['LICENSE.rst']),
    ('packaging', 'pypa/packaging', '24.2', 'd8e3b31b734926ebbcaff654279f6855a73e052f', 'fb0994c19b71cf31bbe2d2a729878143eb2b4f3360d4ca0884c72fe494e783a4', 'src/packaging', ['LICENSE', 'LICENSE.APACHE', 'LICENSE.BSD']),
    ('werkzeug', 'pallets/werkzeug', '3.0.6', '5eaefc3996aa5cc8c5237d8b82f1b89eed6ea624', '2a1f4540c7434f2e5c82086f10cc0e7ec666e6833ee587c12c3a1d25c8562369', 'src/werkzeug', ['LICENSE.txt']),
]


def main():
    for name, repo, version, commit, digest, runtime, licenses in SPECS:
        dest = BASE / name
        dest.mkdir(parents=True, exist_ok=True)
        archive = dest / 'upstream.zip'
        if not archive.exists():
            archive.write_bytes(urllib.request.urlopen(f'https://codeload.github.com/{repo}/zip/{commit}', timeout=90).read())
        raw = archive.read_bytes()
        if hashlib.sha256(raw).hexdigest() != digest:
            raise ValueError(f'{name}: archive checksum differs from frozen input')
        files = []
        with zipfile.ZipFile(io.BytesIO(raw)) as zipped:
            for info in zipped.infolist():
                if info.is_dir():
                    continue
                parts = PurePosixPath(info.filename).parts[1:]
                if not parts or '..' in parts or PurePosixPath(*parts).is_absolute():
                    raise ValueError('Invalid upstream archive path')
                path = Path(*parts)
                data = zipped.read(info)
                target = dest / 'source' / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                files.append({'path': path.as_posix(), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        sources = [f for f in files if f['path'].startswith(runtime + '/') and f['path'].endswith('.py')]
        inventory = dict(id=name, repository=repo, version=version, commit=commit,
                         archiveSha256=digest, archiveBytes=len(raw), files=len(files),
                         runtimeFiles=len(sources), runtimeLines=sum(len((dest / 'source' / f['path']).read_text().splitlines()) for f in sources),
                         runtimeBytes=sum(f['bytes'] for f in sources), runtimeDirectory=runtime,
                         scope='Complete upstream archive; evaluation importer applies its documented file-type and hidden-path filters. No source patches.',
                         fileInventory=files)
        (dest / 'inventory.json').write_text(json.dumps(inventory, indent=2) + '\n')
        licensed = Path('examples/real-projects/licenses') / name
        licensed.mkdir(parents=True, exist_ok=True)
        for license_file in licenses:
            (licensed / (license_file + '.txt')).write_bytes((dest / 'source' / license_file).read_bytes())
        print(f'{name} {version}: {len(sources)} runtime files, {inventory["runtimeLines"]} physical lines; {commit}')


if __name__ == '__main__':
    main()
