# Code maintenance

The v22 Agent implementation is frozen at `bd12d23`; its benchmark inputs and
results are unchanged by maintenance configuration. See the
[evidence summary](../experiments/results/v22-summary/README.md).

## Unused-code checks

Run the pinned analysis tool without changing application dependencies:

```sh
npm exec --yes --package=knip@6.44.1 -- knip
```

`knip.json` declares five real dynamic entry points rather than suppressing
unused-file findings:

- Docker copies `sandbox/node-worker.cjs` and `sandbox/node-reporter.mjs` into
  the image; the Python worker starts Node and Node selects its reporter by path.
- `scripts/check-mutation-runtime.ts` is a standalone tool-only archive replay CLI.
- `scripts/preflight-real-projects.ts` is the documented no-model input preflight.
- `tests/fixtures/queue-worker.ts` is forked by the durable queue integration test.

Next.js and package-script entries are still discovered by the tool's plugins.
Do not delete a file based only on static import reachability. The cleanup audit
found no other unused files, exports or dependencies; no Agent refactor or new
policy version was needed.

The optional `--include-entry-exports` audit also flags the Node reporter's default
export. Node loads this public reporter hook through `--test-reporter`, so it is
required even though there is no ordinary JavaScript import of that export.

Temporary archive reanalysis directories under ignored `tmp/` can be removed
after the retained evidence archives and checksums have been verified. Preserve
current original `.evidence/evaluation` runs, pinned inputs, application data,
credentials, backups and the retained study folders. Local caches are not source
deliverables and are excluded from Git.

The 2026-11-02 cleanup verified all three current study archives before removing
their redundant temporary archive-reanalysis directories: 486 generated files,
487,471,919 bytes. Original raw runs and retained study artifacts were preserved.
Knip, TypeScript, ESLint, English-only and whitespace checks passed. Agent source,
runtime components and application dependency files remain identical to the
benchmark freeze; no model observations were rerun or relabeled.
