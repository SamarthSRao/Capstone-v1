#!/usr/bin/env python3
"""
Remote Internet Load Test Driver
Replays e-commerce flash sale traffic curves against the live cloud website.
Usage:
    python remote_load_test.py --target http://<PUBLIC_IP>:8090 --duration 60
"""

import argparse
import concurrent.futures
import json
import random
import sys
import time
import urllib.request
import urllib.error

def send_request(base_url):
    t0 = time.time()
    endpoint = "/api/checkout" if random.random() < 0.4 else "/"
    url = f"{base_url}{endpoint}"
    
    try:
        if endpoint == "/api/checkout":
            payload = json.dumps({
                "product_id": random.randint(1, 6),
                "quantity": 1,
                "session_id": f"shopper-{random.randint(1000, 9999)}"
            }).encode('utf-8')
            req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        else:
            req = urllib.request.Request(url)

        with urllib.request.urlopen(req, timeout=3.0) as resp:
            status = resp.status
            served_by = resp.headers.get("X-Served-By", "unknown")
            latency = (time.time() - t0) * 1000
            return status, latency, served_by
    except Exception as e:
        latency = (time.time() - t0) * 1000
        return 500, latency, "error"

def run_load_test(target_url, duration=60):
    print("=" * 65)
    print(f" 🚀 LAUNCHING LIVE INTERNET TRAFFIC BURST AGAINST:")
    print(f"    {target_url}")
    print("=" * 65)
    print(" Time | Target RPS | Actual RPS | p50 (ms) | p99 (ms) | Replicas Observed")
    print("-" * 65)

    # Flash sale profile: 60-second curve
    # 0-10s: Baseline (30 RPS)
    # 10-25s: Sudden Surge (300 -> 800 RPS)
    # 25-45s: Peak Flash Sale (1,000 RPS)
    # 45-60s: Cooldown (30 RPS)

    start_time = time.time()
    replicas_seen = set()

    for sec in range(duration):
        if sec < 10:
            target_rps = 30
        elif sec < 20:
            target_rps = int(30 + (sec - 10) * 70) # 30 -> 730
        elif sec < 40:
            target_rps = 900
        elif sec < 50:
            target_rps = int(900 - (sec - 40) * 80) # 900 -> 100
        else:
            target_rps = 30

        sec_start = time.time()
        latencies = []
        statuses = []

        # Dispatch requests concurrently
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(target_rps, 150)) as executor:
            futures = [executor.submit(send_request, target_url) for _ in range(target_rps)]
            for f in concurrent.futures.as_completed(futures):
                status, latency, served_by = f.result()
                latencies.append(latency)
                statuses.append(status)
                if served_by not in ("unknown", "error"):
                    replicas_seen.add(served_by)

        actual_rps = len(statuses)
        p50 = sorted(latencies)[int(len(latencies) * 0.50)] if latencies else 0
        p99 = sorted(latencies)[int(len(latencies) * 0.99)] if latencies else 0

        bar = "█" * min(int(actual_rps / 30), 20)
        print(f" {sec+1:3d}s | {target_rps:8d} | {actual_rps:8d} | {p50:6.1f}ms | {p99:6.1f}ms | {len(replicas_seen)} instances {bar}")

        # Maintain 1-second cadence
        elapsed = time.time() - sec_start
        if elapsed < 1.0:
            time.sleep(1.0 - elapsed)

    print("-" * 65)
    print(f" Traffic test completed successfully!")
    print(f" Unique container replicas handling load: {list(replicas_seen)}")
    print("=" * 65)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Remote load test driver")
    parser.add_argument("--target", default="http://localhost:8090", help="Target website URL")
    parser.add_argument("--duration", type=int, default=60, help="Duration in seconds")
    args = parser.parse_args()

    run_load_test(args.target, args.duration)
