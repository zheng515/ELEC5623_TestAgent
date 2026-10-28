# Scoped upstream API fixture

Source: https://github.com/un33k/python-slugify/tree/f85f9488520148d5f6899b5639199882b605e30a
Version: v8.0.4.

Scope: slugify.slugify. Copied module source retains its original implementation and docstrings. Standalone modules recipes.py, mathutils.py and filesize.py use root imports instead of their original package-qualified paths; no function bodies are extracted or rewritten for that adaptation. This fixture is not the complete upstream repository. See API_DOCUMENTATION.md for original documentation excerpts.
