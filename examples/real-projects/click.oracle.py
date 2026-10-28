"""Fixed executable witnesses, prepared before any model calls; not a human review."""
import click
from click.testing import CliRunner


def test_contract():
    def invoke(option, args):
        seen = []
        @click.command()
        @option
        def command(**values):
            seen.append(values)
            if 'count' in values:
                click.echo(values['count'])
        return CliRunner().invoke(command, args), seen
    for args, expected in [([], 1), (['--count', '3'], 3)]:
        result, seen = invoke(click.option('--count', default=1, type=int), args)
        assert result.exit_code == 0 and result.output == f'{expected}\n'
        assert seen == [{'count': expected}]
    result, seen = invoke(click.option('--count', type=int), ['--count', 'not-an-integer'])
    assert result.exit_code == 2 and seen == []
    for args, expected in [([], ()), (['--message', 'first', '--message', 'second'], ('first', 'second'))]:
        result, seen = invoke(click.option('--message', multiple=True), args)
        assert result.exit_code == 0 and seen == [{'message': expected}]
    for args, expected in [([], False), (['--verbose'], True)]:
        result, seen = invoke(click.option('--verbose', is_flag=True, default=False), args)
        assert result.exit_code == 0 and seen == [{'verbose': expected}]
    for value, accepted in [('md5', True), ('sha256', False)]:
        result, seen = invoke(click.option('--hash-type', type=click.Choice(['MD5', 'SHA1'], case_sensitive=False)), ['--hash-type', value])
        assert result.exit_code == (0 if accepted else 2)
        assert seen == ([{'hash_type': 'MD5'}] if accepted else [])
    for value in (0, 1, 3, 4):
        result, seen = invoke(click.option('--count', type=click.IntRange(1, 3)), ['--count', str(value)])
        assert result.exit_code == (0 if value in (1, 3) else 2)
        assert seen == ([{'count': value}] if value in (1, 3) else [])
