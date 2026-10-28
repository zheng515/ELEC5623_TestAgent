# Scoped upstream API fixture

Source: https://github.com/mahmoud/boltons/tree/992a58c1036fcf4d52cbf3313b6217b7c07b11d9
Version: 24.0.0.

Scope: mathutils.ceil and mathutils.floor. Copied module source retains its original implementation and docstrings. Standalone modules recipes.py, mathutils.py and filesize.py use root imports instead of their original package-qualified paths; no function bodies are extracted or rewritten for that adaptation. This fixture is not the complete upstream repository. See API_DOCUMENTATION.md for original documentation excerpts.
