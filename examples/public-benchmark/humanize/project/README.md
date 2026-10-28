# Scoped upstream API fixture

Source: https://github.com/python-humanize/humanize/tree/073a00b4cae648cb79e494eefb0389f5b038ffce
Version: 4.11.0.

Scope: filesize.naturalsize. Copied module source retains its original implementation and docstrings. Standalone modules recipes.py, mathutils.py and filesize.py use root imports instead of their original package-qualified paths; no function bodies are extracted or rewritten for that adaptation. This fixture is not the complete upstream repository. See API_DOCUMENTATION.md for original documentation excerpts.
