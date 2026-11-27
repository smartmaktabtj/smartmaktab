#!/usr/bin/env python3
"""Serve the existing app in an editable live preview; do not expose project internals."""
import json
import io
from http import HTTPStatus
from aliya_gateway import AliyaGateway
from argparse import ArgumentParser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
ROUTES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/sw.js": "sw.js",
    "/icon.svg": "icon.svg",
    "/pwa-192.png": "pwa-192.png",
    "/pwa-512.png": "pwa-512.png",
    "/manifest.webmanifest": "manifest.webmanifest",
}

for pdf_asset in ('pdf.min.mjs','pdf.worker.min.mjs'):
    ROUTES[f'/vendor/pdf/{pdf_asset}']=f'vendor/pdf/{pdf_asset}'
for font in (ROOT/'vendor/pdf/standard_fonts').glob('*'):
    if font.is_file() and font.suffix in {'.pfb','.ttf'}:
        ROUTES[f'/vendor/pdf/standard_fonts/{font.name}']=f'vendor/pdf/standard_fonts/{font.name}'



# Only registry-listed HTML pages are public; never serve arbitrary workspace files.
for entry in json.loads((ROOT / 'shared/cabinet-registry.json').read_text(encoding='utf8')):
    target = entry['path']
    page = Path(target)
    if page.parts[0] == 'cabinets' and page.suffix == '.html' and '..' not in page.parts:
        ROUTES[f'/{target}'] = target


class PreviewHandler(SimpleHTTPRequestHandler):
    aliya = None

    def do_POST(self):
        if self.path != '/api/aliya/run' or self.aliya is None:
            self.send_error(404, 'Not part of the live preview'); return
        port = self.server.server_port
        hosts = {f'{host}:{port}' for host in ('127.0.0.1', 'localhost')}
        host = self.headers.get('Host')
        if host not in hosts or self.headers.get('Origin') != f'http://{host}' or self.headers.get_content_type() != 'application/json':
            self.send_error(403); return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 1 <= length <= 1250000:
                self.send_error(413); return
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict): raise ValueError('invalid_data')
            status, result = self.aliya.run(data)
        except (ValueError, TypeError, AttributeError):
            status, result = 400, {'error':'invalid_request'}
        body = json.dumps(result, ensure_ascii=False).encode()
        self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Cache-Control','no-store'); self.send_header('Content-Length',str(len(body))); self.end_headers()
        try: self.wfile.write(body)
        except OSError: pass

    def send_head(self):
        path = urlsplit(self.path).path
        if path not in ROUTES:
            self.send_error(404, "Not part of the live preview")
            return None
        if self.aliya is not None and path == '/cabinets/school/teacher.html':
            content = (ROOT / ROUTES[path]).read_bytes().replace(b'</head>', b'<meta name="sm-aliya-gateway" content="local"></head>', 1)
            self.send_response(HTTPStatus.OK); self.send_header('Content-Type','text/html; charset=utf-8')
            self.send_header('Content-Length',str(len(content))); self.end_headers(); return io.BytesIO(content)
        self.path = "/" + ROUTES[path]
        return super().send_head()

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4180)
    parser.add_argument("--open", action="store_true", help="Open the app in the local browser after the server has started")
    parser.add_argument("--with-aliya", action="store_true", help="Enable the existing Aliya gateway adapter on loopback, using environment settings")
    args = parser.parse_args()
    if args.with_aliya:
        if args.host != '127.0.0.1': parser.error('--with-aliya requires --host 127.0.0.1')
        try: PreviewHandler.aliya = AliyaGateway()
        except ValueError as error: parser.error(str(error))
    handler = partial(PreviewHandler, directory=str(ROOT))
    with ThreadingHTTPServer((args.host, args.port), handler) as server:
        print(f"SmartMaktab preview listening on {args.host}:{server.server_port}", flush=True)
        if args.open:
            from threading import Thread
            import webbrowser
            local = f'http://127.0.0.1:{server.server_port}/'
            Thread(target=webbrowser.open, args=(local,), daemon=True).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
