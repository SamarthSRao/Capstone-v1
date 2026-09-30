"""Regenerate k8s/07-nasa-replay-job.yaml from deploy/nasa_replay.py and the CSV.

    python3 deploy/render_nasa_job.py
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]


def block(text, indent):
    pad = " " * indent
    return "\n".join(pad + line if line else "" for line in text.splitlines())


HEADER = """# Not part of kustomization.yaml. Replays the NASA morning (10 compressed
# minutes, looped) so the forecast can lead the ramp:
#   ./deploy/load_gen.sh --replay
#   kubectl apply -f k8s/07-nasa-replay-job.yaml
# The CSV and player are the copies in deploy/. Regenerate this file with
#   python3 deploy/render_nasa_job.py
# if either one changes.
apiVersion: v1
kind: ConfigMap
metadata:
  name: nasa-replay
  namespace: capstone
data:
  nasa_replay.py: |
__SCRIPT__
  nasa_demo_window_10min.csv: |
__CSV__
---
# Indexed job: N pods run the same morning at the same time. Pod i sends
# round(target)/N (remainder on the lower indexes) so the cluster sees the
# full rate. Default 4 fits a 6 GB kind node. REPLAY_PARALLELISM in
# deploy/load_gen.sh rewrites the lines marked replay-parallelism and
# replay-shards before apply. Requests stay small so the pods still schedule
# on a 2 vCPU node; limits are what a busy shard may use if the node has it.
apiVersion: batch/v1
kind: Job
metadata:
  name: nasa-replay
  namespace: capstone
  labels:
    app: nasa-replay
spec:
  parallelism: 4 # replay-parallelism
  completions: 4 # replay-parallelism
  completionMode: Indexed
  backoffLimit: 1
  ttlSecondsAfterFinished: 600
  template:
    metadata:
      labels:
        app: nasa-replay
    spec:
      restartPolicy: Never
      containers:
        - name: replay
          image: python:3.12-slim
          imagePullPolicy: IfNotPresent
          command: ["python", "-u", "/replay/nasa_replay.py"]
          args:
            - --host
            - http://nginx-lb.capstone.svc.cluster.local:8090/
            - --csv
            - /replay/nasa_demo_window_10min.csv
            - --loops
            - "3"
            - --shards
            - "4" # replay-shards
          env:
            - name: REPLAY_SHARDS
              value: "4" # replay-shards
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 400m
              memory: 192Mi
          volumeMounts:
            - name: replay
              mountPath: /replay
              readOnly: true
      volumes:
        - name: replay
          configMap:
            name: nasa-replay
"""


def main():
    script = (ROOT / "deploy" / "nasa_replay.py").read_text()
    csv_text = (ROOT / "deploy" / "nasa_demo_window_10min.csv").read_text()
    rendered = HEADER.replace("__SCRIPT__", block(script, 4)).replace("__CSV__", block(csv_text, 4))
    if not rendered.endswith("\n"):
        rendered += "\n"
    dest = ROOT / "k8s" / "07-nasa-replay-job.yaml"
    dest.write_text(rendered)
    print("wrote %s" % dest)


if __name__ == "__main__":
    main()
