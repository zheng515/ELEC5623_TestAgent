from shipping import fee


def test_existing_standard_shipping():
    assert fee(1000) == 1000
