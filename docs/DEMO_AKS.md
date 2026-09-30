# AKS demo runbook

One path shows the same loop on Azure Kubernetes Service and on a local kind or minikube cluster:

traffic rises, the forecast mean moves ahead of live RPS, pods scale up before that live rate crosses what the current pods can serve, then pods step down after the spike instead of dropping to one replica in a single tick.

Do not point this at a production subscription. The scripts create a resource group, a Basic container registry, and a small AKS cluster. They were not executed against Azure in the change that added them.

## What you are showing

| Piece | Where |
|---|---|
| Target storefront | `target-app` behind `nginx-lb` (stub_status on `:8090/stub_status`) |
| Forecast | Python predictor, gRPC `:50051` |
| Replica decision | Go orchestrator, `:8082` `/api/target/status` |
| Dashboard | Static build, nginx proxies `/api/orchestrator/` to the orchestrator |

Each target pod is treated as **200 requests/second**. The cap is 10, which fits a 1-node student pool if the node is a 2-vCPU size. Scale-down waits 45 seconds, then removes one pod per window.

Three ways a scale-up is allowed. The orchestrator logs which one fired (`rule=...` on the orchestrator pod, and `scale_rule` on `/api/target/status`):

- `forecast-persistence` — the forecast **mean** (not the upper bound) has stayed above the current fleet's capacity for `PRESCALE_PERSIST_TICKS` (default 3). This is the pre-scale. Live RPS can still be flat.
- `forecast-margin` — a smoothed lead (mean minus live RPS, capped at `PRESCALE_MARGIN_CAP_RPS`, default 40) pushes the smoothed mean over current capacity. The cap is far below one pod, so an idle mean near 70 cannot clear 200.
- `slope` — live RPS is rising at least `RISING_SLOPE_RPS` (default 2 RPS/s). The raw upper bound is used on that same tick and projected `FORECAST_LEAD_SECONDS` (default 30) forward.
- `idle-guard` — none of the above. The noisy upper bound is capped at live RPS + `FLAT_HEADROOM_RPS` (default 50).

At idle the upper bound is `mean + z * std` (the error term is zero while live RPS is below the mean). Monte Carlo dropout redraws `std` every tick, and that draw is also a DQN input, so `z` moves with it. The bound jumps through roughly 180-440 RPS with almost no traffic. That jump is what `idle-guard` ignores. The dashboard still shows it. The mean is what pre-scale trusts, and only after it holds.

The original LSTM was trained on hourly samples and is served 24 seconds of live traffic, so it does not know this ramp. Pre-scale only leads if you load the NASA fine-tune (`MODEL_DIR`). Until then the mean will not clear 200 RPS ahead of the replay, and scale-up falls back to `slope`.

## 1. Azure (AKS)

Prerequisites on the machine you deploy from: Azure CLI (`az`), `kubectl`, and Python 3 (the bash quota check). `az login` with the student subscription selected. Docker is not required; `az acr build` builds in Azure.

```bash
az login
az account set --subscription "<student-subscription-name-or-id>"
az account show --output table
```

Quota check, registry, cluster, push, apply. Defaults are `eastus2` and `Standard_B2s` (2 vCPU, 1 node, autoscaler max 2). `Standard_D2s_v5` in `eastus` is a common student-quota failure; if `Standard_B2s` is restricted, rerun with `Standard_D2as_v5`.

```bash
chmod +x deploy/deploy_aks.sh deploy/load_gen.sh
./deploy/deploy_aks.sh
```

Same flow on Windows PowerShell 5.1 (ASCII script, stops on a failed `az`/`kubectl` exit code):

```powershell
.\deploy\deploy_aks.ps1
```

Overrides, bash then PowerShell:

```bash
./deploy/deploy_aks.sh capstone-rg eastus2 capstone-aks Standard_D2as_v5
```

```powershell
.\deploy\deploy_aks.ps1 -ResourceGroup capstone-rg -Location eastus2 -ClusterName capstone-aks -NodeSize Standard_D2as_v5 -NodeCount 1 -MaxNodes 2
```

The script refuses to continue when the size is not offered, when the size is restricted in that region, or when the family or regional vCPU quota cannot fit the initial node.

When it finishes, note the two addresses it prints:

```text
Target app (nginx):   http://<NGINX-IP>:8090
Autoscaler dashboard: http://<DASHBOARD-IP>
```

Confirm pods are Running before generating load. The predictor image is the slow one (model load, startup probe allows several minutes).

```bash
kubectl get pods -n capstone
kubectl -n capstone rollout status deployment/predictor
kubectl -n capstone rollout status deployment/orchestrator
```

Open the dashboard in a browser. It should show live RPS, forecast, upper bound, and current versus desired replicas. Those numbers come from `http://<DASHBOARD-IP>/api/orchestrator/api/target/status`, which nginx proxies to the orchestrator. You should not need a simulator URL.

Start the spike (in-cluster Locust) and watch pods in a second terminal:

```bash
kubectl get pods -n capstone -l app=target-app -w
./deploy/load_gen.sh
```

```powershell
kubectl get pods -n capstone -l app=target-app -w
.\deploy\load_gen.ps1
```

Optional lighter spike from the laptop (often not enough RPS to pass two pods):

```bash
./deploy/load_gen.sh --url "http://<NGINX-IP>:8090"
```

Direct checks while it runs:

```bash
curl -s "http://<DASHBOARD-IP>/api/orchestrator/api/target/status"
curl -s "http://<NGINX-IP>:8090/stub_status"
```

The status JSON fields to point at: `current_rps`, `predicted_mean`, `predicted_upper`, `active_replicas`, `desired_replicas`, `scaling`.

## 2. Local kind

Docker and kind required. Images are loaded into the node; there is no registry. `imagePullPolicy` stays `IfNotPresent`.

```bash
kind create cluster --name capstone
docker build -t capstone/target-app:latest services/target-app
docker build -t capstone/orchestrator:latest services/orchestrator
docker build -t capstone/predictor:latest services/load-predictor
docker build -t capstone/dashboard:latest services/dashboard
kind load docker-image capstone/target-app:latest --name capstone
kind load docker-image capstone/orchestrator:latest --name capstone
kind load docker-image capstone/predictor:latest --name capstone
kind load docker-image capstone/dashboard:latest --name capstone
kubectl apply -k k8s
kubectl -n capstone rollout status deployment/predictor --timeout=300s
kubectl -n capstone rollout status deployment/orchestrator --timeout=180s
```

kind does not give LoadBalancer IPs a public address by itself. Either install the kind Cloud Provider, or port-forward:

```bash
kubectl -n capstone port-forward svc/dashboard 8088:80
kubectl -n capstone port-forward svc/nginx-lb 8090:8090
```

Dashboard: `http://127.0.0.1:8088`. Storefront: `http://127.0.0.1:8090`.

`nginx:alpine` and `locustio/locust` are pulled by the cluster from Docker Hub when the pod starts. Then:

```bash
./deploy/load_gen.sh
kubectl get pods -n capstone -l app=target-app -w
```

## 3. Local minikube

```bash
minikube start --cpus=4 --memory=6144
eval "$(minikube docker-env)"
docker build -t capstone/target-app:latest services/target-app
docker build -t capstone/orchestrator:latest services/orchestrator
docker build -t capstone/predictor:latest services/load-predictor
docker build -t capstone/dashboard:latest services/dashboard
kubectl apply -k k8s
kubectl -n capstone rollout status deployment/predictor --timeout=300s
minikube service -n capstone dashboard --url
minikube service -n capstone nginx-lb --url
```

`minikube tunnel` (separate terminal, often needs sudo) is the other way to materialize LoadBalancer addresses. Load generation is the same `./deploy/load_gen.sh`.

## Retrain on the NASA trace

The forecaster has to see the ramp at 1-second cadence. `services/load-predictor/data/nasa_per_minute.csv` is the public NASA-KSC minute counts (Jul-Aug 1995). `finetune_nasa.py` drops the outage zeros from 1995-08-01 14:52 through 1995-08-03 04:36, smooths 7 minutes, compresses time 40x (one demo second per 40 real seconds), and scales the trace so the peak is 750 RPS. That peak is the 13 July morning, which is also `deploy/nasa_demo_window_10min.csv`. Training holds out 13 July, 20 July, 10 August, and 17 August. The target is RPS 30 seconds ahead, not the next second.

This does not overwrite `models/lstm_weights.pth`. Output goes to `models/nasa/`. CPU, a few GB of RAM, a few minutes to well under an hour.

Windows, from `services\load-predictor`:

```powershell
py -3 -m pip install torch --index-url https://download.pytorch.org/whl/cpu
py -3 -m pip install numpy
py -3 finetune_nasa.py --trace data\nasa_per_minute.csv --base-weights models\lstm_weights.pth --base-stats models\training_stats.json --out-dir models\nasa --epochs 6 --batch-size 256
```

Linux is the same command with `python3` and forward slashes. The script prints held-out MAE, RMSE, and median lead time (seconds before live RPS crosses 200, 400, and 600) for the new weights and for the original hourly weights. A shift of the real series by 30 seconds is the ceiling. Rising windows are up-weighted, and a stretched copy of them is added so the mean can pass the training-day peak (about 360 RPS) and cover this morning.

`services/load-predictor/models/nasa/` is that command, already run on CPU (6 epochs, batch 256). Held-out median lead: **23.5s** before 200 RPS, **18s** before 400, **24s** before 600. The original hourly weights on the same days led by **-6s** at 200 RPS and never reached 400 or 600. MAE 38 versus 63, RMSE 57 versus 97. Fraction of quiet seconds (under 80 RPS) whose forecast exceeded 200 was 0. `models/lstm_weights.pth` was not modified. The predictor manifest sets `MODEL_DIR=/app/models/nasa`. Re-running the command replaces that directory; it does not touch the original files.

The DQN only picks the z-score. Retrain it on the same trace if you want, into a new file. Do not point the server at it until that command has finished:

```powershell
py -3 finetune_rl_nasa.py --trace data\nasa_per_minute.csv --base-checkpoint models\rl_agent_checkpoint.pth --out models\nasa\rl_agent_checkpoint.pth --episodes 20 --max-steps 8000
```

Rebuild the predictor image so `models/nasa` is in it, then set `MODEL_DIR=/app/models/nasa` on the predictor Deployment. `training_stats.json` in that directory has `"forecast_source": "lstm"`, which makes the published mean the horizon forecast. Leaving `MODEL_DIR` unset keeps the original hourly weights. Rebuild the orchestrator image as well: the pre-scale rule is in that binary.

## Replay the morning

About 10 minutes, looped 3 times (30 minutes). Have the dashboard and `kubectl get pods -l app=target-app -w` up first.

```bash
./deploy/load_gen.sh --replay
```

```powershell
.\deploy\load_gen.ps1 -Replay
```

`k8s/06-loadgen-job.yaml` is still the short Locust spike. The replay is `k8s/07-nasa-replay-job.yaml` (python:3.12-slim, not part of `kubectl apply -k`).

## What to say, what to show

1. **Idle, before the replay.** "One pod is the warm floor. The upper bound on the chart can jump even though almost nothing is arriving. That is dropout noise. Desired replicas stays at 1. The log line would say `rule=idle-guard`."
2. **Start the replay.** "This is a real NASA morning, sped up 40 times. The orchestrator counts nginx requests, not the active-connection line."
3. **Before live RPS crosses 200.** Point at the forecast-mean line sitting above the live line, and at desired replicas moving to 2 while live RPS is still under 200. "The mean stayed over one pod's capacity for a few seconds, so this is `rule=forecast-persistence`, not a reaction to the slope. The pod is requested before the load is being served." Orchestrator log: `kubectl logs -n capstone -l app=orchestrator --tail=30`.
4. **If the ramp is already steep.** "`rule=slope` still scales on the same tick. We did not add a wait in front of a real rise."
5. **At the top.** "Each pod is budgeted at 200 RPS, cap 10."
6. **After the morning falls.** "Desired drops right away. The running count does not. Scale-down waits 45 seconds and then removes one pod at a time."
7. **Close on the numbers.** Gateway RPS, the "forecast leads by" line, desired replicas, and `scale_rule`. Raw JSON: the dashboard's `/api/orchestrator/api/target/status` (`forecast_lead_rps`, `scale_rule`, `raw_ml_mean`, `current_rps`).

If a pod stays in `ImagePullBackOff` on AKS, the registry was not attached or the overlay was not applied. Re-run `./deploy/deploy_aks.sh`; it attaches the registry again and rewrites image names to `<acr>.azurecr.io/...`. `capstone/<name>:latest` is only for kind and minikube.

## Local simulator rehearsal (not the AKS loop)

`scripts/demo_rehearsal.py` is the docker-compose storefront checklist. It restocks NexusGear itself (`scripts/prep_load_test_stock.py`) before checkout, and retries once on HTTP 409. You do not need a separate restock step unless you are running Locust by hand:

```bash
python scripts/prep_load_test_stock.py
python scripts/demo_rehearsal.py --runs 1
```

The compose orchestrator does not run the Kubernetes monitor, so it does not fight the simulator for the predictor's z-score. It also does not set `MODEL_DIR`, so that path still uses the original hourly weights.
