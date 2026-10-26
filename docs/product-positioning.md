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
| What happens after a proposal is rejected? | One bounded improvement can target a supported behavior lacking an approved generated check. | Original blocked proposal, replacement review and actual re-execution. No review gate is bypassed. |
| Is a passing suite strong enough? | Selected mutation execution and original-contract survivor review. | Exact mutant differences and raw outcomes. Unreviewed relevance/equivalence judgments are not a gold mutation score. |

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
