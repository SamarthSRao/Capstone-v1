#!/usr/bin/env bash
# Prove the dashboard nginx allowlist: GET /api/orchestrator/api/target/status
# is proxied, any other orchestrator path is 404, and a non-GET on the
# status URL is 403. Also runs nginx -t on the shipped config.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKDIR="$(mktemp -d)"
mkdir -p "$WORKDIR/body" "$WORKDIR/proxy" "$WORKDIR/fastcgi" "$WORKDIR/uwsgi" "$WORKDIR/scgi" "$WORKDIR/logs" "$WORKDIR/html"
STUB_PID=""
NGINX_PID=""
cleanup() {
  if [ -n "$NGINX_PID" ]; then kill "$NGINX_PID" 2>/dev/null || true; fi
  if [ -n "$STUB_PID" ]; then kill "$STUB_PID" 2>/dev/null || true; fi
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

STUB_PORT="$(python3 - << 'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
)"
NGINX_PORT="$(python3 - << 'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
)"

cat > "$WORKDIR/stub.py" << 'PY'
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

class Handler(BaseHTTPRequestHandler):
    def _reply(self):
        body = ("%s %s\n" % (self.command, self.path)).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._reply()

    def do_POST(self):
        self._reply()

    def log_message(self, fmt, *args):
        return

ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
PY
python3 "$WORKDIR/stub.py" "$STUB_PORT" > "$WORKDIR/logs/stub.log" 2>&1 &
STUB_PID=$!
ready=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf -o /dev/null "http://127.0.0.1:${STUB_PORT}/api/target/status"; then
    ready=1
    break
  fi
  sleep 0.1
done
if [ "$ready" != 1 ]; then
  echo "orchestrator stub did not start" >&2
  cat "$WORKDIR/logs/stub.log" >&2 || true
  exit 1
fi

sed \
  -e "s/listen 80;/listen 127.0.0.1:${NGINX_PORT};/" \
  -e "s|orchestrator.capstone.svc.cluster.local:8082|127.0.0.1:${STUB_PORT}|" \
  "$ROOT/nginx.conf" > "$WORKDIR/snippet.conf"

cat > "$WORKDIR/nginx.conf" << EOF
worker_processes 1;
pid $WORKDIR/nginx.pid;
error_log $WORKDIR/logs/error.log;
events { worker_connections 64; }
http {
    client_body_temp_path $WORKDIR/body;
    proxy_temp_path $WORKDIR/proxy;
    fastcgi_temp_path $WORKDIR/fastcgi;
    uwsgi_temp_path $WORKDIR/uwsgi;
    scgi_temp_path $WORKDIR/scgi;
    access_log off;
    include $WORKDIR/snippet.conf;
}
EOF

# nginx -t binds the listen port. The shipped file uses :80, which this
# user cannot bind, so the checked copy is that file with the listen port
# and the upstream host rewritten. Nothing else is changed.
nginx -t -c "$WORKDIR/nginx.conf"
nginx -c "$WORKDIR/nginx.conf"
NGINX_PID="$(cat "$WORKDIR/nginx.pid")"

for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf -o /dev/null "http://127.0.0.1:${NGINX_PORT}/health"; then
    break
  fi
  sleep 0.1
done

status_body="$(curl -s "http://127.0.0.1:${NGINX_PORT}/api/orchestrator/api/target/status")"
status_code="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${NGINX_PORT}/api/orchestrator/api/target/status")"
post_status="$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:${NGINX_PORT}/api/orchestrator/api/target/status")"
post_scale="$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:${NGINX_PORT}/api/orchestrator/scale")"
get_scale="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${NGINX_PORT}/api/orchestrator/scale")"
get_health="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${NGINX_PORT}/api/orchestrator/health")"

test "$status_code" = "200"
test "$status_body" = "GET /api/target/status"
test "$post_status" = "403"
test "$post_scale" = "404"
test "$get_scale" = "404"
test "$get_health" = "404"

echo "nginx allowlist ok: GET status 200, POST status 403, other orchestrator paths 404"
