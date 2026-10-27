from mathutils import ceil, floor

def test_contract():
    options = [1.5, 2.5, 4, 6]
    assert ceil(4, options=options) == 4
    assert ceil(3.5, options=options) == 4
    assert floor(2.5, options=options) == 2.5
    assert floor(3.5, options=options) == 2.5
    assert ceil(3.1) == 4
    assert ceil(-3.1) == -3
    assert floor(3.1) == 3
    assert floor(-3.1) == -4
