"""Fast demo replay: --start-offset and the 07b manifest. Local only."""
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, os.path.join(ROOT, "deploy"))

try:
    import yaml
except ImportError:  # PyYAML is not in requirements.txt
    yaml = None

from nasa_replay import load_rps, replay, schedule  # noqa: E402
from render_nasa_job import FAST_START_OFFSET  # noqa: E402

CSV = os.path.join(ROOT, "deploy", "nasa_demo_window_10min.csv")


class StartOffsetTest(unittest.TestCase):
    def test_default_offset_plays_whole_file(self):
        series = load_rps(CSV)
        self.assertEqual(list(schedule(series, 1)), series)
        self.assertEqual(list(schedule(series, 2, 0)), series * 2)

    def test_offset_skips_first_pass_only(self):
        series = [1.0, 2.0, 3.0, 4.0]
        self.assertEqual(list(schedule(series, 1, 2)), [3.0, 4.0])
        self.assertEqual(list(schedule(series, 2, 3)), [4.0, 1.0, 2.0, 3.0, 4.0])

    def test_offset_out_of_range(self):
        for bad in (-1, 4, 10):
            with self.assertRaises(ValueError):
                list(schedule([1.0, 2.0, 3.0, 4.0], 1, bad))

    def test_fast_offset_is_quiet_history_before_the_ramp(self):
        series = load_rps(CSV)
        history = series[FAST_START_OFFSET:FAST_START_OFFSET + 24]
        # 24 samples of quiet history (the orchestrator's window), all well under one pod.
        self.assertEqual(len(history), 24)
        self.assertLess(max(history), 120)
        # The climb follows: one pod (200 RPS) is first exceeded within two minutes.
        first_over = next(i for i, v in enumerate(series) if v > 200)
        self.assertGreater(first_over - FAST_START_OFFSET, 60)
        self.assertLess(first_over - FAST_START_OFFSET, 120)
        # And the peak (about 694 RPS) is still in the played part.
        self.assertEqual(max(series[FAST_START_OFFSET:]), max(series))


@unittest.skipIf(yaml is None, "PyYAML not installed")
class FastManifestTest(unittest.TestCase):
    def load(self, name):
        with open(os.path.join(ROOT, "k8s", name)) as handle:
            return list(yaml.safe_load_all(handle))

    def test_fast_job_is_separate_and_plays_once_from_offset(self):
        config, job = self.load("07b-fast-demo-replay-job.yaml")
        self.assertEqual(config["metadata"]["name"], "fast-demo-replay")
        self.assertEqual(job["metadata"]["name"], "fast-demo-replay")
        spec = job["spec"]["template"]["spec"]
        self.assertEqual(spec["volumes"][0]["configMap"]["name"], "fast-demo-replay")
        args = spec["containers"][0]["args"]
        self.assertEqual(args[args.index("--loops") + 1], "1")
        self.assertEqual(args[args.index("--start-offset") + 1], str(FAST_START_OFFSET))

    def test_original_job_unchanged(self):
        _, job = self.load("07-nasa-replay-job.yaml")
        self.assertEqual(job["metadata"]["name"], "nasa-replay")
        args = job["spec"]["template"]["spec"]["containers"][0]["args"]
        self.assertEqual(args[args.index("--loops") + 1], "3")
        self.assertNotIn("--start-offset", args)

    def test_manifests_embed_current_player_and_csv(self):
        with open(os.path.join(ROOT, "deploy", "nasa_replay.py")) as handle:
            script = handle.read()
        with open(CSV) as handle:
            csv_text = handle.read()
        for name in ("07-nasa-replay-job.yaml", "07b-fast-demo-replay-job.yaml"):
            config = self.load(name)[0]
            self.assertEqual(config["data"]["nasa_replay.py"].strip(), script.strip(), name)
            self.assertEqual(config["data"]["nasa_demo_window_10min.csv"].strip(), csv_text.strip(), name)


class ReplayFromOffsetTest(unittest.TestCase):
    def test_replay_sends_the_offset_rows(self):
        hits = []

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def do_GET(self):
                hits.append(self.path)
                self.send_response(200)
                self.send_header("Content-Length", "2")
                self.end_headers()
                self.wfile.write(b"ok")

            def log_message(self, fmt, *args):
                return

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            url = "http://127.0.0.1:%d/" % server.server_address[1]
            # Rows 0-1 would send 50 each; offset 2 plays only 3 + 4 requests.
            attempted, ok, completed = replay(url, [50, 50, 3, 4], 1, 2, 2.0, 0, start_offset=2)
        finally:
            server.shutdown()
        self.assertEqual(attempted, 7)
        self.assertEqual(ok, 7)
        self.assertEqual(len(hits), 7)


if __name__ == "__main__":
    unittest.main()
