from shipping import fee
def test_contract():
    result = fee(10000)
    assert isinstance(result, int) and not isinstance(result, bool)
    assert result == 0
