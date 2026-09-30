"""Replay the compressed NASA morning against the storefront.

Each row of the CSV is one demo second and an RPS target. This process sends
its share of that target during the second, then moves on, and repeats the
file --loops times. It does not try to catch up if the app falls behind, so
the shape stays the one the forecaster was trained on.

One Python process opening a new TCP connection per request tops out around
180-260 RPS. The in-cluster Job therefore runs N copies (an indexed Job).
Shard i of N sends round(target)/N of the rate, with the remainder on the
lower indexes, over keep-alive connections. Logs print achieved RPS next to
the full target and this shard's share.

Stdlib only, so the Job can use python:3.12-slim.

    python deploy/nasa_replay.py --host http://127.0.0.1:8090/ --loops 3
    REPLAY_SHARDS=4 JOB_COMPLETION_INDEX=0 python deploy/nasa_replay.py --host http://nginx-lb:8090/
"""

from __future__ import annotations

import argparse
import csv
import http.client
import os
import queue
import sys
import threading
import time
from urllib.parse import urlsplit


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


def shard_count(target_rps, shards, index):
    """Requests this shard should start during one second.

    round(target) is split as evenly as possible. The remainder goes to the
    lower indexes so the shards together match the rounded target.
    """
    if shards < 1:
        raise ValueError("shards must be >= 1")
    if index < 0 or index >= shards:
        raise ValueError("index %s out of range for %s shards" % (index, shards))
    total = int(round(float(target_rps)))
    if total < 0:
        total = 0
    base, rem = divmod(total, shards)
    if index < rem:
        return base + 1
    return base


def _env_int(name, default):
    raw = os.environ.get(name, "")
    if raw == "":
        return default
    return int(raw)


class _Pool:
    """Fixed set of threads, each holding one keep-alive connection."""

    def __init__(self, url, workers, timeout):
        parts = urlsplit(url)
        if parts.scheme not in ("http", "https"):
            raise ValueError("host must start with http:// or https://")
        if not parts.hostname:
            raise ValueError("host is missing a hostname")
        self.parts = parts
        self.path = parts.path or "/"
        if not self.path.startswith("/"):
            self.path = "/" + self.path
        self.timeout = timeout
        self.jobs = queue.Queue(maxsize=max(1, workers))
        self._lock = threading.Lock()
        self.completed = 0
        self.ok = 0
        self._threads = []
        for _ in range(max(1, workers)):
            thread = threading.Thread(target=self._worker, daemon=True)
            thread.start()
            self._threads.append(thread)

    def _connect(self):
        port = self.parts.port
        if self.parts.scheme == "https":
            return http.client.HTTPSConnection(
                self.parts.hostname, port or 443, timeout=self.timeout
            )
        return http.client.HTTPConnection(
            self.parts.hostname, port or 80, timeout=self.timeout
        )

    def _fetch(self, conn):
        conn.request("GET", self.path, headers={"Connection": "keep-alive"})
        response = conn.getresponse()
        response.read()
        return 200 <= response.status < 400

    def _worker(self):
        conn = None
        while True:
            item = self.jobs.get()
            if item is None:
                if conn is not None:
                    conn.close()
                return
            if conn is None:
                try:
                    conn = self._connect()
                except OSError:
                    self._mark(False)
                    continue
            try:
                good = self._fetch(conn)
            except (http.client.HTTPException, OSError, TimeoutError):
                try:
                    conn.close()
                except OSError:
                    pass
                conn = None
                self._mark(False)
                continue
            self._mark(good)

    def _mark(self, good):
        with self._lock:
            self.completed += 1
            if good:
                self.ok += 1

    def counts(self):
        with self._lock:
            return self.completed, self.ok

    def offer(self, n, deadline):
        """Enqueue up to n requests, stopping at deadline. Returns how many were queued."""
        sent = 0
        while sent < n and time.perf_counter() < deadline:
            remaining = deadline - time.perf_counter()
            if remaining <= 0:
                break
            try:
                self.jobs.put(True, timeout=min(0.02, remaining))
            except queue.Full:
                continue
            sent += 1
        return sent

    def close(self):
        for _ in self._threads:
            self.jobs.put(None)
        for thread in self._threads:
            thread.join(timeout=self.timeout + 1)


def replay(url, rps_values, loops, workers, timeout, log_every, shards=1, index=0):
    """Issue this shard's share of the schedule.

    Returns (attempted, ok, completed).
    """
    pool = _Pool(url, workers, timeout)
    attempted = 0
    started_at = time.perf_counter()
    window_at = started_at
    window_target = 0.0
    window_share = 0
    window_steps = 0
    _, window_completed = pool.counts()
    try:
        for step, target in enumerate(schedule(rps_values, loops)):
            tick = time.perf_counter()
            share = shard_count(target, shards, index)
            deadline = tick + 1.0
            attempted += pool.offer(share, deadline)
            remaining = deadline - time.perf_counter()
            if remaining > 0:
                time.sleep(remaining)
            window_target += target
            window_share += share
            window_steps += 1
            if log_every and step % log_every == 0:
                now = time.perf_counter()
                completed, ok = pool.counts()
                span = now - window_at
                achieved = (completed - window_completed) / span if span > 0 else 0.0
                # achieved_rps is this shard. Compare it to mean_shard_target_rps.
                # Sum achieved_rps across shards to compare with mean_target_rps.
                print(
                    "t=%ds target_rps=%.0f shard=%d/%d shard_target_rps=%d achieved_rps=%.0f mean_target_rps=%.0f mean_shard_target_rps=%.0f ok=%d"
                    % (
                        step,
                        target,
                        index,
                        shards,
                        share,
                        achieved,
                        window_target / window_steps,
                        window_share / window_steps,
                        ok,
                    ),
                    flush=True,
                )
                window_at = now
                window_target = 0.0
                window_share = 0
                window_steps = 0
                window_completed = completed
    finally:
        pool.close()
    completed, ok = pool.counts()
    return attempted, ok, completed


def main():
    parser = argparse.ArgumentParser(description="Replay nasa_demo_window_10min.csv")
    parser.add_argument("--host", required=True, help="storefront base URL, for example http://nginx-lb:8090/")
    parser.add_argument("--csv", default="nasa_demo_window_10min.csv")
    parser.add_argument("--loops", type=int, default=3)
    parser.add_argument("--workers", type=int, default=32)
    parser.add_argument("--timeout", type=float, default=2.0)
    parser.add_argument("--log-every", type=int, default=30)
    parser.add_argument("--shards", type=int, default=_env_int("REPLAY_SHARDS", 1))
    parser.add_argument("--index", type=int, default=_env_int("JOB_COMPLETION_INDEX", 0))
    args = parser.parse_args()
    if args.shards < 1:
        print("shards must be >= 1", file=sys.stderr)
        sys.exit(2)
    series = load_rps(args.csv)
    peak = max(series)
    print(
        "replaying %d seconds x %d loops against %s shard=%d/%d peak_target_rps=%.0f shard_peak_rps=%d"
        % (
            len(series),
            args.loops,
            args.host,
            args.index,
            args.shards,
            peak,
            shard_count(peak, args.shards, args.index),
        ),
        flush=True,
    )
    started = time.perf_counter()
    attempted, ok, completed = replay(
        args.host,
        series,
        args.loops,
        args.workers,
        args.timeout,
        args.log_every,
        args.shards,
        args.index,
    )
    elapsed = time.perf_counter() - started
    achieved = completed / elapsed if elapsed > 0 else 0.0
    offered = attempted / elapsed if elapsed > 0 else 0.0
    print(
        "summary shard=%d/%d attempted=%d completed=%d ok=%d elapsed=%.1fs achieved_rps=%.0f offered_rps=%.0f"
        % (args.index, args.shards, attempted, completed, ok, elapsed, achieved, offered),
        flush=True,
    )
    if ok == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
