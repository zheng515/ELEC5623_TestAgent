# Public-module regression fixtures

Two pinned source fixtures remain because active regression tests use them:

| Fixture | Test use | Source and limits |
| --- | --- | --- |
| boltons 24.0.0, mathutils | Explicit equality-boundary coverage and retained implementation failure | A declared exclusive-boundary fault is injected into `ceil`; it is not an upstream bug claim. |
| pathspec 0.12.1 | Transitive Python package retrieval | Selected package modules, not a complete upstream application evaluation. |

Each directory retains source licenses, original documentation, provenance and
its declared patch where applicable. Requirements and reference labels are
AI-assisted and unreviewed. These fixtures are not current model observations or
a five-project benchmark. Three unreferenced historical fixture projects and
their unused experiment inputs were removed.

Use [pinned complete-project inputs](../real-projects/README.md) for the active
matrix and [the evidence inventory](../../experiments/README.md) for results.
