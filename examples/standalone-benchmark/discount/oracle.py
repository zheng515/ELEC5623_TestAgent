from discount import subtotal
import pytest
def test_contract():
    for count in [0,1,8]:
        value = subtotal(count)
        assert isinstance(value,int) and not isinstance(value,bool)
        assert value == count*200
    with pytest.raises(ValueError): subtotal(-1)
    with pytest.raises(TypeError): subtotal(True)
