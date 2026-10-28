import http.server
import socketserver
import os
import sys
import mimetypes

PORT = 8080
DIRECTORY = os.path.abspath(r"C:\Users\atteh\OneDrive\Desktop\workspace\wdos\wdos-v85.8\app")

# Ensure proper MIME types
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("text/css", ".css")

class WDOSHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        # Handle redirects specified in _redirects
        if self.path == "/config.json":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            with open(os.path.join(DIRECTORY, "wdos-config.json"), "rb") as f:
                self.wfile.write(f.read())
            return
        elif self.path in ("/wgmn", "/wgmn/"):
            self.send_response(302)
            self.send_header("Location", "/#/wgmn")
            self.end_headers()
            return
        elif self.path in ("/wnnn", "/wnnn/"):
            self.send_response(302)
            self.send_header("Location", "/#/wnnn")
            self.end_headers()
            return

        return super().do_GET()

    def end_headers(self):
        # Prevent caching issues during local dev
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

if __name__ == "__main__":
    os.chdir(DIRECTORY)
    with ReusableTCPServer(("", PORT), WDOSHandler) as httpd:
        print(f"Serving WDOS from {DIRECTORY} at http://localhost:{PORT}")
        sys.stdout.flush()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
