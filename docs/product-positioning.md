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
No external competitor comparison is available in the current evidence. Avoid claims that
ReqTest is the first agent, first closed loop, or stronger than general coding
agents. Its contribution is the implemented integration and explicit decision
policy, whose effectiveness still requires independent evaluation.

## Contribution under test

The contribution is an original-contract trace and a bounded policy for handling
generated failures. It is an integration and decision-policy contribution, not a
new test-generation algorithm. The current implementation keeps three claims
separate:

| Mechanism | Inspectable implementation | Evaluation question and current boundary |
| --- | --- | --- |
| Original contract trace | Exact document/file references, rule/behavior/test IDs and execution nodes | Can an independent reviewer justify each mapped assertion? Exact quotations establish provenance, not semantic correctness. |
| Diagnosis before replacement | Grounded failure categories, one reviewed improvement and retained prior artifacts | Are valid failures preserved and generated errors corrected? Scripted regression establishes control paths; model accuracy needs independent labels. |
| Conservative scoped states | Suite-bound coverage audits, stale-evidence rejection and explicit unassessed mutation scope | Does the system avoid unsupported Verified states? A minimal equality-boundary regression exercises stale-positive rejection; the guard is not general semantic proof. |

The current policy makes mutation checks optional and records an enforced model-request
budget across worker recovery. Both depths keep original-contract admission and
failure handling. Passing checks without requested mutation assessment remain
partially verified. No efficiency or quality advantage is established for this
policy. Old-version experiment results were removed at the user's request on
2026-10-28 and must not be cited as current evidence.

## Concrete differentiation case

The current v22 Booking and Inventory supplement demonstrates the decision trail.
All four configurations detect both declared boundary faults, so no extra B3
fault detection is established. B3 additionally records execution-phase
potential-implementation-defect diagnoses grounded in original requirements,
source, tests and failed execution. It preserves the failing assertions.
B2 also retains detection: its repeated unchanged proposals are stopped before
extra review or execution and do not count as improvements. This directly exposes
safe stopping behavior without manufacturing a B3 advantage.

See [current fault evidence](../experiments/results/v22-fault-cases/README.md).
The cases and references are developer/AI-assisted, not independent human labels.
Case-consistent diagnoses and exact citations establish inspectable observations,
not population diagnostic accuracy or external-product superiority.

## Inspectable implementation

| User question | Existing implementation | What counts as evidence |
| --- | --- | --- |
| Which requirement was tested? | Automatic numbered input grouping, original IDs and exact page/paragraph excerpts. | Original document, excerpt offsets, rule/behavior/test IDs and executed node. Supporting context is retained but not independently verified. |
| Why did a test fail? | Phase-specific diagnoses with requirement, source, test and traceback quotes. | Saved evidence links, not the diagnosis label alone. |
| Why was a failure retained? | Only diagnosed generated-test errors can replace approved tests. | Current failing node, potential-defect diagnosis, unchanged artifact and before/after history. The defect remains a hypothesis until investigated. |
| What happens after a proposal is rejected? | One bounded improvement can correct an explicitly rejected proposal with unique, valid original citations. A supported behavior without any proposal can receive a new reviewed check. | Original blocked proposal, replacement review and actual re-execution. Duplicate or ungrounded reviews do not authorize correction. |
| What did the feedback actually change? | Evaluation compares changed test files with their own initial and subsequent execution; exact before/after assertions remain inspectable. | Added checks and revisions awaiting execution are not recovered failures. A passing revision is an observation, not proof that its semantics improved. |
| Is a passing suite strong enough? | Selected mutation execution and original-contract survivor review. | Exact mutant differences and raw outcomes. Unreviewed relevance/equivalence judgments are not a gold mutation score. |

## Inspectable development scenarios

These are source fixtures and deterministic regression scenarios, not model-quality
results or independently reviewed accuracy labels:

| Situation | Reproducible source or regression | Intended decision |
| --- | --- | --- |
| An explicit equality example is missing from a passing suite | tests/requirement-coverage.test.ts constructs a minimal interior-only stale-positive fixture and exercises an additive boundary test in Docker. | Retain partial assurance until original-contract coverage and execution support a stronger state. |
| A test asserts unsupported message text or imports the wrong module | tests/agent-safety.test.ts uses scripted responses with real Docker execution. | Reject the unsupported assertion or correct the generated import under the same admission gates. |
| A valid assertion exposes a threshold defect | tests/python-agent.test.ts and tests/shared-initial-suite.test.ts retain the original implementation and failing assertion. | Investigate the implementation without weakening the assertion. |
| A worker stops during a model request | tests/run-queue.test.ts kills and restarts a real worker. | Reuse completed checkpoints and retain interrupted request consumption. |

These establish selected control-flow properties, not arbitrary model judgments,
semantic coverage, user benefit or an advantage over other products.

## Current evaluation status

The [frozen v22 benchmark](../experiments/results/v22-summary/README.md) completed
four smoke, 36 real-project and eight synthetic fault workflows. All 397 final
real-project generated nodes pass, and every configuration detects both declared
synthetic faults. Full arms use more recorded requests/tokens on the real-project
contracts, without a measured execution/reference-disagreement advantage.
The main matrix exposes no runtime diagnosis/repair opportunity. It cannot
attribute resource differences to diagnosis, which was not requested there.

Twelve matrix workflows retain limited mutation review. Three repeats per case
produce distinct literal suites; this does not establish semantic equivalence or
population reliability. There is no independent semantic accuracy, diagnosis F1,
reviewed mutation score, user study or external-product comparison. No admitted
generated runtime-error repair opportunity appears in these observations, so
repair effectiveness remains unavailable.

Old v20/v21 studies were removed in whole at the owner's request and excluded from
current results. [Cleanup](../experiments/cleanup-v22.json) records hashes and the
Git revision retaining exported historical evidence. The current contribution is
an implemented, inspectable contract/decision policy whose broader effectiveness
still requires independent evaluation. No academic report was authored.
