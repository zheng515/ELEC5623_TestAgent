# ReqTest Shipping Demo

A minimal Python application for a real requirement-to-test demonstration.
The inputs and rules are synthetic; the repository download, model requests,
generated tests, and sandbox execution are real operations.

- Production code: `shipping.py`
- Requirement document: [`docs/SRS.md`](docs/SRS.md)
- Runtime: Python 3.11+, without third-party production dependencies
- Recorded live validation: [`docs/DEMO_RESULTS.md`](docs/DEMO_RESULTS.md)

## Use with ReqTest

1. Use this repository's GitHub URL as the repository reference.
2. Download `docs/SRS.md` and import it as the requirement file.
3. Use the goal: "Generate and execute independent nominal, boundary, and invalid-input tests for shipping.fee using only the SRS rules. Include the exact 10000-cent boundary."
4. Run the agent with a valid OpenAI API key and the pytest Docker sandbox.
5. Inspect source citations, the saved test plan, code validation, and recorded outcomes.

A plan or generated file is not an execution result. A passing sample does not
prove that the input domain is exhaustively covered.

## Run the function locally

```bash
python -c "from shipping import fee; print(fee(10000))"
```

Expected output: `0`.

## Controlled defect demonstration

The `demo/buggy-threshold` branch intentionally uses a strict `>` comparison
instead of `>=`. It charges 1000 cents for an order of exactly 10000 cents,
contradicting R2. The SRS stays identical between the two branches.

Compare the correct `main` branch with `demo/buggy-threshold` using the same SRS.
The defect branch is an intentionally faulty teaching fixture, not the correct
implementation. Requirement-based tests should detect the boundary error rather
than change their expected result to match it.
