from capacity import available
import pytest
def test_contract():
    for total, booked in [(0,0),(5,0),(5,5),(5,2)]:
        value = available(total,booked)
        assert isinstance(value,int) and not isinstance(value,bool)
        assert value == total-booked
    for total, booked in [(-1,0),(5,-1),(2,3)]:
        with pytest.raises(ValueError): available(total,booked)
    with pytest.raises(TypeError): available(True,0)
