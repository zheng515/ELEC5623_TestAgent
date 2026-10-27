# Document-derived scoped requirements

Upstream: https://github.com/cpburnz/python-pathspec/tree/6485791e1b5cf2ef4e756ae392fa80f2c5045d4c
Scope: pathspec.PathSpec.from_lines('gitwildmatch', ...) and match_file/match_files. This is a scoped module fixture, not the full upstream application.

R1: pathspec.PathSpec.from_lines('gitwildmatch', lines) compiles gitignore-style patterns supplied as an iterable of strings.

R2: A '*.py' pattern matches a Python filename such as 'app.py' or 'src/app.py', but does not match 'notes.txt'.

R3: A pattern prefixed with '!' negates the match; with patterns ['*.py', '!keep.py'], match_file('keep.py') is False and match_file('other.py') is True.

R4: A directory pattern ending with '/' matches descendants; with ['build/'], match_file('build/output.txt') is True and match_file('src/output.txt') is False.

R5: PathSpec.match_files yields matching input file paths; matching ['app.py','notes.txt','src/app.py'] against ['*.py'] selects the two Python paths.
