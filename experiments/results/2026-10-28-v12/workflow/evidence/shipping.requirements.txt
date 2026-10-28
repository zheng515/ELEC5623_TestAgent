For a built-in int amount_cents from 0 to 9999, shipping.fee(amount_cents) returns the integer 1000 cents.
For a built-in int amount_cents of at least 10000, shipping.fee(amount_cents) returns the integer 0 cents, including exactly 10000.
For negative built-in int amount_cents, shipping.fee raises ValueError.
For any argument whose type is not the built-in int, including bool, shipping.fee raises TypeError.
