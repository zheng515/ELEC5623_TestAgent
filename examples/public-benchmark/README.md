# Reusable public-module fixtures

Old study results, manifests, preflights and image setup were removed. These
pinned source subsets, requirements, fixed witnesses and license files remain
for regression tests. They are not current model observations.

## Source and scope

Five actual open-source libraries supply the implementation and documentation.
Versions are selected for Python 3.11 compatibility and recorded by full commit
SHA in each case's provenance.json. Only the listed modules and APIs are included;
this does not evaluate the complete upstream applications or their full test suites.

| Project | Version | Selected API | Condition |
| --- | --- | --- | --- |
| more-itertools | 10.5.0 | grouper, roundrobin | No injected mutation |
| boltons | 24.0.0 | ceil, floor | Injected exclusive option boundary in ceil |
| python-slugify | 8.0.4 | slugify | Injected reversal of the lowercase condition |
| humanize | 4.11.0 | naturalsize | Injected decimal base for binary/GNU units |
| pathspec | 0.12.1 | from_lines, match_file, match_files | No injected mutation |

These are controlled mutations, not claimed upstream bugs or historical fixes.
Original source modules are copied intact except for the three declared patches.
The recipes, mathutils and filesize modules are imported directly from the fixture
root instead of their original package paths. Their function bodies are unchanged
by that import adaptation. Package source and licenses are retained. Each provenance
record maps copied files to the original bytes and identifies the reversible patch.

SRS.md is author-derived from fixed upstream docstrings and README excerpts. It
is not a native upstream SRS or an independently reviewed reference. Original
excerpts and source URLs are in project/API_DOCUMENTATION.md. Requirements and
witnesses cover selected finite examples, not every documented API behavior.
Reference labels, witnesses, patch metadata and provenance are outside the
model-visible project directory. Implementation docstrings remain visible.

For active complete-runtime experiments, use the
[v16 workflow](../real-projects-v16/README.md) and
[current evidence inventory](../../experiments/README.md).
