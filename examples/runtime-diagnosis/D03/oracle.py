from tokens import values
def test_contract():
    result = values()
    assert iter(result) is result
    items = list(result)
    assert items == ["a", "b"]
    assert all(isinstance(item, str) for item in items)
