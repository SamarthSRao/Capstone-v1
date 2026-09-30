"""Upper-bound math for the predictor. No weights and no torch.

The servicer publishes

    upper = mean + z * (std + 0.5 * max(0, latest_rps - mean))

latest_rps is the last history sample. When it is below the mean, the
0.5 * error term is zero, so the bound moves only because z or std moved.
"""


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
