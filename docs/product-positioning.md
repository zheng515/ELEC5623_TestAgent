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

The retained type-complete boundary follow-up provides one inspectable example of
the product contribution. B2 and B3 both preserve the same failing boundary test,
so the evidence does not support a defect-detection advantage. B3 additionally
records a requirement quotation, executed failure excerpt and source evidence
before classifying the result as a potential implementation defect. The user can
therefore trace why the failing assertion was retained instead of silently
rewriting it. This demonstrates a decision-trace difference, not superior test
generation or diagnostic accuracy. The website exposes the same chain as
requirement -> behavior -> admitted test -> execution outcome -> verification
state, while the raw report remains downloadable.

See [architecture and choices](architecture.md) and [evaluation protocol](evaluation-protocol.md).
No external competitor comparison, independent review or user-task result has
been manufactured. A credible next test is whether users choose the right action
from the retained requirement/assertion/trace evidence, rather than whether the
system generates more tests.

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

The retained four-run B2/B3 pilot uses two existing synthetic fixtures and one
repeat. Both configurations pass the correct shipping cases and expose the same
booking equality-boundary fault. B3 supplies a traceable diagnosis and retains the
original failing assertion. B2's unchanged-code proposal was incorrectly counted
as an improvement; the current policy filters it before extra review or execution.
The exact no-op correction has offline/Docker validation; subsequent model
proposals did not exercise that path.

This supports a concrete inspectable decision trace, not superior defect detection:
B3 found no extra defect in this pilot. No natural generated-test error exposed a
repair opportunity. Independent semantic accuracy, diagnosis F1, repeat stability
and user-task benefit remain unmeasured. The complete independent B0-B3 matrix
is configured but has not been run under the current policy. A separate v21
controlled study shows admission-driven import correction in both full arms and
retained fault detection after type witnesses are added. It does not expose the
intended initial runtime diagnosis cases, and neither full arm retains the
boundary artifact literally unchanged. These are distinct unsuccessful or
unavailable measures, not evidence to suppress.
A separately frozen, type-complete adaptive candidate then reaches runtime
diagnosis: both full arms retain the failing test unchanged, and B3 provides
grounded defect evidence. This supports a specific decision trace, not a B3
detection advantage or a population accuracy estimate.

The retained Click mutation-scope check is tool-only, incomplete and shows no
latency advantage. Retired studies were deleted in full and contribute no current
claims. See [the current evidence inventory](../experiments/README.md) and
[the protocol](evaluation-protocol.md).
