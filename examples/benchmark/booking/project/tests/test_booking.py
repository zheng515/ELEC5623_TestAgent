from booking import cancellation_fee


def test_early_cancellation():
    assert cancellation_fee(48) == 0
