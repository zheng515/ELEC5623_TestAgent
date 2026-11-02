from shipping import fee


def test_contract():
    result = fee(500)
    assert isinstance(result, int)
    assert not isinstance(result, bool)
    assert result == 1000
