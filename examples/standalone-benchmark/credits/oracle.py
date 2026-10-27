from credits import charge
import pytest
def test_contract():
    for units in [0,1,7]:
        value = charge(units)
        assert isinstance(value, int) and not isinstance(value, bool)
        assert value == units * 3
    with pytest.raises(ValueError): charge(-1)
    with pytest.raises(TypeError): charge(True)
