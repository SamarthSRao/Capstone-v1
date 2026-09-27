"""Poll simulator metrics while Locust runs; report if organic RPS moves above idle."""
import json
import subprocess
import sys
import time
import urllib.request

METRICS_URL = "http://localhost:8083/metrics"
IDLE_BASELINE = 50


def fetch_metrics():
    with urllib.request.urlopen(METRICS_URL, timeout=5) as resp:
        return json.loads(resp.read())


def main():
    samples = []
    proc = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "locust",
            "-f",
            "tests/load/flash_sale_spike.py",
            "--host",
            "http://localhost:8080",
            "--headless",
            "-u",
            "15",
            "-r",
            "5",
            "-t",
            "20s",
            "--only-summary",
        ],
        cwd=r"c:\Users\samar\OneDrive\Desktop\family\capstone\Capstone-v1",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    start = time.time()
    while proc.poll() is None:
        try:
            m = fetch_metrics()
            samples.append(
                {
                    "t": round(time.time() - start, 1),
                    "current_rps": m.get("current_rps"),
                    "status": m.get("status"),
                    "server_count": m.get("server_count"),
                }
            )
        except Exception as exc:
            samples.append({"t": round(time.time() - start, 1), "error": str(exc)})
        time.sleep(1)

    out = proc.stdout.read() if proc.stdout else ""
    peak_rps = max((s.get("current_rps", 0) or 0) for s in samples)
    above_idle = [s for s in samples if (s.get("current_rps") or 0) > IDLE_BASELINE + 10]

    print("=== METRICS SAMPLES ===")
    for s in samples:
        print(s)
    print(f"\nPeak RPS observed: {peak_rps}")
    print(f"Samples above idle ({IDLE_BASELINE}+10): {len(above_idle)} / {len(samples)}")
    print("\n=== LOCUST OUTPUT ===")
    print(out[-3000:] if len(out) > 3000 else out)

    ok = peak_rps > IDLE_BASELINE + 10 and "41.86%" not in out and "100.00%" not in out
    # pass if RPS moved and failure rate under 50%
    if "Aggregated" in out:
        for line in out.splitlines():
            if "Aggregated" in line and "fails" in out:
                pass
    fail_lines = [l for l in out.splitlines() if "Aggregated" in l and "|" in l]
    fail_pct = 100.0
    if fail_lines:
        parts = fail_lines[-1].split("|")
        for p in parts:
            p = p.strip()
            if "(" in p and "%" in p:
                try:
                    fail_pct = float(p.split("(")[1].split("%")[0])
                except ValueError:
                    pass

    print(f"\nLocust fail rate: {fail_pct}%")
    working = peak_rps > IDLE_BASELINE + 10 and fail_pct < 50
    print(f"\nORGANIC FLOW WORKING: {working}")
    return 0 if working else 1


if __name__ == "__main__":
    raise SystemExit(main())
