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
apiVersion: batch/v1
kind: Job
metadata:
  name: nasa-replay
  namespace: capstone
  labels:
    app: nasa-replay
spec:
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
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: "1"
              memory: 512Mi
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
