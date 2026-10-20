from shipping import fee


def test_standard_shipping():
    assert fee(500) == 1000
