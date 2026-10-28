# Capacity SRS

Amounts use integer cents where specified.

## Functional requirements

R1: For built-in integer capacity and booked with 0 <= booked <= capacity, capacity.available(capacity, booked) returns the integer capacity minus booked. Equality and zero capacity are valid.

R2: Negative counts or booked greater than capacity raise ValueError.

R3: Either argument whose type is not built-in int, including bool, raises TypeError.

## Environment

Python 3.11, no network or external services.
