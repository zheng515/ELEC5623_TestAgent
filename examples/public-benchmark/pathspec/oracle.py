from pathspec import PathSpec

def test_contract():
    spec = PathSpec.from_lines('gitwildmatch', ['*.py'])
    assert spec.match_file('app.py') is True
    assert spec.match_file('src/app.py') is True
    assert spec.match_file('notes.txt') is False
    assert list(spec.match_files(['app.py','notes.txt','src/app.py'])) == ['app.py','src/app.py']
    excluded = PathSpec.from_lines('gitwildmatch', ['*.py','!keep.py'])
    assert excluded.match_file('keep.py') is False
    assert excluded.match_file('other.py') is True
    directories = PathSpec.from_lines('gitwildmatch', ['build/'])
    assert directories.match_file('build/output.txt') is True
    assert directories.match_file('src/output.txt') is False
