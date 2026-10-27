# Recorded Demo Results

This is a recorded real requirement-to-test run, not a simulated execution.

- Requirement source: `docs/SRS.md` (the same file on both branches).
- Test-planning model: `gpt-6-luna` through OpenAI Responses API with structured outputs.
- Correct code commit: `88d59a92369e3b450cee2b83dcd765ebfcaf0b82`.
- Intentional defect commit: `2e10601069537fcbb50d5c7a309f8f00c370f37e`.
- Extracted requirements: 4.
- Planned scenarios: 10.
- Generated pytest artifacts: 10; all passed the code-to-plan validation.
- Correct code: 10 executed tests passed.
- Defect replay: 9 tests passed, 1 failed, 0 errored.

## Controlled comparison

The exact same generated tests were replayed against the defect commit. Expected
results were not rewritten, and no second model generation was used for the replay.
Tests ran in the isolated pytest Docker sandbox without network access.

| Test | Correct implementation | Intentional defect |
| --- | --- | --- |
| `test_standard_fee_for_5000_cents` | passed | passed |
| `test_none_amount_raises_type_error` | passed | passed |
| `test_standard_fee_at_zero_cents` | passed | passed |
| `test_standard_fee_at_9999_cents` | passed | passed |
| `test_free_shipping_at_exactly_10000_cents` | passed | failed |
| `test_free_shipping_above_threshold` | passed | passed |
| `test_negative_integer_amount_raises_value_error` | passed | passed |
| `test_boolean_amount_raises_type_error` | passed | passed |
| `test_float_amount_raises_type_error` | passed | passed |
| `test_string_amount_raises_type_error` | passed | passed |

The boundary failure was:

```text
AssertionError: fee for exactly 10000 cents must be 0
assert 1000 == 0
```

## What this demonstrates

The repository can be downloaded from GitHub, requirements can be extracted from
a real Markdown file, supported checks can be generated, and those tests can run
against the downloaded code. A stated requirement can detect a concrete boundary
defect instead of adopting the faulty implementation as its expected result.

## Limits

This is a small synthetic project, not a broad model benchmark. The generated cases
are not exhaustive. Source links and code-to-plan validation do not prove complete
or semantically correct requirement extraction. Passing tests establish only the
recorded sampled behavior. Future model runs may choose different scenarios.

The sandbox executed Python functions only; no browser, database, payment system,
or external API was tested. The defect is deliberately inserted and labelled.
