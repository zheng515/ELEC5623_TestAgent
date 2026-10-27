# Strict CI acceptance

A fresh real-model run of `npm run verify -- examples/verification.json` completed
with exit code 0 and requireVerified=true. All four behavior states were Verified.
Eight approved generated checks and one existing check passed. Two surviving
message-only mutations each received four separate grounded negative decisions:
eight mutant/behavior pairs, with no inferred exclusions for other behaviors.

The implementation, assertions, requirement meanings and strict gate were not
weakened to obtain this result. Tests.zip and source.zip preserve the original
inputs and generated tests. report.json contains actual execution, mutation diffs
and pair reviews. This is one synthetic acceptance run, not semantic accuracy or
a promise that every fresh generation will pass. Older provider-overload experiment outputs were removed during the evidence reset.

Re-run the complete model-backed CI with the command above. To reuse the saved
suite without model calls, extract source.zip and tests.zip into an empty project
directory and run `python -m pytest tests reqtest_generated` with pytest installed.
