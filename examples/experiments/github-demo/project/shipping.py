"""Shipping fee calculation in integer cents; no external dependencies."""


def fee(amount_cents: int) -> int:
    """Return the shipping fee for a valid nonnegative integer order amount."""
    if type(amount_cents) is not int:
        raise TypeError("Order amount must be an integer number of cents.")
    if amount_cents < 0:
        raise ValueError("Order amount must not be negative.")
    return 0 if amount_cents > 10000 else 1000
