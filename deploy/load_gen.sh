#!/usr/bin/env bash
# Generate the demo traffic spike.
#
# In-cluster (preferred). Locust ramps users against nginx-lb inside the cluster,
# which is enough RPS for the orchestrator to add pods and then step them down:
#
#   ./deploy/load_gen.sh
#
# From this machine, against the public LoadBalancer (a lighter spike).
# The dashboard is that same IP on port 80. There is no second address.
#
#   ./deploy/load_gen.sh --url http://<NGINX-IP>:8090
#
# NASA morning, time-compressed to about 10 minutes and looped 3 times, so the
# forecast can rise before live RPS crosses 200 per pod:
#
#   ./deploy/load_gen.sh --replay
#   REPLAY_PARALLELISM=2 ./deploy/load_gen.sh --replay
#   ./deploy/load_gen.sh --replay --parallelism 4
#
# The replay is an indexed Job. Each pod sends target/N over keep-alive
# connections and logs achieved_rps next to target_rps. Default N is 4.
# Re-running deletes the previous Job first. Jobs are immutable.

set -euo pipefail

NAMESPACE="${NAMESPACE:-capstone}"
URL=""
REPLAY=0
REPLAY_PARALLELISM="${REPLAY_PARALLELISM:-4}"

while [ $# -gt 0 ]; do
  case "$1" in
    --url)
      URL="${2:-}"
      shift 2
      ;;
    --replay)
      REPLAY=1
      shift
      ;;
    --parallelism)
      REPLAY_PARALLELISM="${2:-}"
      shift 2
      ;;
    --namespace)
      NAMESPACE="${2:-}"
      shift 2
      ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "$REPLAY" = "1" ]; then
  case "$REPLAY_PARALLELISM" in
    ''|*[!0-9]*)
      echo "REPLAY_PARALLELISM must be an integer (got: $REPLAY_PARALLELISM)" >&2
      exit 1
      ;;
  esac
  if [ "$REPLAY_PARALLELISM" -lt 1 ] || [ "$REPLAY_PARALLELISM" -gt 16 ]; then
    echo "REPLAY_PARALLELISM must be from 1 to 16 (got: $REPLAY_PARALLELISM)" >&2
    exit 1
  fi
  echo "Applying NASA replay Job in namespace $NAMESPACE ($REPLAY_PARALLELISM parallel pods, about 10 minutes, looped 3 times)"
  rendered="$(mktemp)"
  sed \
    -e "s/parallelism: [0-9][0-9]* # replay-parallelism/parallelism: ${REPLAY_PARALLELISM} # replay-parallelism/" \
    -e "s/completions: [0-9][0-9]* # replay-parallelism/completions: ${REPLAY_PARALLELISM} # replay-parallelism/" \
    -e "s/value: \"[0-9][0-9]*\" # replay-shards/value: \"${REPLAY_PARALLELISM}\" # replay-shards/" \
    -e "s/- \"[0-9][0-9]*\" # replay-shards/- \"${REPLAY_PARALLELISM}\" # replay-shards/" \
    "$ROOT/k8s/07-nasa-replay-job.yaml" > "$rendered"
  kubectl delete job nasa-replay -n "$NAMESPACE" --ignore-not-found
  kubectl apply -f "$rendered"
  rm -f "$rendered"
  echo "Following logs (Ctrl-C stops following; the Job keeps running)."
  echo "Look for achieved_rps next to target_rps. The summary line is at the end of each pod."
  echo "Watch pods: kubectl get pods -n $NAMESPACE -l app=target-app -w"
  echo "Scale rule: kubectl logs -n $NAMESPACE -l app=orchestrator --tail=20"
  kubectl wait -n "$NAMESPACE" --for=condition=ready pod -l app=nasa-replay --timeout=180s || true
  kubectl logs -n "$NAMESPACE" -l app=nasa-replay -f --tail=20 --prefix || true
  exit 0
fi

if [ -n "$URL" ]; then
  if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required for --url mode. Use ./deploy/load_gen.sh with no args for the in-cluster Job." >&2
    exit 1
  fi
  target="${URL%/}/"
  echo "Light load for 20s against $target"
  end=$((SECONDS + 20))
  while [ "$SECONDS" -lt "$end" ]; do
    curl -s -o /dev/null -H "X-Load-Test: 1" --max-time 5 "$target" || true
  done
  echo "Spike for 70s (8 parallel requests)"
  end=$((SECONDS + 70))
  while [ "$SECONDS" -lt "$end" ]; do
    i=0
    while [ "$i" -lt 8 ]; do
      curl -s -o /dev/null -H "X-Load-Test: 1" --max-time 5 "$target" &
      i=$((i + 1))
    done
    wait || true
  done
  echo "Calm for 30s"
  end=$((SECONDS + 30))
  while [ "$SECONDS" -lt "$end" ]; do
    curl -s -o /dev/null -H "X-Load-Test: 1" --max-time 5 "$target" || true
  done
  echo "Done. In another terminal: kubectl get pods -n $NAMESPACE -l app=target-app -w"
  exit 0
fi

echo "Applying in-cluster Locust job in namespace $NAMESPACE"
kubectl delete job loadgen -n "$NAMESPACE" --ignore-not-found
kubectl apply -f "$ROOT/k8s/06-loadgen-job.yaml"
echo "Following logs (Ctrl-C stops following; the Job keeps running)."
echo "Watch pods: kubectl get pods -n $NAMESPACE -l app=target-app -w"
kubectl wait -n "$NAMESPACE" --for=condition=ready pod -l app=loadgen --timeout=180s || true
kubectl logs -n "$NAMESPACE" -l app=loadgen -f --tail=20 || true
