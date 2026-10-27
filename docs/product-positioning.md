# Product positioning and evidence

ReqTest helps developers and QA engineers check whether recorded tests support
specified behavior and decide what to investigate next. Its engineering focus is
an inspectable requirement-to-behavior-to-test-to-execution trail and a bounded
policy for deciding whether a generated failure is eligible for repair.

## Related approaches and overlap

| Primary source | Documented focus | Shared techniques | ReqTest's specific emphasis and limits |
| --- | --- | --- | --- |
| [TestGen-LLM, Alshahwan et al., 2024](https://arxiv.org/abs/2402.09171) | Improve existing tests with filters for building, reliable execution and increased coverage. | LLM generation and executable admission checks. | Original requirement contracts, behavior states and diagnosis before replacing generated tests. This is a different engineering emphasis, not proof of a unique algorithm or better results. |
| [CoverUp, official project](https://github.com/plasma-umass/coverup) and [FSE 2025 paper](https://doi.org/10.1145/3729398) | Iteratively generate Python regression tests using code context and line/branch coverage feedback. | Context retrieval, pytest execution and feedback-guided generation. | Expose ambiguous contracts, retained failing assertions and requirement-specific gaps. Code coverage and requirement verification are different measurements; neither replaces the other. |
| [Meta ACH, official engineering description, 2025](https://engineering.fb.com/2025/02/05/security/revolutionizing-software-testing-llm-powered-bug-catchers-meta-ach/) | Generate concern-specific mutants and tests that detect them. | Fault-oriented feedback and plain-text testing concerns. | Combine document provenance, cross-artifact analysis and bounded failure diagnosis in a small verification workflow. Mutation-guided generation is prior work, not a novelty claim. ReqTest uses existing mutation tools and lacks ACH's industrial evidence. |

These sources do not establish that competing tools lack a particular feature.
No external competitor was run in the retained experiments. Avoid claims that
ReqTest is the first agent, first closed loop, or stronger than general coding
agents. Its contribution is the implemented integration and explicit decision
policy, whose effectiveness still requires independent evaluation.

## Inspectable implementation

| User question | Existing implementation | What counts as evidence |
| --- | --- | --- |
| Which requirement was tested? | Automatic numbered input grouping, original IDs and exact page/paragraph excerpts. | Original document, excerpt offsets, rule/behavior/test IDs and executed node. Supporting context is retained but not independently verified. |
| Why did a test fail? | Phase-specific diagnoses with requirement, source, test and traceback quotes. | Saved evidence links, not the diagnosis label alone. |
| Why was a failure retained? | Only diagnosed generated-test errors can replace approved tests. | Current failing node, potential-defect diagnosis, unchanged artifact and before/after history. The defect remains a hypothesis until investigated. |
| What happens after a proposal is rejected? | One bounded improvement can correct an explicitly rejected proposal with unique, valid original citations. A supported behavior without any proposal can receive a new reviewed check. | Original blocked proposal, replacement review and actual re-execution. Duplicate or ungrounded reviews do not authorize correction. |
| Is a passing suite strong enough? | Selected mutation execution and original-contract survivor review. | Exact mutant differences and raw outcomes. Unreviewed relevance/equivalence judgments are not a gold mutation score. |

## Concrete user workflows

These examples illustrate the implemented contribution. They are development
evidence, not a benchmark against another product or independent accuracy labels.
No model run is needed to inspect the saved records.

| Situation | What the user can inspect | Useful next action |
| --- | --- | --- |
| A passing suite misses a stated boundary | The shipping SRS explicitly includes 10000 cents in free shipping. The implementation uses `> 10000`; a generated boundary assertion fails. The retained run has six passes and one failure, and its exported tests reproduce those outcomes. | Follow R2 to its behavior, assertion and failure. Investigate the implementation while keeping the requirement-grounded failing check. |
| The Agent proposes a test that is not admitted | Each round records its candidate code, admission reasons and model review responses. A rejected retry leaves the earlier approved suite intact. Applied does not imply that execution passed. | Open Agent decisions, inspect the exact rejection, then clarify or regenerate. A zero-test run is not a verification success. |
| A surviving mutation changes an unspecified detail | The saved strict-CI acceptance has two message-only survivors, each reviewed separately against all four mapped behaviors. The eight decisions support their individual exclusions; one decision cannot clear the entire file. | Inspect the exact diff and each cited requirement. Investigate a missing/relevant pair instead of interpreting every survivor as a business defect. |
| A fresh generation produces different tests | Saved-test execution checks the same source fingerprint, image and saved suite without a model call. A separate regenerate action requests fresh analysis. | Repeat saved tests when investigating execution behavior; regenerate when revising requirements or analysis. Unresolved adequacy is not upgraded merely because the same tests pass again. |

Inspect the actual [shipping SRS and defect](../experiments/acceptance/2026-10-26/srs/README.md)
and [strict-CI mutation acceptance](../experiments/acceptance/2026-10-26/strict-ci/README.md).
Both are historical synthetic model runs; they predate the current decision-history
UI and must not be described as fresh acceptance of the current build.
Current deterministic regressions in `tests/python-agent.test.ts` exercise admitted,
rejected, failed and out-of-scope proposals; `tests/run-queue.test.ts` checks saved
execution and interrupted-worker recovery. These establish control-flow properties,
not the correctness of arbitrary model judgments.

The [integrated acceptance from 2026-10-27](../experiments/acceptance/2026-10-27/README.md)
adds fresh model runs with decision history and stopping reasons: the correct copy
passed strict CI, while the known boundary defect was detected and its assertion
retained. Separate exported-suite executions reproduced both outcomes. This is one
synthetic project in two conditions, not a comparative benchmark or accuracy score.

The overlap with the related approaches above is generation, executable feedback
and mutation analysis. The specific contribution demonstrated here is keeping an
inspectable requirement contract across admission, execution, diagnosis and bounded
improvement so the user can choose what to investigate. It is not a claim of a new
test-generation algorithm, higher fault detection or a feature absent elsewhere.

## Reproduce the comparison without model calls

The checked-in pilot uses three development cases, four configurations and three
repetitions. Re-score its frozen evidence with:

```sh
npm run experiment:analyze -- experiments/results/2026-10-26/evidence/index.json /tmp/reqtest-comparison
```

Inspect `workflow-evidence.json` for linked behavior evidence, diagnosis counts,
retained potential-defect failures, accepted changes and per-variant trade-offs.
Counts describe recorded workflow actions; they are not correctness labels.
The file points to each saved report so a reader can inspect the actual decisions.

B0 is a local direct-generation baseline, not an implementation of a named
commercial product or paper. B0, B1 and B3 each detected 6/6 seeded-fault runs;
B2 detected 5/6. B3's median run took 33.880 seconds versus B0's 9.108 seconds.
These results do not show superior fault detection by B3. Its extra diagnostics
and traceability must be judged alongside their additional latency and token use.
All cases were used in development and predate the latest input/repair changes;
a new frozen run is needed to evaluate those changes. Independent semantic
accuracy, diagnosis F1 and reviewed mutation scores remain unavailable.
