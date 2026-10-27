from membership import annual_fee
import pytest
def test_contract():
    for years, expected in [(0,12000),(4,12000),(5,0),(6,0)]:
        value = annual_fee(years)
        assert isinstance(value, int) and not isinstance(value, bool)
        assert value == expected
    with pytest.raises(ValueError): annual_fee(-1)
    with pytest.raises(TypeError): annual_fee(True)
