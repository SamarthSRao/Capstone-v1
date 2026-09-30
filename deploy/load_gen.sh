#!/usr/bin/env bash
# Generate the demo traffic spike.
#
# In-cluster (preferred). Locust ramps users against nginx-lb inside the cluster,
# which is enough RPS for the orchestrator to add pods and then step them down:
#
#   ./deploy/load_gen.sh
#
# From this machine, against the public LoadBalancer (a lighter spike):
#
#   ./deploy/load_gen.sh --url http://<NGINX-IP>:8090
#
# NASA morning, time-compressed to about 10 minutes and looped 3 times, so the
# forecast can rise before live RPS crosses 200 per pod:
#
#   ./deploy/load_gen.sh --replay
#
# Re-running deletes the previous Job first. Jobs are immutable.

set -euo pipefail

NAMESPACE="${NAMESPACE:-capstone}"
URL=""
REPLAY=0

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
  echo "Applying NASA replay Job in namespace $NAMESPACE (about 10 minutes, looped 3 times)"
  kubectl delete job nasa-replay -n "$NAMESPACE" --ignore-not-found
  kubectl apply -f "$ROOT/k8s/07-nasa-replay-job.yaml"
  echo "Following logs (Ctrl-C stops following; the Job keeps running)."
  echo "Watch pods: kubectl get pods -n $NAMESPACE -l app=target-app -w"
  echo "Scale rule: kubectl logs -n $NAMESPACE -l app=orchestrator --tail=20"
  kubectl wait -n "$NAMESPACE" --for=condition=ready pod -l app=nasa-replay --timeout=180s || true
  kubectl logs -n "$NAMESPACE" -l app=nasa-replay -f --tail=20 || true
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
    curl -s -o /dev/null --max-time 5 "$target" || true
  done
  echo "Spike for 70s (8 parallel requests)"
  end=$((SECONDS + 70))
  while [ "$SECONDS" -lt "$end" ]; do
    i=0
    while [ "$i" -lt 8 ]; do
      curl -s -o /dev/null --max-time 5 "$target" &
      i=$((i + 1))
    done
    wait || true
  done
  echo "Calm for 30s"
  end=$((SECONDS + 30))
  while [ "$SECONDS" -lt "$end" ]; do
    curl -s -o /dev/null --max-time 5 "$target" || true
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
