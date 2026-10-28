from refund import refund
import pytest
def test_contract():
    for amount in [0,1,150]:
        value = refund(amount)
        assert isinstance(value, int) and not isinstance(value, bool)
        assert value == amount
    with pytest.raises(ValueError): refund(-1)
    with pytest.raises(TypeError): refund(False)
