"""UI-only intercepted-API checks against an actual large saved report; no model calls."""
import json
from pathlib import Path
import re
import sys
from playwright.sync_api import sync_playwright, expect

report = json.loads(Path(sys.argv[1]).read_text())
output = Path(sys.argv[2])
output.mkdir(parents=True, exist_ok=True)
checks = []
errors = []
api_paths = []
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.on('pageerror', lambda error: errors.append(str(error)))
    def api(route):
        path = route.request.url.split('/api/', 1)[-1].split('?', 1)[0]
        api_paths.append(path)
        if route.request.method != 'GET':
            route.fulfill(status=405, json={'error': 'Read-only UI fixture'})
        elif path == 'auth/get-session':
            route.fulfill(json={'session': {'id': 'ui-session', 'token': 'ui-only', 'userId': 'ui-user', 'expiresAt': '2027-01-01T00:00:00.000Z'}, 'user': {'id': 'ui-user', 'name': 'Pagination fixture', 'email': 'pagination@example.invalid', 'emailVerified': True, 'createdAt': '2026-01-01T00:00:00.000Z', 'updatedAt': '2026-01-01T00:00:00.000Z'}})
        elif path == 'python':
            route.fulfill(json=[report])
        elif path == 'model':
            route.fulfill(json={'configured': True, 'model': report['model']})
        elif path == 'system/health':
            route.fulfill(json={'database': 'available', 'queue': 'available', 'worker': 'online', 'sandbox': 'available', 'modelConfigured': True, 'checkedAt': '2026-10-29T00:00:00.000Z', 'tasks': {'queued': 0, 'active': 0, 'retrying': 0}})
        else:
            route.fulfill(json={'configured': False, 'connected': False, 'emailEnabled': False})
    page.route('**/api/**', api)
    page.goto('http://host.docker.internal:3001/', wait_until='networkidle')
    if page.get_by_role('button', name='Evaluation', exact=True).count() == 0:
        print(json.dumps({'apiPaths': api_paths, 'body': page.locator('body').inner_text()[:4000], 'errors': errors}), flush=True)
    page.get_by_role('button', name='Evaluation', exact=True).click()
    expect(page.get_by_role('tab', name='Findings', exact=True)).to_be_visible()
    page.get_by_role('tab', name='Findings', exact=True).click()
    panel = page.locator('#test-results')
    expect(panel.get_by_text(re.compile(r'Page 1 of \d+'))).to_be_visible()
    expect(panel.locator('details.rounded-lg')).to_have_count(100)
    first = panel.locator('details.rounded-lg').first.inner_text()
    panel.get_by_role('button', name='Next results', exact=True).click()
    expect(panel.get_by_text(re.compile(r'Page 2 of \d+'))).to_be_visible()
    assert panel.locator('details.rounded-lg').first.inner_text() != first
    expect(panel.locator('details.rounded-lg')).to_have_count(100)
    panel.get_by_role('button', name=re.compile(r'^Passed')).click()
    expect(panel.get_by_text(re.compile(r'Page 1 of \d+'))).to_be_visible()
    checks.append('27k outcomes: only 100 result rows render per page; navigation and filter reset work')
    page.screenshot(path=str(output / 'large-results-desktop.png'), full_page=True)
    page.get_by_role('tab', name='Evidence', exact=True).click()
    page.get_by_text('Execution records and limitations', exact=True).click()
    page.get_by_text(re.compile(r'^Generated-suite execution 1')).click()
    page.get_by_role('button', name='Next records', exact=True).click()
    expect(page.get_by_text(re.compile(r'exact outcomes saved. Page 2 of'))).to_be_visible()
    checks.append('Raw execution evidence is paginated without discarding exact saved outcomes')
    for width in [320, 390, 768]:
        page.set_viewport_size({'width': width, 'height': 900})
        page.get_by_role('tab', name='Findings', exact=True).click()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2'), f'Horizontal overflow at {width}'
        page.screenshot(path=str(output / f'large-results-{width}.png'), full_page=True)
        checks.append(f'No horizontal overflow at {width}px with real parameterized node names')
    assert not errors, errors
    browser.close()
result = {'scope': 'UI-only test with intercepted read-only API responses; not new model observations or independent semantic review.', 'reportId': report['id'], 'outcomeCount': len(report['measurements'][-1]['outcomes']), 'checks': checks, 'pageErrors': errors}
(output / 'checks.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
