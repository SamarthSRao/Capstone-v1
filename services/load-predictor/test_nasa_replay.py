"""Replay schedule. No network."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "deploy"))

from nasa_replay import load_rps, schedule, shard_count

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


if __name__ == "__main__":
    unittest.main()
