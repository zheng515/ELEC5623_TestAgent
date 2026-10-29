from values import echo


def test_explicit_contract_examples():
    for value in range(32):
        result = echo(value)
        assert isinstance(result, int) and not isinstance(result, bool)
        assert result == value
