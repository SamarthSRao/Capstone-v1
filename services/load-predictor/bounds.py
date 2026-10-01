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


def clamp_z_score(z_score, recent_rps, idle_flat_max_rps=IDLE_FLAT_MAX_RPS):
    """Return the z-score the predictor should publish for this tick."""
    recent = [float(x) for x in recent_rps]
    if recent and max(recent) <= float(idle_flat_max_rps):
        return IDLE_Z_SCORE
    z_score = float(z_score)
    if z_score < Z_SCORE_MIN:
        return Z_SCORE_MIN
    if z_score > Z_SCORE_MAX:
        return Z_SCORE_MAX
    return z_score


def uncertainty_bounds(mean, std_dev, z_score, latest_rps):
    """Return (upper, lower, prediction_error) for one forecast tick."""
    mean = max(0.0, float(mean))
    std_dev = max(0.0, float(std_dev))
    z_score = float(z_score)
    prediction_error = max(0.0, float(latest_rps) - mean)
    adjusted_std = std_dev + (prediction_error * 0.5)
    upper = mean + (z_score * adjusted_std)
    lower = max(0.0, mean - (z_score * adjusted_std))
    return upper, lower, prediction_error
