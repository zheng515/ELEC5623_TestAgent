# Scoped upstream API fixture

Source: https://github.com/more-itertools/more-itertools/tree/4998a257373f36e91edef7324572ed8df10f39d1
Version: v10.5.0.

Scope: recipes.grouper and recipes.roundrobin. Copied module source retains its original implementation and docstrings. Standalone modules recipes.py, mathutils.py and filesize.py use root imports instead of their original package-qualified paths; no function bodies are extracted or rewritten for that adaptation. This fixture is not the complete upstream repository. See API_DOCUMENTATION.md for original documentation excerpts.
