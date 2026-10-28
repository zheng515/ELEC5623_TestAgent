# Full SRS acceptance

One real-model B3 acceptance run after automatic numbered-input grouping.
This is a synthetic development check, not a held-out benchmark or accuracy score.

- Four numbered requirements and supporting context were sent without block selection.
- Seven generated checks were approved: six passed; one detected the seeded `>`
  instead of `>=` threshold. Four model requests were made.
- The failing test was retained after a potential-implementation-defect diagnosis.
- Extracting tests.zip against the same source and re-running it in a separate
  read-only Docker execution reproduced six passes and one failure with integrity.
- This run was not inserted into the website's account history.

For a local reproduction, copy shipping.py into an empty directory, extract
`reqtest_generated/` from tests.zip there, install pytest and run:

```sh
python -m pytest reqtest_generated
```

The threshold failure is expected. Do not change the test to make it pass.
The original input, Agent judgments and execution evidence are in report.json.
Reference the source version and current agent implementation when repeating a
model run; provider outputs are not guaranteed to be identical.
