"""Turn the NASA-KSC per-minute HTTP trace into the live predictor's cadence.

The public trace (Arlitt & Williamson, SIGMETRICS 1996) is one row per minute.
The predictor is served a 24-step history of 1-second samples. This module
time-compresses the trace 40x, the same way deploy/nasa_demo_window_10min.csv
was built, so one training step is one demo second. An outage that was logged
as zeros (1995-08-01 14:52 through 1995-08-03 04:36) is dropped and splits the
series so smoothing and windows never cross the gap.

No pandas and no torch: the unit tests and a laptop with a few GB of RAM can
import this module on its own.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, field
from datetime import datetime, timedelta

import numpy as np

# Inclusive. The logs record this stretch as zeros; it is not real idle.
OUTAGE_START = datetime(1995, 8, 1, 14, 52)
OUTAGE_END = datetime(1995, 8, 3, 4, 36)

# One demo second stands for this many seconds of 1995. 40x turns the
# 6.6 hour demo morning into about 10 minutes, matching the attached window.
COMPRESSION_SECONDS = 40
SMOOTH_MINUTES = 7
# Held out of training so lead-time numbers are not fit on the replay day.
# 1995-07-13 is the morning the demo Job replays. The others are weekly
# neighbors with the same shape (the window correlates ~0.93 at +/-7 days).
DEFAULT_HOLDOUT = (
    "1995-07-13",
    "1995-07-20",
    "1995-08-10",
    "1995-08-17",
)
PEAK_RPS = 750.0
SEQ_LENGTH = 24
HORIZON_STEPS = 30


def parse_timestamp(text):
    return datetime.strptime(text.strip(), "%Y-%m-%d %H:%M:%S")


def in_outage(when):
    return OUTAGE_START <= when <= OUTAGE_END


def load_minute_counts(path):
    """Return (times, counts) for every row, including outage zeros."""
    times = []
    counts = []
    with open(path, newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None or "timestamp" not in reader.fieldnames or "count" not in reader.fieldnames:
            raise ValueError("expected columns timestamp,count in %s" % path)
        for row in reader:
            times.append(parse_timestamp(row["timestamp"]))
            counts.append(float(row["count"]))
    if not times:
        raise ValueError("empty trace: %s" % path)
    return times, np.asarray(counts, dtype=np.float64)


def _rolling_mean(values, window):
    """Centered rolling mean. Edges use whatever samples exist."""
    if window < 1:
        raise ValueError("window must be positive")
    half = window // 2
    cumulative = np.cumsum(np.insert(values.astype(np.float64), 0, 0.0))
    out = np.empty(len(values), dtype=np.float64)
    n = len(values)
    for i in range(n):
        start = max(0, i - half)
        end = min(n, i + half + 1)
        out[i] = (cumulative[end] - cumulative[start]) / (end - start)
    return out


def contiguous_segments(times, counts):
    """Split on the outage and on any gap longer than one minute.

    Returns a list of (times, counts) with the outage rows removed.
    """
    segments = []
    bucket_t = []
    bucket_c = []

    def flush():
        if bucket_t:
            segments.append((list(bucket_t), np.asarray(bucket_c, dtype=np.float64)))
        bucket_t.clear()
        bucket_c.clear()

    previous = None
    for when, count in zip(times, counts):
        if in_outage(when):
            flush()
            previous = None
            continue
        if previous is not None and (when - previous) > timedelta(minutes=1, seconds=30):
            flush()
        bucket_t.append(when)
        bucket_c.append(float(count))
        previous = when
    flush()
    return segments


def compress_segment(times, counts, compression_seconds=COMPRESSION_SECONDS, smooth_minutes=SMOOTH_MINUTES):
    """Resample one contiguous minute-segment onto the demo-second grid.

    counts are requests in that minute. Smoothing happens in minute-space,
    then the series is interpolated onto a grid of `compression_seconds`
    (40 real seconds = 1 demo second). Returned rps is still unscaled
    (smoothed requests per real second).
    """
    if len(times) < smooth_minutes:
        return np.array([], dtype="datetime64[s]"), np.array([], dtype=np.float64)
    smoothed_per_minute = _rolling_mean(counts, smooth_minutes)
    rps = smoothed_per_minute / 60.0
    t0 = times[0]
    offsets = np.asarray([(t - t0).total_seconds() for t in times], dtype=np.float64)
    if offsets[-1] < compression_seconds:
        return np.array([], dtype="datetime64[s]"), np.array([], dtype=np.float64)
    grid = np.arange(0.0, offsets[-1] + 1e-6, float(compression_seconds))
    sampled = np.interp(grid, offsets, rps)
    stamped = np.array([np.datetime64(t0, "s") + np.timedelta64(int(step), "s") for step in grid])
    return stamped, sampled


@dataclass
class PreparedTrace:
    """Scaled demo-second series, split so holdout days are not in the train set."""

    segments: list = field(default_factory=list)  # each is (times datetime64[s], rps scaled)
    scale: float = 1.0
    # target_peak is the scaled maximum of the whole trace (train and holdout).
    # The July 13 demo morning is that maximum, so this is what lines the
    # model up with nasa_demo_window_10min.csv. Holdout days are still
    # excluded from the training windows; only the unit conversion uses them.
    target_peak: float = 0.0
    train_peak: float = 0.0
    holdout_dates: tuple = DEFAULT_HOLDOUT
    compression_seconds: int = COMPRESSION_SECONDS

    def _date_of(self, stamp):
        # datetime64[s] -> python date via str, which is YYYY-MM-DD.
        return str(stamp)[:10]

    def iter_segments(self, holdout):
        for times, rps in self.segments:
            if len(rps) == 0:
                continue
            dates = np.array([self._date_of(stamp) for stamp in times])
            mask = np.isin(dates, list(self.holdout_dates))
            if holdout:
                keep = mask
            else:
                keep = ~mask
            if not np.any(keep):
                continue
            # Yield contiguous runs so a window cannot jump a held-out day.
            start = 0
            while start < len(rps):
                if not keep[start]:
                    start += 1
                    continue
                end = start + 1
                while end < len(rps) and keep[end]:
                    end += 1
                yield times[start:end], rps[start:end]
                start = end

    def day_series(self, day):
        """Scaled RPS for one calendar day, in order, with no cross-day join."""
        chunks_t = []
        chunks_r = []
        for times, rps in self.segments:
            dates = np.array([self._date_of(stamp) for stamp in times])
            mask = dates == day
            if np.any(mask):
                chunks_t.append(times[mask])
                chunks_r.append(rps[mask])
        if not chunks_r:
            return np.array([], dtype="datetime64[s]"), np.array([], dtype=np.float64)
        return np.concatenate(chunks_t), np.concatenate(chunks_r)


def prepare_trace(
    path,
    holdout_dates=DEFAULT_HOLDOUT,
    peak_rps=PEAK_RPS,
    compression_seconds=COMPRESSION_SECONDS,
    smooth_minutes=SMOOTH_MINUTES,
):
    """Load, drop the outage, compress, and scale so the trace peak is peak_rps.

    The peak is the held-out 13 July morning, which is also the demo replay.
    Using it only to choose the requests-per-second unit keeps that replay
    and the model on one scale (about 700-800 RPS). Holdout days are not
    training targets.
    """
    times, counts = load_minute_counts(path)
    raw_segments = contiguous_segments(times, counts)
    compressed = []
    for seg_times, seg_counts in raw_segments:
        stamps, rps = compress_segment(seg_times, seg_counts, compression_seconds, smooth_minutes)
        if len(rps):
            compressed.append((stamps, rps))
    if not compressed:
        raise ValueError("compression produced no samples")

    holdout = tuple(holdout_dates)
    global_peak = max(float(rps.max()) for _, rps in compressed)
    if global_peak <= 0:
        raise ValueError("trace peak is zero; refusing to scale")
    # One scale for the whole trace. Fitting it on train only would push the
    # held-out demo morning (the actual peak) well above the replay file.
    scale = float(peak_rps) / global_peak
    scaled = [(stamps, rps * scale) for stamps, rps in compressed]
    train_peak = 0.0
    for stamps, rps in scaled:
        dates = np.array([str(stamp)[:10] for stamp in stamps])
        train = rps[~np.isin(dates, list(holdout))]
        if len(train):
            train_peak = max(train_peak, float(train.max()))
    return PreparedTrace(
        segments=scaled,
        scale=scale,
        target_peak=float(peak_rps),
        train_peak=train_peak,
        holdout_dates=holdout,
        compression_seconds=compression_seconds,
    )


def make_windows(rps, seq_length=SEQ_LENGTH, horizon=HORIZON_STEPS):
    """Input is the last `seq_length` samples; target is the value `horizon` steps later.

    Predicting the horizon (default 30 demo seconds) is what lets the mean
    rise before live RPS gets there. A 1-step target can only lead by one tick.
    Index i in the returned forecast lines up with the last input sample,
    which is rps[i] "now" and the target rps[i + horizon].
    """
    rps = np.asarray(rps, dtype=np.float64)
    if horizon < 1 or seq_length < 2:
        raise ValueError("seq_length and horizon must be positive")
    last_now = len(rps) - horizon
    if last_now < seq_length:
        return np.zeros((0, seq_length), dtype=np.float64), np.zeros((0,), dtype=np.float64), np.zeros((0,), dtype=np.int64)
    now_idx = np.arange(seq_length - 1, last_now)
    offsets = np.arange(seq_length)
    windows = rps[now_idx[:, None] - (seq_length - 1) + offsets]
    targets = rps[now_idx + horizon]
    return windows.astype(np.float64), targets.astype(np.float64), now_idx


def collect_windows(trace, holdout, seq_length=SEQ_LENGTH, horizon=HORIZON_STEPS):
    """Stack windows from every contiguous run of train or holdout samples."""
    xs = []
    ys = []
    for _, rps in trace.iter_segments(holdout=holdout):
        windows, targets, _ = make_windows(rps, seq_length, horizon)
        if len(targets):
            xs.append(windows)
            ys.append(targets)
    if not xs:
        return np.zeros((0, seq_length)), np.zeros((0,))
    return np.concatenate(xs, axis=0), np.concatenate(ys, axis=0)


def crossing_lead_seconds(actual, forecast, capacity, reset_fraction=0.85):
    """Seconds by which `forecast` first exceeds `capacity` before `actual` does.

    Positive means the forecast led that upward crossing. Negative means it
    was late. A crossing the forecast never reaches is omitted.

    The search starts at the beginning of the current below-capacity episode,
    so a forecast that was high all night does not get credit for a lead of
    many hours. `reset_fraction` re-arms after the series falls back under
    the line, which matters when one morning crosses 200, then 400, then 600.
    """
    actual = np.asarray(actual, dtype=np.float64)
    forecast = np.asarray(forecast, dtype=np.float64)
    if len(actual) != len(forecast):
        raise ValueError("actual and forecast must be the same length")
    leads = []
    episode_start = 0
    armed = True
    floor = capacity * reset_fraction
    for i, value in enumerate(actual):
        if not armed:
            if value < floor:
                armed = True
                episode_start = i
            continue
        if value < capacity:
            continue
        first = None
        for j in range(episode_start, i + 1):
            if forecast[j] >= capacity:
                first = j
                break
        if first is None:
            for j in range(i, len(forecast)):
                if forecast[j] >= capacity:
                    first = j
                    break
            if first is None:
                armed = False
                continue
        leads.append(int(i - first))
        armed = False
    return leads


def median_lead(actual, forecast, capacities):
    """Map each capacity to the median lead in seconds, or None if it never crosses."""
    report = {}
    for capacity in capacities:
        leads = crossing_lead_seconds(actual, forecast, float(capacity))
        if not leads:
            report[int(capacity)] = None
        else:
            report[int(capacity)] = float(np.median(np.asarray(leads, dtype=np.float64)))
    return report


def select_forecast_mean(lstm_mean, fusion_mean, forecast_source):
    """Which point forecast the orchestrator is allowed to pre-scale on.

    The original hourly ensemble stays the default. A NASA fine-tune writes
    forecast_source=lstm because the seasonality model keys off wall-clock
    hour, which during a replay is not the 1995 hour the ramp belonged to.
    """
    source = (forecast_source or "fusion").strip().lower()
    if source == "lstm":
        value = float(lstm_mean)
    else:
        value = float(fusion_mean)
    if value < 0 or value != value:  # NaN
        return 0.0
    return value
