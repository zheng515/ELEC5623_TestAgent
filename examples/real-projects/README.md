# Pinned real-project inputs

This directory contains the reusable pinned inputs for the current studies.
The [v16 workflow](../real-projects-v16/README.md) now preserves fixture bytes and
executes the full imported Python suite; its model node selection is separate.
Use that page for current commands and the latest source revisions.

The project owner confirms the Track A Business Proposal was approved and
submitted. These are additional technical tests; no academic report is authored.

| Project | Fixed version / commit | Runtime Python files | Physical lines, including comments and blanks | Public API scope |
| --- | --- | ---: | ---: | --- |
| [Click](https://github.com/pallets/click) | 8.1.7 / `874ca2bc1c30d93a4ac6e36a15ed685eafe89097` | 16 | 10,124 | CLI defaults, invalid input, repeated options, flags, choices, integer bounds |
| [Packaging](https://github.com/pypa/packaging) | 24.2 / `d8e3b31b734926ebbcaff654279f6855a73e052f` | 16 | 5,653 | Versions, specifiers, requirement markers, normalized names |
| [Werkzeug](https://github.com/pallets/werkzeug) | 3.0.6 / `5eaefc3996aa5cc8c5237d8b82f1b89eed6ea624` | 52 | 20,672 | Multi-value dictionaries, HTTP headers and integer routing |

These are pinned older releases, not claims about the newest release. The entire
upstream archives are downloaded and all runtime `.py` files are retained without
patches. The existing importer excludes hidden paths and unsupported file types;
this is **not** a byte-for-byte import of every repository asset. Exclusions and
hashes are exported. JMESPath was inspected but not selected: its 1,668 runtime
lines provided a smaller scale challenge than the three selected projects.

Each project has six finite requirements derived from its pinned documentation
and public docstrings. [Source excerpts and links](requirement-sources.json)
record their origins. These requirements and executable witnesses were fixed
before model calls. They are developer/AI-assisted test inputs, not native
upstream SRS documents or independent human labels. Gold/review flags stay false.
The unmodified-project study injects no source defects and disables mutation checks.

## Current use

These pinned sources, requirements, licenses and fixed witnesses are shared by
[current v16 studies](../real-projects-v16/README.md). The initial one-repeat
pilot, schema-fix experiment, saved candidates and historical results were
removed. This directory supplies inputs, not retained pilot observations.

Use the current preparation and full-suite preflight commands. Current Python
execution retains supported binary fixtures and the exact full node catalog;
model context is bounded separately. Passing six API checks does not establish
complete repository or requirement coverage.
