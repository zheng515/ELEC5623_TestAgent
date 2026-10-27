// Exported tests carry the sandbox browser fixtures as reqtest_generated/conftest.py.
// Must equal sandbox/plugins/reqtest_browser.py; tests/test-export.test.ts checks this.
export const browserPlugin = String.raw`"""Browser fixtures for generated end-to-end checks.

live_server(app) serves the project's own ASGI or WSGI application on a loopback port
inside the sandbox; page is a headless Chromium page. Failed browser tests leave a
screenshot for the recorded evidence. Nothing here reaches an external network.
"""
import hashlib
import inspect
import socket
import threading
import time
from pathlib import Path

import pytest

SCREENSHOTS = Path('/work/screenshots')
TIMEOUT_MS = 5000


def _free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def _is_asgi(app):
    return inspect.iscoroutinefunction(app) or inspect.iscoroutinefunction(getattr(app, '__call__', None))


def _serve_asgi(app, port):
    try:
        import uvicorn
    except ImportError as error:
        raise RuntimeError('live_server needs uvicorn to serve an ASGI application; declare it as a project dependency.') from error
    server = uvicorn.Server(uvicorn.Config(app, host='127.0.0.1', port=port, log_level='warning', lifespan='on'))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 15
    while not server.started:
        if not thread.is_alive() or time.monotonic() > deadline:
            raise RuntimeError('The application server did not start.')
        time.sleep(0.02)

    def stop():
        server.should_exit = True
        thread.join(10)
    return stop


def _serve_wsgi(app, port):
    from socketserver import ThreadingMixIn
    from wsgiref.simple_server import WSGIRequestHandler, WSGIServer, make_server

    class Server(ThreadingMixIn, WSGIServer):
        daemon_threads = True

    class Handler(WSGIRequestHandler):
        def log_message(self, *args):
            pass

    httpd = make_server('127.0.0.1', port, app, server_class=Server, handler_class=Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    def stop():
        httpd.shutdown()
        httpd.server_close()
    return stop


@pytest.fixture
def live_server():
    """Return serve(app) -> base URL; every server stops when the test ends."""
    stops = []

    def serve(app):
        port = _free_port()
        stops.append((_serve_asgi if _is_asgi(app) else _serve_wsgi)(app, port))
        return f'http://127.0.0.1:{port}'
    yield serve
    for stop in reversed(stops):
        stop()


@pytest.fixture(scope='session')
def _reqtest_browser():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(args=['--no-sandbox', '--disable-gpu'])
        yield browser
        browser.close()


@pytest.fixture
def page(_reqtest_browser, request):
    from playwright.sync_api import expect
    expect.set_options(timeout=TIMEOUT_MS)
    context = _reqtest_browser.new_context(viewport={'width': 1280, 'height': 800})
    browser_page = context.new_page()
    browser_page.set_default_timeout(TIMEOUT_MS)
    yield browser_page
    report = getattr(request.node, '_reqtest_call', None)
    if report is not None and report.failed:
        try:
            SCREENSHOTS.mkdir(exist_ok=True)
            name = hashlib.sha256(request.node.nodeid.encode()).hexdigest()[:24]
            browser_page.screenshot(path=str(SCREENSHOTS / (name + '.jpg')), type='jpeg', quality=60)
            (SCREENSHOTS / (name + '.txt')).write_text(request.node.nodeid)
        except Exception:
            pass
    context.close()


@pytest.hookimpl(wrapper=True, tryfirst=True)
def pytest_runtest_makereport(item, call):
    report = yield
    if report.when == 'call':
        item._reqtest_call = report
    return report
`;
