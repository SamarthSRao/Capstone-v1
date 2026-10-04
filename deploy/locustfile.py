"""Ramp that the AKS demo uses to show forecast-led scale-up and stepped scale-down.

In cluster (preferred, generates enough RPS to move several pods):

    kubectl delete job loadgen -n capstone --ignore-not-found
    kubectl apply -f k8s/06-loadgen-job.yaml

From a laptop against the public LoadBalancer (weaker spike). The dashboard
is that same IP on port 80; this host is the storefront on port 8090.

    locust -f deploy/locustfile.py --headless --host http://<NGINX-LB-IP>:8090

Keep this file in sync with the ConfigMap in k8s/06-loadgen-job.yaml.
"""
from locust import HttpUser, LoadTestShape, constant, task


class Browser(HttpUser):
    # Tight wait so a modest user count still produces hundreds of RPS.
    wait_time = constant(0.01)

    @task
    def home(self):
        # X-Load-Test keeps this out of the real-visitor count.
        self.client.get("/", headers={"X-Load-Test": "1"})


class DemoShape(LoadTestShape):
    """Baseline, climb, hold a spike, then ease off so scale-down is visible."""

    stages = [
        (25, 2, 1),
        (55, 12, 4),
        (120, 36, 8),
        (170, 6, 6),
        (210, 1, 2),
    ]

    def tick(self):
        run_time = self.get_run_time()
        for duration, users, spawn_rate in self.stages:
            if run_time < duration:
                return users, spawn_rate
        return None
