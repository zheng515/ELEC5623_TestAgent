import pytest
from shipping import fee


def test_contract():
    for amount, expected in [(0, 1000), (500, 1000), (9999, 1000), (10000, 0), (10001, 0)]:
        result = fee(amount)
        assert isinstance(result, int) and not isinstance(result, bool)
        assert result == expected
    for amount in [-1, -10000]:
        with pytest.raises(ValueError):
            fee(amount)
    for amount in [True, False, 1.5, '10000', None]:
        with pytest.raises(TypeError):
            fee(amount)
