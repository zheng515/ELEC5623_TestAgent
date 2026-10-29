"""Fixed doc-derived examples; not an independent semantic accuracy annotation."""
import pytest
from packaging.version import Version, InvalidVersion
from packaging.specifiers import SpecifierSet
from packaging.requirements import Requirement
from packaging.utils import canonicalize_name


def test_contract():
    assert Version('1.0a5') < Version('1.0') == Version('1.0.0')
    assert Version('1.0').release == (1, 0)
    assert Version('1.0').is_prerelease is False
    with pytest.raises(InvalidVersion):
        Version('french toast')
    spec = SpecifierSet('>=1.0,<2.0')
    assert list(spec.filter(['0.9', '1.0', '1.5', '2.0'])) == ['1.0', '1.5']
    assert all((v in spec) == accepted for v, accepted in [('0.9', False), ('1.0', True), ('1.5', True), ('2.0', False)])
    combined = SpecifierSet('~=1.0') & SpecifierSet('>=1.0') & '!=1.1'
    assert all((v in combined) == accepted for v, accepted in [('1.0', True), ('1.4', True), ('1.1', False), ('2.0', False), ('1.0a5', False)])
    req = Requirement('name[foo]>=2,<3; python_version>"2.0"')
    assert req.name == 'name' and req.extras == {'foo'} and req.url is None
    assert '2.5' in req.specifier and '3.0' not in req.specifier
    assert req.marker is not None
    assert req.marker.evaluate({'python_version': '3.11'}) is True
    assert req.marker.evaluate({'python_version': '2.0'}) is False
    assert [canonicalize_name(n) for n in ['Django', 'oslo.concurrency', 'oslo_concurrency']] == ['django', 'oslo-concurrency', 'oslo-concurrency']
