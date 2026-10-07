# Requirement analysis and oracle review evaluation

The evaluation harness exercises the production `analyze_requirements` and
`review_oracles` functions against a versioned starter corpus. It does not generate
or execute tests, alter projects, or write to the application database.

The corpus contains **9 analysis cases and 15 oracle cases**. Categories include
clear rules, omitted rules, missing thresholds/units, exact boundaries, exception
types, conflicting requirements, unspecified return representations, unresolved
setup, and prompt injection. These are starter regression labels, not an independently
validated benchmark. Review and expand them before drawing general quality conclusions.

## Commands

Run commands from the repository root after `bash scripts/setup.sh`.

```bash
# Validate the corpus and list selected cases. This never creates a model client.
bash scripts/evaluate.sh

# Run a small mixed sample against the configured provider.
bash scripts/evaluate.sh --mode live \
  --case analysis_omitted_rule \
  --case analysis_missing_unit \
  --case oracle_threshold \
  --case oracle_wrong_fee \
  --case oracle_missing_exception \
  --output data/evaluations/live-smoke.json

# Evaluate all 24 cases, with three independent calls per case.
bash scripts/evaluate.sh --mode live --repeat 3 \
  --output data/evaluations/live-repeated.json

# Re-score stored responses without calling a model.
bash scripts/evaluate.sh --mode replay \
  --responses data/evaluations/live-repeated.json --repeat 3 \
  --output data/evaluations/replayed.json
```

`--mode live` calls the configured OpenAI model and may incur API charges. It reads
`backend/.env` and the same OPENAI_API_KEY configuration as the application. Set model
access and credentials before running it; unresolved credentials produce exit code 2
without a quality report. Each selected case requires one structured model request per
repeat; `--repeat` accepts 1–5. `--stage analysis` or `--stage oracle` restricts the stage,
and `--limit N` limits unique cases before repeating. All analysis cases precede oracle
cases, so `--limit` alone may select only analysis. No golden verdicts, rule labels, or
case IDs are included in model requests. Oracle evaluation intentionally supplies fixed
requirements and contracts to isolate review quality; it does not score planning.

Relative output and replay paths are resolved from `backend/`. JSON and Markdown reports
are written under Git-ignored `backend/data/evaluations/` by default. Set a distinct
`--output` for each experiment; the default is `latest.json`. Each completed sample
updates an atomic JSON checkpoint. Interrupted reports retain `complete=false` and
the planned sample count. The final report has `complete=true`, including any recorded
model errors. Corpus, input replay, and output paths must be different.

Exit codes are **0** for a valid dry run or an evaluation with no failed samples,
**1** for observed scoring failures or model/protocol errors, and **2** for invalid
configuration or report/corpus input. Repeated calls are not deterministic seeds.

## Interpreting scores

Analysis is scored against exact source-aligned gold rules. A returned quote must
contain one complete gold rule to receive credit. A quote spanning several gold rules
is recorded as merged and receives no individual rule credit. Duplicate extractions,
unexpected requirements, missing rules, incorrect testability, and missed ambiguity
are reported separately. Wording paraphrases are not judged for semantic correctness.

- **Rule recall:** recovered rules / gold rules in successfully evaluated samples.
- **Source-aligned classification accuracy:** rules with one extraction and the correct
  testable/ambiguous flags / gold rules in successfully evaluated samples.
- **Source-aligned precision:** uniquely recovered gold rules / returned requirements.
- **Decision coverage:** successfully evaluated samples / selected samples. Check this
  alongside every quality score; API failures are not counted as semantic judgments.

Oracle labels use this policy: `supported` requires sufficient stated rules for the
exact contract; `contradicted` means a clear rule conflicts with the contract;
`insufficient` means a missing detail, conflicting source rules, or unresolved setup
prevents a justified expectation. For example, "raise an exception" does not authorize
a specific `ValueError` oracle. A conflict between source rules is labeled insufficient
rather than choosing whichever rule matches the proposal.

- **Verdict accuracy:** exact agreement on supported/contradicted/insufficient among
  samples with an independent decision. The confusion matrix also lists missing decisions.
- **False acceptance:** an unsupported gold oracle receives server-computed
  `oracle_grounding.status=supported`. This detects unsafe approval even if its quotation
  is genuine. The rate excludes API/protocol errors from the denominator.
- **False rejection:** a supported gold oracle is blocked despite a completed decision.
  Supported-case model errors are counted separately; they are not successful rejections.
- **Unknown scores:** empty or unavailable denominators produce `null`, not 0% or 100%.

Reports record mode, response origin, configured model, corpus SHA-256, request hashes
(system prompt, request body, and output schema), raw structured responses, server-stage
outputs, durations, individual failures, and limitations. They contain no settings dump,
credential, or session token. Token usage and monetary cost are not measured.

Replay requires the same corpus and request fingerprints. Changed prompts, contracts,
schemas, missing samples, and duplicate replay records cannot silently earn a passing
score. A replay score evaluates saved responses under the current server gates; it is
not a new model measurement. Store the original live report separately.

## Offline demonstration

```bash
bash scripts/evaluate.sh --mode replay \
  --case analysis_omitted_rule --case oracle_wrong_fee \
  --responses evaluation/fixtures/demo-responses.json \
  --output data/evaluations/demo-replay.json
```

The supplied fixture contains two **deliberate synthetic errors**: an omitted rule and
a wrong support verdict with a genuine source quotation. This command is expected to
exit with code **1**, report rule recall **0.5**, and count **one false acceptance**.
Both `mode=replay` and `response_origin=synthetic` remain visible. These numbers test
the scorer; they are not the accuracy of the configured model. Normal pytest checks
also verify error accounting, label separation, replay integrity, and incomplete reports
without making network calls. The synthetic fixture is bound to the current corpus and
production prompts; update its request records explicitly when those change.

Before relying on this agent, collect live results across repeated runs and more
representative projects, review disputed starter labels, and prioritize unsafe approvals
and omitted requirements. Full plan/generation evaluation, model usage/cost capture,
mutation adequacy, and browser presentation of evaluation reports remain future work.
