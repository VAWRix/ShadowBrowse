import http.server
import socketserver
import os
from pathlib import Path

PORT = 8080
DIRECTORY = Path(__file__).parent.resolve()

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY), **kwargs)

def run():
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print("=" * 60)
        print(" SHADOWBROWSE TEST LAB RUNNER")
        print("=" * 60)
        print(f" Serving test lab locally at: http://127.0.0.1:{PORT}/")
        print(f" - Tracker test:     http://127.0.0.1:{PORT}/tracker.html")
        print(f" - Fingerprint test: http://127.0.0.1:{PORT}/fingerprint.html")
        print(f" - Storage test:     http://127.0.0.1:{PORT}/storage.html")
        print(f" - WebRTC test:      http://127.0.0.1:{PORT}/webrtc.html")
        print(f" - Redirect test:    http://127.0.0.1:{PORT}/redirect.html")
        print(f" - Referrer test:    http://127.0.0.1:{PORT}/referrer.html")
        print("=" * 60)
        httpd.serve_forever()

if __name__ == "__main__":
    run()
