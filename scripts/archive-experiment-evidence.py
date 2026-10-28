"""Package byte-identical evidence with checksums; optionally remove only its exported copy."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('study')
parser.add_argument('--remove-exported-copy', action='store_true')
args = parser.parse_args()
study = Path(args.study).resolve()
evidence = study / 'evidence'
allowed = Path('experiments/results').resolve()
if not study.is_relative_to(allowed) or not evidence.is_dir() or evidence.is_symlink():
    raise SystemExit('Use an exported study inside experiments/results, with a real evidence directory')
files = sorted(path for path in evidence.rglob('*') if path.is_file())
if any(path.is_symlink() for path in evidence.rglob('*')):
    raise SystemExit('Refusing symbolic links')
hashes = {path.relative_to(evidence).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
target = study / 'evidence.zip'
if target.exists():
    raise SystemExit('Refusing to replace an existing archive')
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in files:
        info = zipfile.ZipInfo(path.relative_to(evidence).as_posix())
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, path.read_bytes())
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    assert all(hashlib.sha256(archive.read(name)).hexdigest() == digest for name, digest in hashes.items())
(study / 'evidence-files.sha256.json').write_text(json.dumps({'scope': 'Original uncompressed bytes and logical paths inside evidence.zip. Unzip to an evidence directory to use the frozen index.', 'files': hashes}, indent=2) + '\n')
if args.remove_exported_copy:
    shutil.rmtree(evidence)
print(f'{len(files)} exact files archived and verified: {target.name}; {target.stat().st_size:,} bytes. Original .evidence run directories are untouched.')
