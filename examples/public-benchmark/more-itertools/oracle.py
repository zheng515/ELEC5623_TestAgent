import pytest
from recipes import grouper, roundrobin

def test_contract():
    assert list(grouper('ABCDEFG', 3)) == [('A','B','C'),('D','E','F'),('G',None,None)]
    assert list(grouper('ABCDEFG', 3, fillvalue='x')) == [('A','B','C'),('D','E','F'),('G','x','x')]
    assert list(grouper('ABCDEFG', 3, incomplete='ignore')) == [('A','B','C'),('D','E','F')]
    with pytest.raises(ValueError):
        list(grouper('ABCDEFG', 3, incomplete='strict'))
    assert list(grouper('ABCDEF', 3, incomplete='strict')) == [('A','B','C'),('D','E','F')]
    assert list(roundrobin('ABC', 'D', 'EF')) == list('ADEBFC')
