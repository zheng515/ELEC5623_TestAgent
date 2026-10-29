"""Write exact collected node IDs outside the submitted source tree."""
import json
from pathlib import Path


def pytest_collection_finish(session):
    nodes = [item.nodeid for item in session.items]
    result = {'nodes': nodes, 'totalNodes': len(nodes)}
    raw = json.dumps(result)
    if len(nodes) > 50_000 or len(raw.encode()) > 8_000_000:
        result = {'nodes': [], 'totalNodes': len(nodes), 'error': 'Collected catalog exceeds 50,000 nodes or 8 MB; full collection evidence is unavailable.'}
    Path('/tmp/reqtest-collection.json').write_text(json.dumps(result))
