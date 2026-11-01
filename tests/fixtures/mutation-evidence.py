"""Exercise worker evidence extraction against a real cache without running mutants."""
import json
import runpy
import sqlite3
from pathlib import Path

worker = runpy.run_path('/tool/worker.py')['mutate']
context = worker.__globals__
Path('/generated').mkdir(exist_ok=True)
Path('/project/target.py').write_text('VALUE = 1\n')
Path('target.py').write_text('VALUE = 999\n')
context['mutation_scope'] = lambda job: {'file': 'target.py', 'functions': [], 'lines': [1], 'kind': 'executed_lines', 'suite': 'approved_generated'}
context['command'] = lambda args, *limits: (0, '<testsuites/>', False)
results = []
for count, expired in [(1000, False), (1000, True), (2, False)]:
    Path('.mutmut-cache').unlink(missing_ok=True)
    with sqlite3.connect('.mutmut-cache') as cache:
        cache.executescript('CREATE TABLE SourceFile(id,filename); CREATE TABLE Line(id,sourcefile,line_number); CREATE TABLE Mutant(id,line,status);')
        cache.execute('INSERT INTO SourceFile VALUES(1,?)', ('target.py',))
        cache.execute('INSERT INTO Line VALUES(1,1,0)')
        cache.executemany('INSERT INTO Mutant VALUES(?,1,?)', [(i, 'ok_killed') for i in range(count, 0, -1)])
    calls = []
    def diff(ident, *args, **kwargs):
        assert kwargs['source'] == 'VALUE = 1\n', 'Interrupted mutation copies must not become the source oracle.'
        calls.append(ident)
        return '-VALUE = 1\n+VALUE = 2'
    ticks = iter([0, 0, 0] + [100] * 201)
    context['monotonic'] = (lambda: next(ticks)) if expired else (lambda: 0)
    context['get_unified_diff'] = diff
    result = worker({'file': 'target.py'})
    assert result['totalMutants'] == count
    assert [item['id'] for item in result['mutants']] == ['Mutant #' + str(i) for i in range(1, min(count, 200) + 1)]
    assert len(calls) == (0 if expired else min(count, 200))
    assert result['incomplete'] == (count > 200 or expired)
    assert not result['timedOut'], 'An extraction limit is distinct from a mutant execution timeout.'
    assert all(item['status'] == 'killed' for item in result['mutants']), 'Missing diffs must preserve real cached statuses.'
    if expired:
        assert all(not item['diff'] for item in result['mutants'])
    results.append({'cached': count, 'expired': expired, 'returned': len(result['mutants']), 'diffCalls': len(calls), 'incomplete': result['incomplete']})
print(json.dumps(results))
