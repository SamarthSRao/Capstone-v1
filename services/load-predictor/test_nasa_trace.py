"""Data prep and the lead-time metric. Does not load model weights."""
import os
import unittest
from datetime import datetime, timedelta

import numpy as np

from nasa_trace import (
    COMPRESSION_SECONDS,
    OUTAGE_END,
    OUTAGE_START,
    PEAK_RPS,
    compress_segment,
    contiguous_segments,
    crossing_lead_seconds,
    in_outage,
    load_minute_counts,
    make_windows,
    median_lead,
    prepare_trace,
    select_forecast_mean,
)

TRACE = os.path.join(os.path.dirname(__file__), "data", "nasa_per_minute.csv")
DEMO = os.path.join(os.path.dirname(__file__), "..", "..", "deploy", "nasa_demo_window_10min.csv")


class OutageTests(unittest.TestCase):
    def test_bounds_are_inclusive(self):
        self.assertTrue(in_outage(OUTAGE_START))
        self.assertTrue(in_outage(OUTAGE_END))
        self.assertTrue(in_outage(datetime(1995, 8, 2, 12, 0)))
        self.assertFalse(in_outage(datetime(1995, 8, 1, 14, 51)))
        self.assertFalse(in_outage(datetime(1995, 8, 3, 4, 37)))

    def test_real_trace_drops_the_gap_and_does_not_bridge_it(self):
        times, counts = load_minute_counts(TRACE)
        self.assertGreater(len(times), 80_000)
        segments = contiguous_segments(times, counts)
        self.assertGreaterEqual(len(segments), 2)
        for seg_times, seg_counts in segments:
            for when, count in zip(seg_times, seg_counts):
                self.assertFalse(in_outage(when))
            # Zeros inside the outage must not survive as a flat bridge.
            span_hours = (seg_times[-1] - seg_times[0]).total_seconds() / 3600.0
            if seg_times[0] < OUTAGE_START:
                self.assertLess(seg_times[-1], OUTAGE_START)
            if seg_times[0] > OUTAGE_END:
                self.assertGreater(seg_times[0], OUTAGE_END)
            self.assertLess(span_hours, 24 * 40)
        # The minute on each side of the gap is still present.
        kept = {t for seg_times, _ in segments for t in seg_times}
        self.assertIn(datetime(1995, 8, 1, 14, 51), kept)
        self.assertIn(datetime(1995, 8, 3, 4, 37), kept)
        self.assertNotIn(OUTAGE_START, kept)
        # 28-31 July is a second zero run. It is not the August outage and
        # the loader leaves it in the series on purpose.
        self.assertFalse(in_outage(datetime(1995, 7, 28, 13, 33)))
        self.assertIn(datetime(1995, 7, 28, 13, 33), kept)
        self.assertIn(datetime(1995, 7, 31, 23, 59), kept)
        self.assertNotIn(OUTAGE_END, kept)


class CompressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.trace = prepare_trace(TRACE)

    def test_cadence_is_one_demo_second_per_compression_step(self):
        times, _ = compress_segment(
            [datetime(1995, 7, 13, 3, 30) + timedelta(minutes=i) for i in range(30)],
            np.full(30, 60.0),
        )
        self.assertGreater(len(times), 2)
        step = (times[1] - times[0]) / np.timedelta64(1, "s")
        self.assertEqual(int(step), COMPRESSION_SECONDS)

    def test_trace_peak_is_the_requested_rps_and_holdout_days_are_absent(self):
        overall = max(float(rps.max()) for _, rps in self.trace.segments)
        self.assertAlmostEqual(overall, PEAK_RPS, delta=1.0)
        self.assertGreater(self.trace.scale, 100)
        self.assertLess(self.trace.scale, 160)
        train_days = set()
        for times, _ in self.trace.iter_segments(holdout=False):
            train_days.update(str(stamp)[:10] for stamp in times)
        for day in self.trace.holdout_dates:
            self.assertNotIn(day, train_days)
            _, hold = self.trace.day_series(day)
            self.assertGreater(len(hold), 100)
        # The replay file peaks near 700 RPS. The same morning, after this
        # scale, should land in that band rather than thousands of RPS.
        times, rps = self.trace.day_series("1995-07-13")
        start = np.datetime64("1995-07-13T03:30:00")
        end = np.datetime64("1995-07-13T10:09:00")
        window = rps[(times >= start) & (times <= end)]
        self.assertGreater(float(window.max()), 700)
        self.assertLess(float(window.max()), 800)

    def test_demo_morning_shape_matches_the_attached_window(self):
        import csv

        times, rps = self.trace.day_series("1995-07-13")
        start = np.datetime64("1995-07-13T03:30:00")
        end = np.datetime64("1995-07-13T10:09:00")
        mask = (times >= start) & (times <= end)
        ours = rps[mask]
        self.assertGreater(len(ours), 400)
        with open(DEMO, newline="") as handle:
            attached = [float(row["rps"]) for row in csv.DictReader(handle)]
        attached = np.asarray(attached, dtype=np.float64)
        # Same shape, possibly a different absolute scale (train-peak 750 vs
        # the attached file's ~133x). Correlation is the check.
        grid = np.linspace(0.0, 1.0, 400)
        a = np.interp(grid, np.linspace(0.0, 1.0, len(ours)), ours)
        b = np.interp(grid, np.linspace(0.0, 1.0, len(attached)), attached)
        corr = float(np.corrcoef(a, b)[0, 1])
        self.assertGreater(corr, 0.9, "compressed Jul 13 morning correlation %.3f" % corr)


class LeadTimeTests(unittest.TestCase):
    def test_horizon_shift_leads_by_the_horizon(self):
        # 1 RPS per second ramp. A forecast that is the truth 30s ahead
        # must first clear 200 RPS thirty seconds before the live series does.
        actual = np.arange(0, 500, dtype=np.float64)
        horizon = 30
        forecast = np.concatenate([actual[horizon:], np.full(horizon, actual[-1])])
        leads = crossing_lead_seconds(actual, forecast, 200)
        self.assertEqual(leads, [horizon])
        self.assertEqual(median_lead(actual, forecast, [200, 400])[400], horizon)

    def test_nowcast_does_not_lead(self):
        actual = np.arange(0, 500, dtype=np.float64)
        leads = crossing_lead_seconds(actual, actual, 200)
        self.assertEqual(leads, [0])

    def test_late_forecast_is_negative(self):
        actual = np.arange(0, 500, dtype=np.float64)
        forecast = np.concatenate([np.zeros(20), actual[:-20]])
        leads = crossing_lead_seconds(actual, forecast, 200)
        self.assertEqual(leads, [-20])

    def test_windows_target_the_horizon_not_the_next_step(self):
        rps = np.arange(100, dtype=np.float64)
        windows, targets, now = make_windows(rps, seq_length=24, horizon=30)
        self.assertEqual(len(windows), len(targets))
        self.assertEqual(int(now[0]), 23)
        self.assertTrue(np.allclose(windows[0], rps[0:24]))
        self.assertEqual(targets[0], rps[23 + 30])

    def test_lstm_source_is_what_prescale_reads(self):
        self.assertEqual(select_forecast_mean(180, 400, "lstm"), 180)
        self.assertEqual(select_forecast_mean(180, 400, "fusion"), 400)
        self.assertEqual(select_forecast_mean(-5, 12, "lstm"), 0.0)


if __name__ == "__main__":
    unittest.main()
