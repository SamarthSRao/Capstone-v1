import json
import time
import urllib.request

SIM = "http://localhost:8083"


def get_metrics():
    with urllib.request.urlopen(f"{SIM}/metrics", timeout=5) as r:
        return json.loads(r.read())


workload = [
    50, 55, 60, 65, 70, 80, 100, 200, 500, 1000,
    1800, 2200, 2500, 2500, 2400, 2000, 1500, 1000,
    600, 400, 250, 150, 100, 80, 65, 55, 50, 50,
    50, 50,
]
req = urllib.request.Request(
    f"{SIM}/start-simulation",
    data=json.dumps({"workload": workload}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
urllib.request.urlopen(req)
print("Peak window trace (25s):")
for i in range(25):
    m = get_metrics()
    rps = int(m["current_rps"])
    v = int(m["violations"])
    sla = float(m["sla_reliability"])
    badge = "High Demand +30%" if rps > 2000 else ("Surge +15%" if rps > 1000 else "none")
    banner = v > 0 and sla < 99.5
    print(
        f"  t+{i+1:2d}s  status={m['status']:10s}  RPS={rps:5d}  "
        f"violations={v:4d}  SLA={sla:6.2f}%  badge={badge:18s}  banner={banner}"
    )
    time.sleep(1)
