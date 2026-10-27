import pytest
from booking import cancellation_fee


def test_contract():
    for value, expected in [(0, 2500), (12, 2500), (23, 2500), (24, 0), (25, 0)]:
        actual = cancellation_fee(value)
        assert type(actual) is int
        assert actual == expected
    with pytest.raises(ValueError):
        cancellation_fee(-1)
    for value in [True, False, 1.5, "24", None]:
        with pytest.raises(TypeError):
            cancellation_fee(value)
