"""Fixed public API witnesses, hidden from model context."""
import pytest
from werkzeug.datastructures import MultiDict, Headers
from werkzeug.routing import Map, Rule
from werkzeug.exceptions import NotFound


def test_contract():
    d = MultiDict([('a', 'b'), ('a', 'c')])
    assert d['a'] == 'b' and d.getlist('a') == ['b', 'c']
    empty = MultiDict()
    assert empty.getlist('missing') == [] and empty.get('missing', 'fallback') == 'fallback'
    d = MultiDict([('a', 'b')])
    d.add('a', 'c')
    assert d.getlist('a') == ['b', 'c']
    d['a'] = 'replacement'
    assert d.getlist('a') == ['replacement']
    assert MultiDict([('n', '1'), ('n', 'invalid'), ('n', '2')]).getlist('n', type=int) == [1, 2]
    headers = Headers([('X-Tag', 'one')])
    headers.add('X-Tag', 'two')
    assert headers['x-tag'] == 'one' and headers.getlist('x-tag') == ['one', 'two']
    adapter = Map([Rule('/user/<int:id>', endpoint='user')]).bind('example.com')
    assert adapter.match('/user/42') == ('user', {'id': 42})
    assert adapter.build('user', {'id': 42}) == '/user/42'
    with pytest.raises(NotFound):
        adapter.match('/user/not-an-int')
