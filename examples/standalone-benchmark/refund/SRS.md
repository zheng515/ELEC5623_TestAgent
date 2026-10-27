# Refund SRS

Amounts use integer cents where specified.

## Functional requirements

R1: For nonnegative built-in int amount, refund.refund(amount) returns an integer equal to amount.

R2: For negative built-in int amount, refund.refund(amount) raises ValueError.

R3: For non-built-in-int amount, including bool, refund.refund(amount) raises TypeError.

## Environment

Python 3.11, no network or external services.
