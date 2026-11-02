from shipping import fee


def test_interior_free_shipping():
    assert fee(20000) == 0
