from pathlib import Path


def application(environ, start_response):
    root = Path(__file__).parent
    path = environ.get('PATH_INFO', '/')
    if path == '/':
        file, content_type = root / 'index.html', 'text/html; charset=utf-8'
    elif path == '/app.js':
        file, content_type = root / 'app.js', 'application/javascript'
    else:
        start_response('404 Not Found', [('Content-Type', 'text/plain')])
        return [b'Not found']
    start_response('200 OK', [('Content-Type', content_type)])
    return [file.read_bytes()]
