import pytest
from shipping import fee


def test_contract():
    for value, expected in [(0, 1000), (500, 1000), (9999, 1000), (10000, 0), (20000, 0)]:
        actual = fee(value)
        assert type(actual) is int
        assert actual == expected
    with pytest.raises(ValueError):
        fee(-1)
    for value in [True, False, 1.5, "10000", None]:
        with pytest.raises(TypeError):
            fee(value)
