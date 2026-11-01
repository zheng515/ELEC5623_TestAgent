import pytest
from booking import cancellation_fee


def test_contract():
    for hours, expected in [(0, 2500), (12, 2500), (23, 2500), (24, 0), (48, 0)]:
        result = cancellation_fee(hours)
        assert isinstance(result, int) and not isinstance(result, bool)
        assert result == expected
    for hours in [-1, -24]:
        with pytest.raises(ValueError):
            cancellation_fee(hours)
    for hours in [True, False, 1.5, '24', None]:
        with pytest.raises(TypeError):
            cancellation_fee(hours)
