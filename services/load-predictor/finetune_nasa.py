"""Fine-tune the Bayesian LSTM on the compressed NASA trace.

Loads the existing weights, trains a few epochs, and writes a NEW directory.
It will not overwrite the checkpoint you pass as --base-weights.

The target is the RPS `horizon` demo-seconds ahead (default 30), not the next
step. A next-step model can only lead by one second, which is not enough for
a pod to start. Rising windows are up-weighted, and a copy of them is
stretched so the mean can exceed the training-day peak (about 360 RPS) and
cover the demo morning. The original hourly weights stay the default the
server loads until MODEL_DIR points at the new directory.

CPU, a few GB of RAM, and well under an hour for the full trace. Example
(from services/load-predictor, Windows or Linux):

    py -3 finetune_nasa.py ^
        --trace data/nasa_per_minute.csv ^
        --base-weights models/lstm_weights.pth ^
        --base-stats models/training_stats.json ^
        --out-dir models/nasa ^
        --epochs 4 --batch-size 256

Then rebuild the predictor image and set MODEL_DIR=/app/models/nasa.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np

from nasa_trace import (
    HORIZON_STEPS,
    PEAK_RPS,
    SEQ_LENGTH,
    collect_windows,
    prepare_trace,
)


def gaussian_nll(mu, logvar, target):
    import torch

    logvar = torch.clamp(logvar, -8.0, 8.0)
    var = torch.exp(logvar)
    return (0.5 * (target - mu) ** 2 / var + 0.5 * logvar).mean()


def predict_series(model, rps, mean, std, seq_length, batch_size, device):
    """Deterministic forecast aligned to each demo second (NaN until the window fills)."""
    import torch

    rps = np.asarray(rps, dtype=np.float64)
    out = np.full(len(rps), np.nan, dtype=np.float64)
    if len(rps) < seq_length:
        return out
    # One forward per end-index. Batched.
    ends = np.arange(seq_length - 1, len(rps))
    offsets = np.arange(seq_length)
    windows = rps[ends[:, None] - (seq_length - 1) + offsets]
    scaled = ((windows - mean) / std).astype(np.float32)
    model.eval()
    preds = []
    with torch.no_grad():
        for start in range(0, len(scaled), batch_size):
            batch = torch.from_numpy(scaled[start : start + batch_size]).unsqueeze(-1).to(device)
            mu, _ = model(batch)
            preds.append(mu.squeeze(-1).cpu().numpy())
    pred = np.concatenate(preds).astype(np.float64) * std + mean
    out[ends] = np.maximum(pred, 0.0)
    return out


def evaluate_model(model, trace, mean, std, seq_length, horizon, batch_size, device, capacities):
    """Lead time and error on each held-out day, using the horizon value as truth."""
    from nasa_trace import make_windows

    leads = {int(c): [] for c in capacities}
    abs_err = []
    sq_err = []
    false_high = 0
    false_high_denom = 0
    for day in trace.holdout_dates:
        _, rps = trace.day_series(day)
        if len(rps) < seq_length + horizon:
            continue
        forecast = predict_series(model, rps, mean, std, seq_length, batch_size, device)
        valid = ~np.isnan(forecast)
        # Score against the horizon ahead, which is what this script trains.
        windows, targets, now = make_windows(rps, seq_length, horizon)
        if len(targets):
            pred_at = forecast[now]
            ok = ~np.isnan(pred_at)
            if np.any(ok):
                err = pred_at[ok] - targets[ok]
                abs_err.append(np.abs(err))
                sq_err.append(err ** 2)
        for capacity in capacities:
            day_leads = []
            # Only score crossings where the forecast array is defined.
            actual = rps.copy()
            # Treat the warmup as not-yet-crossed so a NaN prefix cannot lead.
            filled = forecast.copy()
            filled[~valid] = 0.0
            from nasa_trace import crossing_lead_seconds

            day_leads = crossing_lead_seconds(actual, filled, float(capacity))
            leads[int(capacity)].extend(day_leads)
        quiet = valid & (rps < 80.0)
        false_high += int(np.sum(quiet & (forecast > 200.0)))
        false_high_denom += int(np.sum(quiet))
    mae = float(np.mean(np.concatenate(abs_err))) if abs_err else None
    rmse = float(np.sqrt(np.mean(np.concatenate(sq_err)))) if sq_err else None
    lead_summary = {}
    for capacity, values in leads.items():
        lead_summary[str(capacity)] = None if not values else float(np.median(np.asarray(values, dtype=np.float64)))
    false_rate = None if false_high_denom == 0 else false_high / false_high_denom
    return {"mae": mae, "rmse": rmse, "median_lead_seconds": lead_summary, "false_prescale_rate": false_rate}


def load_lstm(weights_path, device):
    import torch
    from models.lstm import BayesianLSTM

    model = BayesianLSTM(input_size=1, hidden_size=64, num_layers=2, dropout_rate=0.2).to(device)
    state = torch.load(weights_path, map_location=device)
    model.load_state_dict(state)
    return model


def train(args):
    import torch

    base_weights = os.path.abspath(args.base_weights)
    out_dir = os.path.abspath(args.out_dir)
    out_weights = os.path.join(out_dir, "lstm_weights.pth")
    if os.path.abspath(out_weights) == base_weights:
        sys.exit("refusing to overwrite %s; choose a different --out-dir" % base_weights)
    if not os.path.isfile(base_weights):
        sys.exit("base weights not found: %s" % base_weights)

    device = torch.device("cpu")
    print(
        "Preparing NASA trace (1-3 Aug outage dropped, 28-31 Jul zeros kept, "
        "40x compression, peak %.0f RPS)..." % args.peak_rps
    )
    trace = prepare_trace(args.trace, peak_rps=args.peak_rps)
    print("scale=%.2f train_peak=%.1f target_peak=%.1f" % (trace.scale, trace.train_peak, trace.target_peak))

    x_train, y_train = collect_windows(trace, holdout=False, seq_length=args.seq_length, horizon=args.horizon)
    if args.max_windows and len(y_train) > args.max_windows:
        rng = np.random.default_rng(args.seed)
        pick = rng.choice(len(y_train), size=args.max_windows, replace=False)
        x_train, y_train = x_train[pick], y_train[pick]
    print("train windows=%d seq=%d horizon=%ds" % (len(y_train), args.seq_length, args.horizon))
    if len(y_train) < 8:
        sys.exit("not enough training windows")

    # Training days peak near 360 RPS. The held-out demo morning peaks near
    # 750, and a network that has never been asked for a number that high
    # will not forecast the second and third pod. Stretch rising windows
    # only (idle nights are left alone) so the mean can pass 400 and 600.
    last = x_train[:, -1]
    rising = (y_train > last + 15.0) & (last > 80.0)
    if np.any(rising):
        rng = np.random.default_rng(args.seed)
        gains = rng.uniform(1.5, 2.6, size=int(np.sum(rising))).astype(np.float64)
        x_aug = x_train[rising] * gains[:, None]
        y_aug = y_train[rising] * gains
        cap = 900.0
        keep = y_aug < cap
        x_train = np.concatenate([x_train, x_aug[keep]], axis=0)
        y_train = np.concatenate([y_train, y_aug[keep]], axis=0)
        print("amplitude stretch added %d rising windows" % int(np.sum(keep)))

    mean = float(x_train.mean())
    std = float(x_train.std())
    if std < 1e-6:
        std = 1.0
    x_scaled = ((x_train - mean) / std).astype(np.float32)
    y_scaled = ((y_train - mean) / std).astype(np.float32)

    model = load_lstm(base_weights, device)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)

    n = len(y_scaled)
    print("Fine-tuning on CPU for %d epochs, batch %d, lr %g" % (args.epochs, args.batch_size, args.lr))
    for epoch in range(args.epochs):
        model.train()
        order = np.random.default_rng(args.seed + epoch).permutation(n)
        total = 0.0
        seen = 0
        for start in range(0, n, args.batch_size):
            idx = order[start : start + args.batch_size]
            xb = torch.from_numpy(x_scaled[idx]).unsqueeze(-1)
            yb = torch.from_numpy(y_scaled[idx]).unsqueeze(-1)
            optimizer.zero_grad()
            mu, logvar = model(xb)
            # NLL alone can swallow a ramp by widening the variance and
            # leaving the mean on the last sample. The mean is what the
            # orchestrator pre-scales on, so it is trained with absolute
            # error, and windows that are still rising 30s out are weighted
            # higher. Flat nights stay in the batch so the mean does not
            # drift up at idle.
            residual = (mu.squeeze(-1) - yb.squeeze(-1)).abs()
            last = xb[:, -1, 0]
            rising = (yb.squeeze(-1) > last + 0.2).float()
            weight = 1.0 + 4.0 * rising
            loss = (weight * residual).mean() + 0.05 * gaussian_nll(mu, logvar, yb)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total += float(loss.item()) * len(idx)
            seen += len(idx)
        print("epoch %d loss %.4f" % (epoch + 1, total / max(seen, 1)))

    os.makedirs(out_dir, exist_ok=True)
    # Save a fresh state dict. The file above was only read.
    torch.save(model.state_dict(), out_weights)

    with open(args.base_stats) as handle:
        old_stats = json.load(handle)
    old_mean = float(old_stats.get("mean_train", 0.0))
    old_std = float(old_stats.get("std_train", 1.0)) or 1.0

    capacities = [200, 400, 600]
    print("Evaluating held-out days...")
    new_report = evaluate_model(model, trace, mean, std, args.seq_length, args.horizon, args.batch_size, device, capacities)
    old_model = load_lstm(base_weights, device)
    old_report = evaluate_model(
        old_model, trace, old_mean, old_std, args.seq_length, args.horizon, args.batch_size, device, capacities
    )

    # Ceiling: a forecast that is the series shifted by the horizon.
    oracle = {str(c): [] for c in capacities}
    for day in trace.holdout_dates:
        _, rps = trace.day_series(day)
        if len(rps) <= args.horizon:
            continue
        forecast = np.concatenate([rps[args.horizon :], np.full(args.horizon, rps[-1])])
        for capacity in capacities:
            from nasa_trace import crossing_lead_seconds

            oracle[str(capacity)].extend(crossing_lead_seconds(rps, forecast, float(capacity)))
    oracle_lead = {
        cap: (None if not values else float(np.median(np.asarray(values, dtype=np.float64))))
        for cap, values in oracle.items()
    }

    stats = {
        "mean_train": mean,
        "std_train": std,
        "seq_length": args.seq_length,
        "horizon_steps": args.horizon,
        "forecast_source": "lstm",
        "compression_seconds": trace.compression_seconds,
        "scale": trace.scale,
        "target_peak_rps": trace.target_peak,
        "train_peak_rps": trace.train_peak,
        "epochs": args.epochs,
        "holdout_dates": list(trace.holdout_dates),
        "mae": new_report["mae"],
        "rmse": new_report["rmse"],
        "median_lead_seconds": new_report["median_lead_seconds"],
        "false_prescale_rate": new_report["false_prescale_rate"],
        "baseline_hourly_weights": {
            "mae": old_report["mae"],
            "rmse": old_report["rmse"],
            "median_lead_seconds": old_report["median_lead_seconds"],
            "false_prescale_rate": old_report["false_prescale_rate"],
            "note": "Same architecture, original hourly weights, original mean/std. Not retrained.",
        },
        "oracle_shift_lead_seconds": oracle_lead,
        "base_weights": base_weights,
    }
    stats_path = os.path.join(out_dir, "training_stats.json")
    with open(stats_path, "w") as handle:
        json.dump(stats, handle, indent=2)
    print(json.dumps(stats, indent=2))
    print("Wrote %s" % out_weights)
    print("Wrote %s" % stats_path)
    print("Original weights left in place: %s" % base_weights)


def main():
    parser = argparse.ArgumentParser(description="Fine-tune the LSTM on the compressed NASA trace.")
    parser.add_argument("--trace", default=os.path.join("data", "nasa_per_minute.csv"))
    parser.add_argument("--base-weights", default=os.path.join("models", "lstm_weights.pth"))
    parser.add_argument("--base-stats", default=os.path.join("models", "training_stats.json"))
    parser.add_argument("--out-dir", default=os.path.join("models", "nasa"))
    parser.add_argument("--epochs", type=int, default=6)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--seq-length", type=int, default=SEQ_LENGTH)
    parser.add_argument("--horizon", type=int, default=HORIZON_STEPS)
    parser.add_argument("--peak-rps", type=float, default=PEAK_RPS)
    parser.add_argument("--max-windows", type=int, default=0, help="0 uses every training window")
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()
    train(args)


if __name__ == "__main__":
    main()
