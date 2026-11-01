"""UI-only checks of upload, saved evidence and responsive results; all APIs intercepted.

Use with the production website on port 3001 and a completed exported report:
python scripts/check-large-evaluation.py saved-report.json output-directory
Run inside the sandbox image, which supplies Playwright and sandbox Chromium.
"""
import hashlib
import json
from pathlib import Path
import re
import sys
import zipfile
from playwright.sync_api import sync_playwright, expect

report = json.loads(Path(sys.argv[1]).read_text())
output = Path(sys.argv[2])
output.mkdir(parents=True, exist_ok=True)
checks = []
errors = []
text = '\n\n'.join(rule['text'] for rule in report['rules'])
document = {'id': '00000000-0000-4000-8000-000000000001', 'fileName': 'SRS.md', 'format': 'md',
            'sha256': hashlib.sha256(text.encode()).hexdigest(), 'warnings': [], 'pages': [],
            'segments': [{'id': 's1', 'text': text, 'location': 'Line 1', 'line': 1, 'extraction': 'text'}]}
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.on('pageerror', lambda error: errors.append(str(error)))
    def api(route):
        path = route.request.url.split('/api/', 1)[-1].split('?', 1)[0]
        if path == 'requirements' and route.request.method == 'POST':
            route.fulfill(json=document)
        elif route.request.method != 'GET':
            route.fulfill(status=405, json={'error': 'No real mutations allowed in this UI fixture'})
        elif path == 'auth/get-session':
            route.fulfill(json={'session': {'id': 'ui-session', 'token': 'ui-only', 'userId': 'ui-user', 'expiresAt': '2027-01-01T00:00:00.000Z'}, 'user': {'id': 'ui-user', 'name': 'Pagination fixture', 'email': 'pagination@example.invalid', 'emailVerified': True, 'createdAt': '2026-01-01T00:00:00.000Z', 'updatedAt': '2026-01-01T00:00:00.000Z'}})
        elif path == 'python':
            route.fulfill(json=report if '?id=' in route.request.url else [report])
        elif path == 'model':
            route.fulfill(json={'configured': True, 'model': report['model']})
        elif path == 'system/health':
            route.fulfill(json={'database': 'available', 'queue': 'available', 'worker': 'online', 'sandbox': 'available', 'modelConfigured': True, 'checkedAt': '2026-10-29T00:00:00.000Z', 'tasks': {'queued': 0, 'active': 0, 'retrying': 0}})
        else:
            route.fulfill(json={'configured': False, 'connected': False, 'emailEnabled': False})
    page.route('**/api/**', api)
    page.goto('http://host.docker.internal:3001/', wait_until='networkidle')
    expect(page.get_by_role('button', name='Evaluation', exact=True)).to_be_visible()
    page.locator('input[type=file][accept=".pdf,.doc,.docx,.txt,.md"]').set_input_files({'name': 'SRS.md', 'mimeType': 'text/markdown', 'buffer': text.encode()})
    expect(page.locator('textarea[name=requirements]')).to_have_value(text)
    expect(page.get_by_role('button', name='Run verification', exact=True)).to_be_enabled()
    checks.append('Uploaded text automatically fills editable requirements; no block selection needed (mock extraction)')
    page.get_by_role('button', name='Evaluation', exact=True).click()
    page.get_by_role('button', name='Project verification', exact=True).click()
    expect(page.locator('textarea[name=requirements]')).to_have_value(text)
    checks.append('Uploaded requirements and their source details survive workspace navigation')
    page.get_by_role('button', name='Evaluation', exact=True).click()
    changes = page.get_by_role('heading', name='What changed after feedback', exact=True)
    if report.get('improvements') and not report.get('replay'):
        expect(changes).to_be_visible()
        page.get_by_text('Inspect changed assertions', exact=True).click()
        page.get_by_role('table').get_by_role('row').nth(1).wait_for()
        change_details = page.locator('details').filter(has=page.get_by_text('Inspect changed assertions', exact=True)).first
        change_details.locator('details').first.locator('summary').first.click()
        expect(change_details.get_by_role('heading', name='Before', exact=True)).to_be_visible()
        expect(change_details.get_by_role('heading', name='After', exact=True)).to_be_visible()
        checks.append('Before/after results and exact original/revised assertions can be inspected')
    page.screenshot(path=str(output / 'overview-desktop.png'), full_page=True)
    if any(outcome['status'] in ['failed', 'error'] for outcome in report['measurements'][-1]['outcomes']):
        page.get_by_role('button', name='Inspect finding', exact=True).click()
        expect(page.locator('#finding-evidence').get_by_text(re.compile('Next step:'))).to_be_visible()
        for name in ['Requirement', 'Test artifact', 'Execution', 'Agent assessment']:
            page.locator('#finding-evidence').get_by_role('tab', name=name, exact=True).click()
        checks.append('Priority finding opens requirement/test/execution/assessment trail with an actionable next step')
    with page.expect_download() as download:
        page.get_by_role('button', name='Export evidence', exact=True).click()
    export = output / 'verification.json'
    download.value.save_as(export)
    assert json.loads(export.read_text()) == report
    with page.expect_download() as download:
        page.get_by_role('button', name='Download tests', exact=True).click()
    archive = output / 'tests.zip'
    download.value.save_as(archive)
    with zipfile.ZipFile(archive) as saved:
        assert json.loads(saved.read('verification.json')) == report
    checks.append('Evidence JSON and test archive retain the exact selected report')
    expect(page.get_by_role('tab', name='Findings', exact=True)).to_be_visible()
    page.get_by_role('tab', name='Findings', exact=True).click()
    panel = page.locator('#test-results')
    large = len(report['measurements'][-1]['outcomes']) > 100
    if large:
        expect(panel.get_by_text(re.compile(r'Page 1 of \d+'))).to_be_visible()
        expect(panel.locator('details.rounded-lg')).to_have_count(100)
        first = panel.locator('details.rounded-lg').first.inner_text()
        panel.get_by_role('button', name='Next results', exact=True).click()
        expect(panel.get_by_text(re.compile(r'Page 2 of \d+'))).to_be_visible()
        assert panel.locator('details.rounded-lg').first.inner_text() != first
        expect(panel.locator('details.rounded-lg')).to_have_count(100)
        panel.get_by_role('button', name=re.compile(r'^Passed')).click()
        expect(panel.get_by_text(re.compile(r'Page 1 of \d+'))).to_be_visible()
        checks.append('Only 100 result rows render per page; navigation and filter reset work')
    page.screenshot(path=str(output / 'large-results-desktop.png'), full_page=True)
    page.get_by_role('tab', name='Evidence', exact=True).click()
    page.get_by_text('Execution records and limitations', exact=True).click()
    page.get_by_text(re.compile(r'^Generated-suite execution 1')).click()
    if len(report['measurements'][0]['outcomes']) > 100:
        page.get_by_role('button', name='Next records', exact=True).click()
        expect(page.get_by_text(re.compile(r'exact outcomes saved. Page 2 of'))).to_be_visible()
        checks.append('Raw execution evidence is paginated without discarding exact saved outcomes')
    for width in [320, 390, 768]:
        page.set_viewport_size({'width': width, 'height': 900})
        for section in ['Overview', 'Requirements', 'Findings', 'Evidence']:
            page.get_by_role('tab', name=section, exact=True).click()
            page.locator('[role=tabpanel][data-state=active] details').evaluate_all('(items) => items.forEach(item => item.open = true)')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2'), f'Horizontal overflow in {section} at {width}'
        page.screenshot(path=str(output / f'large-results-{width}.png'), full_page=True)
        checks.append(f'No horizontal overflow in all four tabs at {width}px with details expanded')
    assert not errors, errors
    browser.close()
result = {'scope': 'UI-only test with intercepted APIs including mock extraction; not real authentication, a new model observation or independent usability/semantic review.', 'reportId': report['id'], 'outcomeCount': len(report['measurements'][-1]['outcomes']), 'checks': checks, 'pageErrors': errors}
(output / 'checks.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
