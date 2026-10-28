# Shipping SRS

A small integer-cent shipping calculator.

## Functional requirements

R1: For a built-in int amount_cents from 0 to 9999, shipping.fee(amount_cents) returns the integer 1000 cents.

R2: For a built-in int amount_cents of at least 10000, shipping.fee(amount_cents) returns the integer 0 cents, including exactly 10000.

R3: For negative built-in int amount_cents, shipping.fee raises ValueError.

R4: For any argument whose type is not the built-in int, including bool, shipping.fee raises TypeError.

## Environment

Python 3.11. No external services.
