"""Replay the compressed NASA morning against the storefront.

Each row of the CSV is one demo second and an RPS target. The script opens
about that many GET / requests during the second, then moves on, and repeats
the file --loops times. It does not try to catch up if the app falls behind,
so the shape stays the one the forecaster was trained on.

Stdlib only, so the in-cluster Job can use python:3.12-slim.

    python deploy/nasa_replay.py --host http://127.0.0.1:8090/ --loops 3
"""

from __future__ import annotations

import argparse
import csv
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor


def load_rps(path):
    values = []
    with open(path, newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None or "rps" not in reader.fieldnames:
            raise ValueError("expected an rps column in %s" % path)
        for row in reader:
            values.append(float(row["rps"]))
    if not values:
        raise ValueError("no rows in %s" % path)
    return values


def schedule(rps, loops):
    if loops < 1:
        raise ValueError("loops must be >= 1")
    for _ in range(loops):
        for value in rps:
            yield value


def _get(url, timeout):
    request = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            response.read(64)
    except (urllib.error.URLError, TimeoutError, OSError):
        return False
    return True


def replay(url, rps_values, loops, workers, timeout, log_every):
    """Issue requests for each second of the schedule. Returns (attempted, ok)."""
    if not url.endswith("/"):
        url += "/"
    attempted = 0
    ok = 0
    lock = threading.Lock()

    pool = ThreadPoolExecutor(max_workers=workers)
    slots = threading.Semaphore(workers)
    started_at = time.perf_counter()

    def one():
        nonlocal ok
        try:
            if _get(url, timeout):
                with lock:
                    ok += 1
        finally:
            slots.release()

    try:
        for index, target in enumerate(schedule(rps_values, loops)):
            tick = time.perf_counter()
            n = max(0, int(round(target)))
            deadline = tick + 1.0
            sent = 0
            while sent < n and time.perf_counter() < deadline:
                if not slots.acquire(timeout=0.02):
                    continue
                pool.submit(one)
                sent += 1
            attempted += sent
            remaining = deadline - time.perf_counter()
            if remaining > 0:
                time.sleep(remaining)
            if log_every and index % log_every == 0:
                print(
                    "t=%ds target=%.0f sent=%d ok=%d elapsed=%.0fs"
                    % (index, target, sent, ok, time.perf_counter() - started_at),
                    flush=True,
                )
    finally:
        pool.shutdown(wait=True, cancel_futures=False)
    return attempted, ok


def main():
    parser = argparse.ArgumentParser(description="Replay nasa_demo_window_10min.csv")
    parser.add_argument("--host", required=True, help="storefront base URL, for example http://nginx-lb:8090/")
    parser.add_argument("--csv", default="nasa_demo_window_10min.csv")
    parser.add_argument("--loops", type=int, default=3)
    parser.add_argument("--workers", type=int, default=128)
    parser.add_argument("--timeout", type=float, default=2.0)
    parser.add_argument("--log-every", type=int, default=30)
    args = parser.parse_args()
    series = load_rps(args.csv)
    print("replaying %d seconds x %d loops against %s" % (len(series), args.loops, args.host), flush=True)
    attempted, ok = replay(args.host, series, args.loops, args.workers, args.timeout, args.log_every)
    print("done attempted=%d ok=%d" % (attempted, ok), flush=True)
    if ok == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
