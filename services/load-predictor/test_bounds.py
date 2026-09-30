"""Idle upper-bound behavior. Does not load model weights."""
import unittest

from bounds import uncertainty_bounds


class IdleUpperBoundTest(unittest.TestCase):
    def test_error_term_is_zero_when_rps_is_below_the_mean(self):
        # Kind idle: ~1 RPS, mean ~72, std ~105. The spike is not the
        # 0.5 * prediction_error term.
        upper, _, err = uncertainty_bounds(72, 105, 2.0, 1)
        self.assertEqual(err, 0.0)
        self.assertAlmostEqual(upper, 72 + 2.0 * 105)

    def test_kind_readings_match_z_times_std(self):
        # Reported spikes 178, 285, and 438 with mean 72 and std 105.
        # They line up with z near 1, 2, and 3.5, which is a HOLD/WIDEN
        # level and a panic step (+2) on top of a noisy std sample.
        readings = ((1.01, 178), (2.03, 285), (3.49, 438))
        for z_score, reported in readings:
            upper, _, err = uncertainty_bounds(72, 105, z_score, 1)
            self.assertEqual(err, 0.0)
            self.assertAlmostEqual(upper, reported, delta=1.0)

    def test_panic_step_jumps_about_two_stds(self):
        calm, _, _ = uncertainty_bounds(72, 105, 1.96, 1)
        panic, _, _ = uncertainty_bounds(72, 105, 1.96 + 2.0, 1)
        self.assertAlmostEqual(panic - calm, 2.0 * 105)

    def test_real_overload_does_widen_the_bound(self):
        quiet, _, quiet_err = uncertainty_bounds(72, 105, 2.0, 1)
        shock, _, shock_err = uncertainty_bounds(72, 105, 2.0, 500)
        self.assertEqual(quiet_err, 0.0)
        self.assertGreater(shock_err, 0.0)
        self.assertGreater(shock, quiet)


if __name__ == "__main__":
    unittest.main()
