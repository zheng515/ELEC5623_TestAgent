from booking import cancellation_fee

def test_contract():
    for hours in [24, 48]:
        result = cancellation_fee(hours)
        assert isinstance(result, int) and not isinstance(result, bool)
        assert result == 0
