#!/usr/bin/env bash
# Run the nginx-lb config from k8s/02-target-app.yaml (rewritten only to point
# at local stub servers and local ports) and prove the real-visitor mirror:
#   - browser page loads of "/" reach the orchestrator's /api/target/visit
#   - replay/load-test traffic, API calls, health checks, non-GET and
#     non-HTML requests do not
#   - cookies, credentials and X-Forwarded-For are not sent on
#   - a dead orchestrator does not break the storefront
# Needs nginx (with the mirror module), python3 and curl. On a machine
# without nginx:
#   docker run --rm -v "$PWD":/repo:ro nginx:alpine sh -c \
#     'apk add --no-cache bash python3 curl >/dev/null && bash /repo/deploy/test_visitor_mirror.sh'
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKDIR="$(mktemp -d)"
PIDS=()
cleanup() {
  if [ -f "$WORKDIR/nginx.pid" ]; then kill "$(cat "$WORKDIR/nginx.pid")" 2>/dev/null || true; fi
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null || true; done
  rm -rf "$WORKDIR"
}
trap cleanup EXIT
mkdir -p "$WORKDIR"/{body,proxy,fastcgi,uwsgi,scgi}

freeport() {
  python3 - << 'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
}
LB_PORT="$(freeport)"; WEB_PORT="$(freeport)"; METRICS_PORT="$(freeport)"
APP_PORT="$(freeport)"; ORCH_PORT="$(freeport)"

cat > "$WORKDIR/stub.py" << 'PY'
import json, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

mode, port, log = sys.argv[1], int(sys.argv[2]), sys.argv[3]

class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _ok(self):
        body = b"backend\n"
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._ok()

    def do_HEAD(self):
        self.send_response(200)
        self.send_header("Content-Length", "8")
        self.end_headers()

    def do_POST(self):
        # Drain the body so a keep-alive connection stays in sync.
        self.rfile.read(int(self.headers.get("Content-Length") or 0))
        if mode == "orch" and self.path == "/api/target/visit":  # exact: no query string passed on
            with open(log, "a") as fh:
                fh.write(json.dumps({"method": "POST", "headers": {k.lower(): v for k, v in self.headers.items()}}) + "\n")
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.end_headers()
        else:
            self._ok()

    def log_message(self, *a):
        return

ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
PY

python3 "$WORKDIR/stub.py" app "$APP_PORT" /dev/null & PIDS+=($!)
python3 "$WORKDIR/stub.py" orch "$ORCH_PORT" "$WORKDIR/visits.log" & ORCH_PID=$!; PIDS+=($ORCH_PID)

# Pull the nginx.conf of the nginx-lb ConfigMap out of the manifest.
python3 - "$ROOT/k8s/02-target-app.yaml" "$WORKDIR/nginx.conf" "$LB_PORT" "$WEB_PORT" "$METRICS_PORT" "$APP_PORT" "$ORCH_PORT" "$WORKDIR" << 'PY'
import re, sys
src, out, lb, web, metrics, app, orch, work = sys.argv[1:]
lines = open(src).read().splitlines()
start = None
in_cm = False
for i, line in enumerate(lines):
    if line.strip() == "name: nginx-lb-config":
        in_cm = True
    if in_cm and line.startswith("  nginx.conf: |"):
        start = i + 1
        break
assert start is not None, "nginx-lb-config not found"
body = []
for line in lines[start:]:
    if line.strip() and not line.startswith("    "):
        break
    body.append(line[4:] if line.startswith("    ") else "")
conf = "\n".join(body) + "\n"
# Local ports and stub upstreams. Nothing else is changed.
conf = re.sub(r"listen 8090;", "listen 127.0.0.1:%s;" % lb, conf)
conf = re.sub(r"listen 80;", "listen 127.0.0.1:%s;" % web, conf)
conf = re.sub(r"listen 8091;", "listen 127.0.0.1:%s;" % metrics, conf)
conf = re.sub(r"server (target-app|dashboard|storefront):\d+", "server 127.0.0.1:%s" % app, conf)
conf = re.sub(r"server orchestrator:8082", "server 127.0.0.1:%s" % orch, conf)
conf = conf.replace("http {", "http {\n    client_body_temp_path %s/body;\n    proxy_temp_path %s/proxy;\n    fastcgi_temp_path %s/fastcgi;\n    uwsgi_temp_path %s/uwsgi;\n    scgi_temp_path %s/scgi;" % ((work,) * 5), 1)
open(out, "w").write(conf)
PY

G="pid $WORKDIR/nginx.pid; error_log $WORKDIR/error.log notice;"
nginx -t -c "$WORKDIR/nginx.conf" -g "$G"
nginx -c "$WORKDIR/nginx.conf" -g "$G"

LB="http://127.0.0.1:${LB_PORT}"
for _ in $(seq 1 50); do curl -sf -o /dev/null "$LB/healthz" && break; sleep 0.1; done
for port in "$APP_PORT" "$ORCH_PORT"; do
  for _ in $(seq 1 50); do curl -sf -o /dev/null "http://127.0.0.1:${port}/" && break; sleep 0.1; done
done

HTML='text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
UA_A='Mozilla/5.0 (Windows NT 10.0) Chrome/126.0'
UA_B='Mozilla/5.0 (iPhone) Safari/605.1'

code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

# Counted by nginx: 4 requests.
c1="$(code -A "$UA_A" -H "Accept: $HTML" -H "Cookie: session=secret" -H "Authorization: Bearer secret" -H "X-Forwarded-For: 9.9.9.9" "$LB/")"
c2="$(code -A "$UA_A" -H "Accept: $HTML" "$LB/")"
c3="$(code -A "$UA_B" -H "Accept: $HTML" "$LB/")"
c4="$(code -A "$UA_A" -H "Accept: $HTML" "$LB/?utm_source=whatsapp")"

# Not counted by nginx: replay header, API call, health, other file, POST, non-HTML.
n1="$(code -A "python-urllib3" -H "Accept: $HTML" -H "X-Load-Test: 1" "$LB/")"
n2="$(code -A "$UA_A" -H "Accept: $HTML" "$LB/api/products")"
n3="$(code -A "$UA_A" -H "Accept: $HTML" "$LB/healthz")"
n4="$(code -A "$UA_A" -H "Accept: $HTML" "$LB/assets/index.js")"
n5="$(code -A "$UA_A" -H "Accept: $HTML" -X POST -d x=1 "$LB/")"
n6="$(code "$LB/")"                                   # curl default Accept: */*
n7="$(code -A "$UA_A" -H "Accept: application/json" "$LB/")"
n8="$(code -A "$UA_A" -H "Accept: $HTML" -I "$LB/")"  # HEAD

sleep 1
visits="$WORKDIR/visits.log"
n_visits="$(wc -l < "$visits" | tr -d ' ')"

for c in "$c1" "$c2" "$c3" "$c4" "$n1" "$n2" "$n3" "$n4" "$n5" "$n6" "$n7" "$n8"; do
  if [ "$c" != "200" ]; then
    echo "a storefront response was $c, want 200. Codes: $c1 $c2 $c3 $c4 | $n1 $n2 $n3 $n4 $n5 $n6 $n7 $n8"
    tail -n 20 "$WORKDIR/error.log" || true
    exit 1
  fi
done
test "$n_visits" = "4" || { echo "orchestrator received $n_visits visits, want 4"; cat "$visits"; exit 1; }

python3 - "$visits" << 'PY'
import json, sys
rows = [json.loads(l) for l in open(sys.argv[1])]
for r in rows:
    h = r["headers"]
    assert h["x-visitor-ip"] == "127.0.0.1", h
    assert h["x-orig-method"] == "GET", h
    assert h["x-orig-uri"] in ("/", "/?utm_source=whatsapp"), h
    assert "text/html" in h["accept"], h
    assert "cookie" not in h and "authorization" not in h, "credentials were forwarded: %r" % h
    assert not h.get("x-forwarded-for"), "client X-Forwarded-For was forwarded: %r" % h
    assert not h.get("x-load-test"), h
    assert "user-agent" in h, h
agents = sorted(set(r["headers"]["user-agent"] for r in rows))
assert len(agents) == 2, agents
print("orchestrator saw %d visits from %d user agents" % (len(rows), len(agents)))
PY

# A dead orchestrator must not slow or break the page.
kill "$ORCH_PID"; wait "$ORCH_PID" 2>/dev/null || true
read -r d1 d1_time < <(curl -s -o /dev/null -w "%{http_code} %{time_total}\n" -A "$UA_A" -H "Accept: $HTML" "$LB/")
test "$d1" = "200" || { echo "storefront returned $d1 with the orchestrator down"; exit 1; }
elapsed_ms="$(python3 -c "print(int(float('$d1_time') * 1000))")"
test "$elapsed_ms" -lt 500 || { echo "page took ${elapsed_ms} ms with the orchestrator down"; exit 1; }

echo "visitor mirror ok: 4 of 12 requests counted (browser loads of /), replay/API/health/POST/HEAD/non-HTML left out, no cookies or X-Forwarded-For sent, page unaffected with orchestrator down (${elapsed_ms} ms)"
