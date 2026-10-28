from packaging.utils import canonicalize_name
def test_contract():
    assert canonicalize_name('Django') == 'django'
    assert canonicalize_name('oslo.concurrency') == 'oslo-concurrency'
