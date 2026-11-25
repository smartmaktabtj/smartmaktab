"""Local synthetic integration test; never connects to a real provider."""
import base64, json, os, sys, threading, unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from preview import AliyaGateway, PreviewHandler

class MockGateway(BaseHTTPRequestHandler):
    calls = []
    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        self.calls.append((self.path, self.headers.get('Authorization'), data))
        body = json.dumps({'reply':'Текст аз саҳифа'}, ensure_ascii=False).encode()
        self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
    def log_message(self, *args): pass

class AliyaTest(unittest.TestCase):
    def test_opt_in_proxy_and_synthetic_chat_ocr(self):
        with ThreadingHTTPServer(('127.0.0.1',0), MockGateway) as mock, ThreadingHTTPServer(('127.0.0.1',0), PreviewHandler) as app:
            for server in (mock,app): threading.Thread(target=server.serve_forever, daemon=True).start()
            endpoint=f'http://127.0.0.1:{app.server_port}'
            with patch.dict(os.environ, {'SMARTMAKTAB_ALIYA_GATEWAY_URL':f'http://127.0.0.1:{mock.server_port}', 'SMARTMAKTAB_ALIYA_GATEWAY_TOKEN':'fictional-token'}):
                PreviewHandler.aliya=AliyaGateway()
            def call(data, origin=endpoint):
                request=Request(endpoint+'/api/aliya/run',json.dumps(data).encode(),headers={'Content-Type':'application/json','Origin':origin})
                return json.load(urlopen(request,timeout=4))
            try:
                page=urlopen(endpoint+'/cabinets/school/teacher.html').read()
                self.assertIn(b'name="sm-aliya-gateway"', page);self.assertNotIn(b'fictional-token',page)
                self.assertEqual(MockGateway.calls,[])
                chat={'task':'summary','text':'Матни санҷишӣ танҳо барои санҷиши маҳаллӣ.', 'language':'tg'}
                with self.assertRaises(HTTPError) as blocked: call(chat,'https://unrelated.test')
                self.assertEqual(blocked.exception.code,403)
                self.assertEqual(call(chat), {'text':'Текст аз саҳифа'})
                self.assertEqual(call({'task':'ocr','image':base64.b64encode(b'\xff\xd8\xffsynthetic').decode()}), {'text':'Текст аз саҳифа'})
                self.assertEqual([(a,b) for a,b,_ in MockGateway.calls], [('/v1/chat','Bearer fictional-token'),('/v1/vision','Bearer fictional-token')])
                self.assertIn(chat['text'], MockGateway.calls[0][2]['messages'][1]['content'])
                self.assertIn('image_base64', MockGateway.calls[1][2])
            finally:
                PreviewHandler.aliya=None
                app.shutdown();mock.shutdown()

if __name__=='__main__': unittest.main()
