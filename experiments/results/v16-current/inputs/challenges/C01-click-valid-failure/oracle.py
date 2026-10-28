import click
def test_contract():
    assert click.IntRange(1, 3).convert('1', None, None) == 1
    assert click.IntRange(1, 3).convert('3', None, None) == 3
