"""Upper-bound math for the predictor. No weights and no torch.

The servicer publishes

    upper = mean + z * (std + 0.5 * max(0, latest_rps - mean))

latest_rps is the last history sample. When it is below the mean, the
0.5 * error term is zero, so the bound moves only because z or std moved.
"""


# The DQN clips z to [0, 10] and a saved checkpoint can already be at 10.
# At ~1 RPS that publishes an upper bound around 200. The predictor clamps
# the value it uses: idle or flat recent traffic goes back to the default
# 1.96, and any other tick stays inside [0, 4].
IDLE_Z_SCORE = 1.96
Z_SCORE_MIN = 0.0
Z_SCORE_MAX = 4.0
# Every recent sample at or below this is idle and flat (demo idle is 0
# or about 1 RPS). A ramp or a high plateau is above it, so z is only clamped.
IDLE_FLAT_MAX_RPS = 5.0
# MC dropout still reports ~19 at 1-2 RPS. That std, times z=1.96, puts the
# idle upper bound near 45. Cap only the std term inside the upper bound.
IDLE_STD_CAP = 5.0


def recent_traffic_is_idle(recent_rps, idle_flat_max_rps=IDLE_FLAT_MAX_RPS):
    """True when every recent sample is at or below the idle line."""
    recent = [float(x) for x in recent_rps]
    return bool(recent) and max(recent) <= float(idle_flat_max_rps)


def clamp_z_score(z_score, recent_rps, idle_flat_max_rps=IDLE_FLAT_MAX_RPS):
    """Return the z-score the predictor should publish for this tick."""
    if recent_traffic_is_idle(recent_rps, idle_flat_max_rps):
        return IDLE_Z_SCORE
    z_score = float(z_score)
    if z_score < Z_SCORE_MIN:
        return Z_SCORE_MIN
    if z_score > Z_SCORE_MAX:
        return Z_SCORE_MAX
    return z_score


def uncertainty_bounds(mean, std_dev, z_score, latest_rps, recent_rps=None):
    """Return (upper, lower, prediction_error) for one forecast tick.

    recent_rps is the same window used to reset z. When it is idle, the
    std inside the upper bound is min(std, 5). The lower bound and any
    non-idle tick keep the raw std. Omitting recent_rps leaves the
    original formula unchanged.
    """
    mean = max(0.0, float(mean))
    std_dev = max(0.0, float(std_dev))
    z_score = float(z_score)
    prediction_error = max(0.0, float(latest_rps) - mean)
    std_for_upper = std_dev
    if recent_rps is not None and recent_traffic_is_idle(recent_rps):
        std_for_upper = min(std_dev, IDLE_STD_CAP)
    upper = mean + (z_score * (std_for_upper + (prediction_error * 0.5)))
    lower = max(0.0, mean - (z_score * (std_dev + (prediction_error * 0.5))))
    return upper, lower, prediction_error
