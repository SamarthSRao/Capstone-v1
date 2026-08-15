import urllib.request
import json
import time
import sys

URL = "http://localhost:8083/metrics"


def evaluate(duration=60):
    print(f"\n[SLA Evaluator] Monitoring {duration}s...\n")

    samples = []

    for i in range(duration):
        try:
            with urllib.request.urlopen(URL, timeout=2) as response:
                data = json.loads(response.read())

            samples.append(data)

            rps = int(data.get("current_rps", 0))

            bar = "█" * min(int(rps / 50), 40)

            print(
                f"  [{i + 1:3d}s] "
                f"RPS: {rps:5d} |{bar:<40}",
                end="\r",
            )

        except Exception as e:
            print(
                f"  [{i + 1:3d}s] Poll failed: {e}",
                end="\r",
            )

        time.sleep(1)

    if not samples:
        print(
            "\n❌ No data. Is the Simulator running?"
        )
        sys.exit(1)

    # ---------------------------------------------------------
    # Calculate metrics
    # ---------------------------------------------------------

    max_rps = max(
        int(s.get("current_rps", 0))
        for s in samples
    )

    total_requests = sum(
        int(s.get("current_rps", 0))
        for s in samples
    )

    # Simulator violations appear to be cumulative,
    # therefore use the final value.
    violations = int(
        samples[-1].get("violations", 0)
    )

    max_servers = max(
        int(s.get("active_servers", 0))
        for s in samples
    )

    sla_pct = (
        (total_requests - violations)
        / max(total_requests, 1)
    ) * 100

    sla_pct = max(0.0, min(100.0, sla_pct))

    # ---------------------------------------------------------
    # Report
    # ---------------------------------------------------------

    print("\n")
    print("=" * 55)
    print(f"  SLA EVALUATION REPORT — {duration}s")
    print("=" * 55)

    print(
        f"  Max RPS Reached:          "
        f"{max_rps:>8,}"
    )

    print(
        f"  Total Requests (est.):    "
        f"{total_requests:>8,}"
    )

    print(
        f"  Total SLA Violations:     "
        f"{violations:>8,}"
    )

    print(
        f"  Max Servers Provisioned:  "
        f"{max_servers:>8}"
    )

    print(
        f"  Overall SLA Reliability:  "
        f"{sla_pct:>7.1f}%"
    )

    print("=" * 55)

    # ---------------------------------------------------------
    # Pass / Fail
    # ---------------------------------------------------------

    if sla_pct >= 98.0:
        print("  ✅ PASS — SLA ≥ 98%\n")
        sys.exit(0)

    else:
        print(
            f"  ❌ FAIL — SLA {sla_pct:.1f}% < 98%\n"
        )
        sys.exit(1)


if __name__ == "__main__":
    duration = (
        int(sys.argv[1])
        if len(sys.argv) > 1
        else 60
    )

    evaluate(duration)