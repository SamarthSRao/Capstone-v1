"""Retrain the DQN z-score agent on the compressed NASA trace.

The agent does not pick a replica count. It picks one of five z-score steps
(down 0.5, down 0.1, hold, up 0.5, panic +2), which is the same action space
server.py applies. The state vector matches GetPrediction: normalized std,
SLA rate, waste/1000, trend, z/10, hour sine, error ratio.

SLA and waste come from the trace. Replicas follow the same idea as the
orchestrator: the noisy upper bound is capped at live RPS + headroom unless
the slope is rising, and a forecast mean that stays above capacity for a few
ticks is trusted. Reward matches hybrid_time_net/train_rl_flash.py.

Writes a new checkpoint. Does not overwrite --base-checkpoint.

    py -3 finetune_rl_nasa.py ^
        --trace data/nasa_per_minute.csv ^
        --base-checkpoint models/rl_agent_checkpoint.pth ^
        --out models/nasa/rl_agent_checkpoint.pth ^
        --episodes 20 --max-steps 8000

Do not point the server at this file until you have actually trained it.
The default image keeps models/rl_agent_checkpoint.pth.
"""

from __future__ import annotations

import argparse
import math
import os
import sys

import numpy as np

from nasa_trace import HORIZON_STEPS, prepare_trace


def build_state(std_dev, std_train, sla_rate, wasted_rps, recent, z_score, hour, error_ratio):
    if len(recent) >= 3:
        trend = (recent[-1] - recent[-3]) / (max(recent) + 1e-8)
    else:
        trend = 0.0
    trend = float(np.clip(trend, -1.0, 1.0))
    return np.array(
        [
            std_dev / std_train,
            sla_rate,
            wasted_rps / 1000.0,
            trend,
            z_score / 10.0,
            math.sin(2.0 * math.pi * hour / 24.0),
            error_ratio,
        ],
        dtype=np.float32,
    )


def compute_reward(sla_violation, wasted_rps, capacity, z_score, prev_z):
    # Same weights as train_rl_flash.py (the 7-D agent).
    sla_penalty = -50.0 * sla_violation
    waste_ratio = wasted_rps / (capacity + 1e-8)
    waste_penalty = -2.0 * waste_ratio
    action_cost = -0.1 * abs(z_score - prev_z) / 0.1
    bonus = 1.0 if (not sla_violation and waste_ratio < 0.15) else 0.0
    return sla_penalty + waste_penalty + action_cost + bonus


def replicas_for(rate, service_rate, max_replicas):
    if rate <= 0 or service_rate <= 0:
        return 1
    base = int(math.ceil(rate / service_rate))
    if base < 1:
        base = 1
    if rate >= base * service_rate:
        base += 1
    if base > max_replicas:
        return max_replicas
    return base


def hour_of(stamp):
    # datetime64[s] -> hour
    text = str(stamp)
    # '1995-07-13T03:30:00'
    return int(text[11:13])


def episode_arrays(trace, horizon):
    """Holdout-free runs, forecast is the value `horizon` seconds ahead (teacher)."""
    runs = []
    for times, rps in trace.iter_segments(holdout=False):
        if len(rps) <= horizon + 5:
            continue
        forecast = np.concatenate([rps[horizon:], np.full(horizon, rps[-1])])
        runs.append((times, rps, forecast))
    return runs


def run_episodes(args):
    import torch
    from rl_agent import RLAgent

    base = os.path.abspath(args.base_checkpoint)
    out = os.path.abspath(args.out)
    if out == base:
        sys.exit("refusing to overwrite %s; pass a different --out" % base)
    if not os.path.isfile(base):
        sys.exit("base checkpoint not found: %s" % base)

    trace = prepare_trace(args.trace, peak_rps=args.peak_rps)
    runs = episode_arrays(trace, args.horizon)
    if not runs:
        sys.exit("no training runs in the trace")

    agent = RLAgent(state_size=7, action_size=5)
    agent.load(base)
    # load() restores the inference epsilon. Training has to explore again.
    agent.epsilon = args.epsilon
    agent.device = torch.device("cpu")
    agent.model.to(agent.device)
    agent.target_model.to(agent.device)

    std_train = max(trace.train_peak, 1.0)
    rng = np.random.default_rng(args.seed)
    print(
        "RL fine-tune episodes=%d max_steps=%d service_rate=%.0f (base left untouched)"
        % (args.episodes, args.max_steps, args.service_rate)
    )

    for episode in range(args.episodes):
        times, rps, forecast = runs[int(rng.integers(0, len(runs)))]
        start = 0
        if args.max_steps and len(rps) > args.max_steps:
            start = int(rng.integers(0, len(rps) - args.max_steps))
            times = times[start : start + args.max_steps]
            rps = rps[start : start + args.max_steps]
            forecast = forecast[start : start + args.max_steps]

        agent.current_z_score = 1.96
        replicas = 1
        above = 0
        recent = [float(rps[0]), float(rps[0]), float(rps[0])]
        prev_z = agent.current_z_score
        std_dev = float(args.std_rps)
        state = build_state(std_dev, std_train, 0.0, 0.0, recent, prev_z, hour_of(times[0]), 0.0)
        total_reward = 0.0
        violations = 0

        for t in range(len(rps) - 1):
            action = agent.act(state)
            prev_z = agent.current_z_score
            z_score = agent.step_z_score(action)
            live = float(rps[t])
            mean = float(forecast[t])
            slope = 0.0
            if t >= 10:
                slope = max(0.0, (live - float(rps[t - 10])) / 10.0)
            upper = mean + z_score * std_dev
            if slope < args.rising_slope:
                upper = min(upper, live + args.flat_headroom)
            capacity_now = replicas * args.service_rate
            if mean > capacity_now:
                above += 1
            else:
                above = 0
            rate = upper
            if above >= args.persist_ticks:
                rate = max(rate, mean)
            desired = replicas_for(rate, args.service_rate, args.max_replicas)
            if desired > replicas:
                replicas = desired
            elif desired < replicas:
                replicas = max(desired, replicas - 1)

            capacity = replicas * args.service_rate
            sla = 1.0 if live > capacity else 0.0
            waste = 0.0 if sla else capacity - live
            violations += int(sla)
            reward = compute_reward(sla, waste, capacity, z_score, prev_z)
            total_reward += reward

            nxt = float(rps[t + 1])
            recent = recent[1:] + [nxt]
            err = max(0.0, live - mean) / (mean + 1.0)
            next_state = build_state(std_dev, std_train, sla, waste, recent, z_score, hour_of(times[t]), err)
            agent.remember(state, action, reward, next_state, t == len(rps) - 2)
            agent.replay(args.batch_size)
            state = next_state

        print(
            "episode %d reward %.1f sla_ticks %d epsilon %.3f z %.2f"
            % (episode + 1, total_reward, violations, agent.epsilon, agent.current_z_score)
        )

    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    agent.epsilon = min(agent.epsilon, 0.05)
    agent.save(out)
    print("Wrote %s" % out)
    print("Original checkpoint left in place: %s" % base)


def main():
    parser = argparse.ArgumentParser(description="Fine-tune the DQN on the compressed NASA trace.")
    parser.add_argument("--trace", default=os.path.join("data", "nasa_per_minute.csv"))
    parser.add_argument("--base-checkpoint", default=os.path.join("models", "rl_agent_checkpoint.pth"))
    parser.add_argument("--out", default=os.path.join("models", "nasa", "rl_agent_checkpoint.pth"))
    parser.add_argument("--episodes", type=int, default=20)
    parser.add_argument("--max-steps", type=int, default=8000)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--epsilon", type=float, default=0.4)
    parser.add_argument("--horizon", type=int, default=HORIZON_STEPS)
    parser.add_argument("--service-rate", type=float, default=200.0)
    parser.add_argument("--max-replicas", type=int, default=10)
    parser.add_argument("--std-rps", type=float, default=30.0, help="stand-in for MC-dropout std during the sim")
    parser.add_argument("--flat-headroom", type=float, default=50.0)
    parser.add_argument("--rising-slope", type=float, default=2.0)
    parser.add_argument("--persist-ticks", type=int, default=3)
    parser.add_argument("--peak-rps", type=float, default=750.0)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()
    run_episodes(args)


if __name__ == "__main__":
    main()
