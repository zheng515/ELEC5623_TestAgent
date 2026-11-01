from shipping import fee

def test_contract():
    for amount in [10000, 20000]:
        result = fee(amount)
        assert isinstance(result, int) and not isinstance(result, bool)
        assert result == 0
