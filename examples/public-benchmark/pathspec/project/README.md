# Scoped upstream API fixture

Source: https://github.com/cpburnz/python-pathspec/tree/6485791e1b5cf2ef4e756ae392fa80f2c5045d4c
Version: v0.12.1.

Scope: pathspec.PathSpec.from_lines('gitwildmatch', ...) and match_file/match_files. Copied module source retains its original implementation and docstrings. Standalone modules recipes.py, mathutils.py and filesize.py use root imports instead of their original package-qualified paths; no function bodies are extracted or rewritten for that adaptation. This fixture is not the complete upstream repository. See API_DOCUMENTATION.md for original documentation excerpts.
