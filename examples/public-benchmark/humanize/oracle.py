from filesize import naturalsize

def test_contract():
    assert naturalsize(3000000) == '3.0 MB'
    assert naturalsize(3000, binary=True) == '2.9 KiB'
    assert naturalsize(3000, gnu=True) == '2.9K'
    assert naturalsize(3000, gnu=True, format='%.3f') == '2.930K'
    assert naturalsize(-4096, binary=True) == '-4.0 KiB'
