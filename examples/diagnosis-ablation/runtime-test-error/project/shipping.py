def fee(amount_cents: int) -> int:
    if type(amount_cents) is not int:
        raise TypeError("amount_cents must be an integer")
    if amount_cents < 0:
        raise ValueError("amount_cents must be nonnegative")
    return 0 if amount_cents >= 10000 else 1000
