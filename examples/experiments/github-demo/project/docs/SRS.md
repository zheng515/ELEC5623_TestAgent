# Software Requirements Specification: Shipping Fee Demo

Version: 1.0

## 1. Purpose and scope

This project calculates one shipping fee from one order amount. It is a small,
synthetic application for testing a requirement-to-test agent against actual source
code. It does not process payments or contact external services.

All monetary values are integer cents. The public interface is
`shipping.fee(amount_cents: int) -> int`. The requirements below define behavior;
source code must not be used to invent the expected result.

## 2. Functional requirements

R1: For an integer order amount from 0 through 9999 cents inclusive, shipping.fee must return the integer 1000.

R2: For an integer order amount of at least 10000 cents, shipping.fee must return the integer 0. Exactly 10000 cents qualifies for free shipping.

R3: For a negative integer order amount, shipping.fee must raise the built-in ValueError exception.

R4: For any input whose type is not the built-in int type, shipping.fee must raise the built-in TypeError exception. This includes bool, float, str, and None. A boolean must not be accepted as an integer order amount.

No exact exception message is required.

## 3. Acceptance examples

Each row is a separate function call, without accounts, environment setup, network
access, files, time dependencies, or fixtures. These are representative examples;
they do not exhaust the input domain.

| Requirement | Python input | Expected result |
| --- | --- | --- |
| R1 | 0 | Integer 1000 |
| R1 | 9999 | Integer 1000 |
| R2 | 10000 | Integer 0 |
| R2 | 10001 | Integer 0 |
| R3 | -1 | Raise ValueError |
| R4 | True | Raise TypeError |
| R4 | False | Raise TypeError |
| R4 | 1.5 | Raise TypeError |
| R4 | "10000" | Raise TypeError |
| R4 | None | Raise TypeError |

## 4. Execution environment

Python 3.11 or newer. The production code uses no third-party packages. pytest is
a test runner, not a production dependency. Browser behavior, APIs, persistence,
payments, and performance benchmarks are outside this specification.
