"""Replay schedule. No network."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "deploy"))

from nasa_replay import load_rps, schedule

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


if __name__ == "__main__":
    unittest.main()
