"""Replay schedule, and the header that keeps replay traffic out of the visitor count."""
import os
import sys
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "deploy"))

from nasa_replay import _Pool, load_rps, schedule, shard_count

CSV = os.path.join(os.path.dirname(__file__), "..", "..", "deploy", "nasa_demo_window_10min.csv")


class ReplayScheduleTest(unittest.TestCase):
    def test_csv_and_loops(self):
        series = load_rps(CSV)
        self.assertGreater(len(series), 500)
        self.assertLess(series[0], 120)
        self.assertGreater(max(series), 600)
        played = list(schedule(series, 3))
        self.assertEqual(len(played), len(series) * 3)
        self.assertEqual(played[len(series)], series[0])

    def test_shard_shares_sum_to_rounded_target(self):
        # Peak of the replay is about 681. Four shards must cover that,
        # with the remainder on the lower indexes only.
        total = int(round(681.4))
        shares = [shard_count(681.4, 4, i) for i in range(4)]
        self.assertEqual(sum(shares), total)
        self.assertEqual(shares, [171, 170, 170, 170])
        self.assertEqual(shard_count(800, 1, 0), 800)
        self.assertEqual(shard_count(10, 4, 0), 3)
        self.assertEqual(shard_count(10, 4, 3), 2)
        with self.assertRaises(ValueError):
            shard_count(10, 4, 4)


class ReplayHeaderTest(unittest.TestCase):
    def test_every_request_carries_x_load_test(self):
        seen = []

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def do_GET(self):
                seen.append((self.path, self.headers.get("X-Load-Test"), self.headers.get("Accept")))
                self.send_response(200)
                self.send_header("Content-Length", "2")
                self.end_headers()
                self.wfile.write(b"ok")

            def log_message(self, fmt, *args):
                return

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            pool = _Pool("http://127.0.0.1:%d/" % server.server_address[1], 2, 2.0)
            self.assertEqual(pool.offer(5, time.perf_counter() + 5), 5)
            deadline = time.time() + 5
            while pool.counts()[0] < 5 and time.time() < deadline:
                time.sleep(0.01)
            pool.close()
        finally:
            server.shutdown()
        self.assertEqual(len(seen), 5)
        for path, marker, accept in seen:
            self.assertEqual(path, "/")
            self.assertEqual(marker, "1")
            # No text/html: it never looks like a browser page load either.
            self.assertFalse(accept and "text/html" in accept)


if __name__ == "__main__":
    unittest.main()
