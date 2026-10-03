"""Static local preview only. Not an authentication or medical backend."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from pathlib import Path
from urllib.parse import urlsplit
import webbrowser

class PreviewHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlsplit(self.path).path == '/':
            self.send_response(302)
            self.send_header('Location', 'MELICARE.html')
            self.end_headers()
            return
        super().do_GET()

if __name__ == '__main__':
    root = Path(__file__).resolve().parent
    try:
        server = ThreadingHTTPServer(('127.0.0.1', 8080), partial(PreviewHandler, directory=str(root)))
    except OSError as exc:
        raise SystemExit(f'Không mở được cổng 8080: {exc}. Hãy đóng phiên CHAY_THU.py trước đó rồi thử lại.')
    print('MELICARE: http://127.0.0.1:8080/MELICARE.html — Ctrl+C để dừng')
    webbrowser.open('http://127.0.0.1:8080/MELICARE.html')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
