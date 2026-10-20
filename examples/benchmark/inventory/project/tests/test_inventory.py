import pytest
from inventory import remaining


def test_partial_reservation():
    assert remaining(10, 3) == 7


def test_equal_stock_is_rejected():
    with pytest.raises(ValueError):
        remaining(5, 5)
