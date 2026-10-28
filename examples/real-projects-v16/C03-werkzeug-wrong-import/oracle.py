from werkzeug.datastructures import MultiDict
def test_contract():
    d = MultiDict([('a', 'b'), ('a', 'c')])
    assert d['a'] == 'b' and d.getlist('a') == ['b', 'c']
    assert MultiDict().getlist('missing') == []
