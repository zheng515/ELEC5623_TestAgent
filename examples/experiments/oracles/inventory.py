import pytest
from inventory import remaining


def test_contract():
    for stock, requested, expected in [(10, 3, 7), (10, 10, 0), (0, 0, 0), (10, 0, 10)]:
        actual = remaining(stock, requested)
        assert isinstance(actual, int) and not isinstance(actual, bool)
        assert actual == expected
    for stock, requested in [(1, 2), (-1, 0), (1, -1)]:
        with pytest.raises(ValueError):
            remaining(stock, requested)
    for value in [True, False, 1.5, "1", None]:
        with pytest.raises(TypeError):
            remaining(value, 0)
        with pytest.raises(TypeError):
            remaining(1, value)
