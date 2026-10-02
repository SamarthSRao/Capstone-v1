"""Idle upper-bound behavior. Does not load model weights."""
import unittest

from bounds import clamp_z_score, uncertainty_bounds


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

    def test_idle_flat_traffic_resets_a_stuck_z_score(self):
        # Real checkpoint at ~1 RPS was publishing z=10 (upper around 204).
        idle = [1.0] * 24
        self.assertEqual(clamp_z_score(10.0, idle), 1.96)
        self.assertEqual(clamp_z_score(10.0, [0.0] * 24), 1.96)

    def test_z_score_stays_inside_zero_to_four_when_traffic_is_moving(self):
        ramp = [float(x) for x in range(50, 74)]
        self.assertEqual(clamp_z_score(10.0, ramp), 4.0)
        self.assertEqual(clamp_z_score(-1.0, ramp), 0.0)
        self.assertEqual(clamp_z_score(2.5, ramp), 2.5)
        # A high flat plateau is not idle, so it is clamped, not reset.
        self.assertEqual(clamp_z_score(10.0, [400.0] * 24), 4.0)

    def test_idle_window_caps_std_in_the_upper_bound(self):
        # Live 1-2 RPS, mean 4-6, MC std ~19, z reset to 1.96. Without the
        # cap the upper bound is about 41-46. min(std, 5) brings it near 15.
        idle = [1.0, 2.0, 1.0, 2.0]
        for mean in (4.0, 5.0, 6.0):
            capped, lower, err = uncertainty_bounds(mean, 19.0, 1.96, 1.0, idle)
            raw, raw_lower, raw_err = uncertainty_bounds(mean, 19.0, 1.96, 1.0)
            self.assertEqual(err, 0.0)
            self.assertEqual(raw_err, 0.0)
            self.assertAlmostEqual(capped, mean + 1.96 * 5.0)
            self.assertLessEqual(capped, 16.0)
            self.assertAlmostEqual(raw, mean + 1.96 * 19.0)
            self.assertGreater(raw, 40.0)
            # The lower bound still uses the raw std.
            self.assertAlmostEqual(lower, raw_lower)

    def test_non_idle_window_keeps_the_full_std(self):
        moving = [1.0, 2.0, 6.0]
        upper, lower, err = uncertainty_bounds(72, 105, 2.0, 1.0, moving)
        raw, raw_lower, raw_err = uncertainty_bounds(72, 105, 2.0, 1.0)
        self.assertEqual(err, raw_err)
        self.assertAlmostEqual(upper, raw)
        self.assertAlmostEqual(lower, raw_lower)
        self.assertAlmostEqual(upper, 72 + 2.0 * 105)
        # A std that is already under the cap is unchanged at idle too.
        small, _, _ = uncertainty_bounds(5.0, 3.0, 1.96, 1.0, [1.0, 1.0])
        self.assertAlmostEqual(small, 5.0 + 1.96 * 3.0)

    def test_real_overload_does_widen_the_bound(self):
        quiet, _, quiet_err = uncertainty_bounds(72, 105, 2.0, 1)
        shock, _, shock_err = uncertainty_bounds(72, 105, 2.0, 500)
        self.assertEqual(quiet_err, 0.0)
        self.assertGreater(shock_err, 0.0)
        self.assertGreater(shock, quiet)


if __name__ == "__main__":
    unittest.main()
