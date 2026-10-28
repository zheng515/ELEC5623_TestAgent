# Credits SRS

Amounts use integer cents where specified.

## Functional requirements

R1: For nonnegative built-in int units, credits.charge(units) returns an integer, not bool, equal to units multiplied by 3. Zero units returns integer 0.

R2: Negative built-in int units raise ValueError; non-built-in-int units, including bool, raise TypeError.

## Environment

Python 3.11, no network or external services.
