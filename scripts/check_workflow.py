"""Live end-to-end workflow smoke test."""
import json
import time
import urllib.request

SIMULATOR = "http://localhost:8083"


def get(url):
    return json.loads(urllib.request.urlopen(url, timeout=5).read())


def post(url, data):
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    return json.loads(urllib.request.urlopen(req, timeout=10).read())


def main():
    workload = [50] * 5 + [50 + int(2450 * (i / 5)) for i in range(5)] + [2500] * 10 + [100] * 5
    print("Starting flash sale simulation...")
    post(f"{SIMULATOR}/start-simulation", {"workload": workload})

    peak_rps = 0
    max_servers = 0
    violations = 0
    saw_upper = False

    for i in range(25):
        m = get(f"{SIMULATOR}/metrics")
        rps = int(m.get("current_rps", 0))
        servers = int(m.get("active_servers", 0))
        violations = int(m.get("violations", 0))
        upper = m.get("predicted_upper", 0)
        if isinstance(upper, list):
            upper = upper[-1] if upper else 0
        peak_rps = max(peak_rps, rps)
        max_servers = max(max_servers, servers)
        if float(upper) > 500:
            saw_upper = True
        if i in (0, 5, 10, 15, 20, 24):
            print(
                f"  t+{i+1}s RPS={rps} servers={servers} violations={violations} "
                f"upper={float(upper):.0f} status={m.get('status')}"
            )
        time.sleep(1)

    ok = peak_rps >= 2000 and max_servers >= 50 and violations == 0 and saw_upper
    print("--- LIVE WORKFLOW RESULT ---")
    print(f"Peak RPS: {peak_rps}")
    print(f"Max servers: {max_servers}")
    print(f"SLA violations: {violations}")
    print(f"Prediction band expanded: {saw_upper}")
    print(f"RESULT: {'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
