import click
def test_contract():
    for raw, expected in [('1', 1), ('3', 3)]:
        value = click.IntRange(1, 3).convert(raw, None, None)
        assert isinstance(value, int) and not isinstance(value, bool) and value == expected
