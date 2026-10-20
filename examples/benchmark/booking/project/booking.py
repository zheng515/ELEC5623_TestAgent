def cancellation_fee(hours):
    if type(hours) is not int:
        raise TypeError("hours must be an integer")
    if hours < 0:
        raise ValueError("hours must be nonnegative")
    return 0 if hours > 24 else 2500
