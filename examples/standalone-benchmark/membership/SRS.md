# Membership SRS

Amounts use integer cents where specified.

## Functional requirements

R1: For built-in int years from 0 through 4, membership.annual_fee(years) returns integer 12000.

R2: For built-in int years of at least 5, membership.annual_fee(years) returns integer 0, including exactly 5.

R3: Negative built-in int years raise ValueError; all non-built-in-int inputs, including bool, raise TypeError.

## Environment

Python 3.11, no network or external services.
