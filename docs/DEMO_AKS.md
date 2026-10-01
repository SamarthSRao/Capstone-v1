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

Each target pod is treated as **200 requests/second**. The cap is 10, which fits a 1-node student pool if the node is a 2-vCPU size. Scale-down waits 100 seconds, then removes one pod, and only if the busiest forecast mean or live RPS in that window fits in fewer pods.

The orchestrator logs which scale-up rule fired (`rule=...` on the orchestrator pod, and `scale_rule` on `/api/target/status`):

- `forecast-persistence` — the forecast **mean** (not the upper bound) has reached `PRESCALE_CAPACITY_FRACTION` of current capacity (default **80%**, so about 160 RPS on one pod). It has to hold for `PRESCALE_PERSIST_TICKS` (default 3), unless a real rise is already in progress, in which case it fires on that tick. A mean under 200 used to wait forever; 172 RPS is enough when the line is 160.
- `forecast-margin` — a smoothed lead (mean minus the median live RPS) pushes the smoothed mean over current capacity. The cap is the larger of `PRESCALE_MARGIN_CAP_RPS` (40) and `PRESCALE_MARGIN_FRACTION` of capacity (default 20%, which is 40 RPS on one pod and 80 on two). An idle mean near 70 still cannot clear 200.
- `slope` — a real ramp, not jitter. The rise must clear `max(RISING_SLOPE_RPS, RISING_SLOPE_FRACTION * capacity)` for `SLOPE_SUSTAIN_TICKS` ticks in a row. The slope is the change over `SLOPE_WINDOW_TICKS` seconds, then smoothed with `PRESCALE_SMOOTH_ALPHA` before it is used to size. The smoothed live RPS **or the forecast mean** must already be at `CAPACITY_FRACTION` of current capacity (default 70%). The size is that smoothed slope carried `FORECAST_LEAD_SECONDS` forward, or the forecast mean, whichever is larger, capped at the mean plus `SLOPE_SIZE_MARGIN_RPS` when the mean is present, plus `SLOPE_HEADROOM_RPS`. The raw upper bound is not an input.
- `live-capacity` — the **median** of the last `LIVE_MEDIAN_TICKS` live samples (default 3) is already at or above what the ready pods can serve. Scale-up is immediate once that median crosses. One sample of 657 RPS while the neighbors are ~380 does not add a pod. A slope that has already held may look `FORECAST_LEAD_SECONDS` ahead, with the same cap near the mean.
- `idle-guard` — none of the above. The noisy upper bound is capped at live RPS + `FLAT_HEADROOM_RPS` (default 50), including when the per-second change is a few RPS.

Defaults: `RISING_SLOPE_RPS=5`, `RISING_SLOPE_FRACTION=0.01`, `SLOPE_SUSTAIN_TICKS=3`, `SLOPE_WINDOW_TICKS=15`, `CAPACITY_FRACTION=0.70` (slope may look ahead once the smoothed rate is here), `PRESCALE_CAPACITY_FRACTION=0.80` (mean or a rising live median requests the next pod), `PRESCALE_MARGIN_FRACTION=0.20`, `PRESCALE_MARGIN_CAP_RPS=40`, `LIVE_MEDIAN_TICKS=3`, `SLOPE_HEADROOM_RPS=40`, `SLOPE_SIZE_MARGIN_RPS=80`, `FLAT_HEADROOM_RPS=50`, `FORECAST_LEAD_SECONDS=20`, `SCALE_DOWN_STABILIZATION_SEC=100`, `SCALE_DOWN_STEP=1`. All of those are env vars on the orchestrator Deployment. A rising smoothed live rate uses the same 3-tick slope hold, so jitter that is not actually climbing does not pre-scale.

Scale-down removes one pod after that 100 seconds, and only when the **maximum** of the forecast mean and live RPS across the same window fits in fewer pods. A dip of about 45 seconds at 130-150 RPS used to drop the second pod and then add it back. The longer window holds the extra pod through that dip. Tradeoff: after the morning actually falls, the extra pod stays for a bit longer than 45 seconds, and it stays until the busy sample has aged out of the window.

At idle the upper bound is `mean + z * std` (the error term is zero while live RPS is below the mean). Monte Carlo dropout redraws `std` every tick, and that draw is also a DQN input, so `z` moves with it. The bound jumps through roughly 180-440 RPS with almost no traffic, and on the NASA morning it jumped through 400-680 while live RPS was still 60-280. That jump used to unlock a scale-up whenever the second-to-second change was at least 2 RPS, which jitter does constantly. It does not anymore. The dashboard still shows the raw bound. The mean is what pre-scale trusts, and only after it holds.

Tradeoff: a very sharp ramp pre-scales a few seconds later than the old "any 2 RPS/s unlocks the upper bound" path, because the smoothed rate has to reach about 70% of the current pods and the rise has to hold for 3 seconds. The slope used for sizing is smoothed and, when the forecast mean is present, cannot run more than `SLOPE_SIZE_MARGIN_RPS` past that mean, so a noisy slope no longer adds several extra pods (the kind retest went from 4 to 7 at 612 RPS). If the mean itself lags a sharp ramp, those pods arrive closer to the crossing. A ramp that stays under the 70% bar scales when live RPS actually crosses capacity, on that same tick.

The original LSTM was trained on hourly samples and is served 24 seconds of live traffic, so it does not know this ramp. Pre-scale only leads if you load the NASA fine-tune (`MODEL_DIR`). Until then the mean will not clear 200 RPS ahead of the replay, and scale-up falls back to `slope`.

## 1. Azure (AKS)

Prerequisites on the machine you deploy from: Azure CLI (`az`), `kubectl`, and Python 3 (the bash quota check). `az login` with the student subscription selected. Docker is not required; `az acr build` builds in Azure.

```bash
az login
az account set --subscription "<student-subscription-name-or-id>"
az account show --output table
```

Quota check, registry, cluster, push, apply. This subscription (Azure for Students) may deploy only in `indiasouthcentral`, `centralindia`, `eastasia`, `koreacentral`, and `malaysiawest`. Each of those regions has **6 regional vCPUs** and **4 vCPUs of the Standard BS family**.

The default is **two** `Standard_B2ms` nodes (2 vCPU and 8 GiB each). That is the whole BS-family quota, so the cluster is fixed at 2 nodes: no cluster autoscaler, auto-upgrade channel `none`, node-pool max surge **0**. A surge node would be a third VM (6 vCPU of BS family) and Azure would deny it. Two nodes are started up front so the target-app range is schedulable without waiting for a scale-out that quota will not allow.

`Standard_B2s` is the same 2 vCPU and the same BS quota, but only **4 GiB** of RAM. After kube reserves memory, allocatable is under 3 GiB, which does not leave room for system pods and the predictor (the image is on the order of 4 GB, and the pod limit is 1 GiB). Use `Standard_B2ms`. It spends the same 2 vCPU of BS-family quota per node.

`MAX_REPLICAS` stays **10**. Each target pod requests 50m CPU and 64Mi memory. Two 2-vCPU nodes have about 1900m allocatable each (about 3800m together). System DaemonSets are on the order of a few hundred millicores per node. The fixed pods request 200m (predictor) + 50m (orchestrator) + 50m (nginx) + 20m (dashboard). That leaves well over 500m, which is 10 target pods. Their CPU **limits** (500m each) will share the 4 vCPUs and throttle if every pod is busy at once; the requests are what decide whether they schedule. B2ms memory (8 GiB, allocatable a bit over 6 GiB per node) holds the predictor limit plus 10 x 64Mi. B2s does not.

The script runs `az provider show` for `Microsoft.Compute`, `Microsoft.Network`, `Microsoft.ContainerRegistry`, and `Microsoft.ContainerService`, and `az vm list-usage` / `az vm list-skus` before it creates anything. It also runs `az acr check-name` so a registry name that already exists in another subscription fails before the build.

Cost: two B2ms nodes for as long as the resource group exists. Delete it when the demo is over. There is no separate "stop the cluster and keep the quota" path that frees the 4 vCPUs; the nodes have to go.

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
./deploy/deploy_aks.sh capstone-rg centralindia capstone-aks Standard_B2ms
```

```powershell
.\deploy\deploy_aks.ps1 -ResourceGroup capstone-rg -Location centralindia -ClusterName capstone-aks -NodeSize Standard_B2ms -NodeCount 2
```

The script refuses to continue when the size is not offered, when the size is restricted in that region, when the family or regional vCPU quota cannot fit the two nodes, or when the ACR name is already taken outside this resource group.

Tear down (cluster, registry, load balancers, and the public IPs):

```bash
az group delete --name capstone-rg --yes --no-wait
```

```powershell
az group delete --name capstone-rg --yes --no-wait
```

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

About 10 minutes, looped 3 times (30 minutes). The target reaches about 681 RPS and the generator is built to offer at least 800. Have the dashboard and `kubectl get pods -l app=target-app -w` up first.

```bash
./deploy/load_gen.sh --replay
```

```powershell
.\deploy\load_gen.ps1 -Replay
```

That starts an indexed Job, default **4** pods (`REPLAY_PARALLELISM`, or `--parallelism` / `-ReplayParallelism`). Each pod keeps HTTP connections open and sends `round(target) / N` of the rate (the remainder goes to the lower indexes). Requests are 50m CPU and 64Mi memory per pod, so four of them schedule on a 6 GB kind node and on a 2 vCPU AKS node. Limits are 400m / 192Mi. Set `REPLAY_PARALLELISM=2` if the node is already full.

Each pod logs `target_rps`, `shard_target_rps`, and `achieved_rps` every 30 seconds, and a `summary` line at the end with `achieved_rps` and `offered_rps`. `kubectl logs` is prefixed with the pod name. One process with a new connection per request saturated around 180-260 RPS, which hid the 600 RPS peak. Four keep-alive shards are what clears 800 **offered**.

`achieved_rps` is completed responses, which is also what nginx `stub_status` counts. Each target pod is budgeted at 200 RPS, so 800 RPS of completed traffic needs about four ready storefront pods. The Go storefront renders a small page and can do more than 200 RPS on a free core; nginx in front of it uses one worker, no access log, and a keepalive pool to the pods. A single 2 vCPU node that is also running the predictor, the orchestrator, nginx, and the generator pods will throttle before a sustained 800 of completed requests. Kind, where the node has spare CPU, is the rate check: read `achieved_rps` against `target_rps` in the replay logs. Until the scaler has added pods, achieved RPS flattens at whatever the current pods finish.

`k8s/06-loadgen-job.yaml` is still the short Locust spike. The replay is `k8s/07-nasa-replay-job.yaml` (python:3.12-slim, not part of `kubectl apply -k`). Regenerate it with `python3 deploy/render_nasa_job.py` after editing `deploy/nasa_replay.py`.

## What to say, what to show

1. **Idle, before the replay.** "One pod is the warm floor. The upper bound on the chart can jump even though almost nothing is arriving. That is dropout noise. Desired replicas stays at 1. The log line would say `rule=idle-guard`."
2. **Start the replay.** "This is a real NASA morning, sped up 40 times. The orchestrator counts nginx requests, not the active-connection line."
3. **Before live RPS crosses 200, around 160.** Point at desired replicas moving to 2 while live RPS is still near 80% of one pod. "The forecast mean, or a live rate that has actually been rising, reached about 160 RPS. That is `rule=forecast-persistence` or `rule=slope`. The pod is requested before the load fills the one we have." Orchestrator log: `kubectl logs -n capstone -l app=orchestrator --tail=30`.
4. **If the ramp is already steep and live RPS is near what the current pods can serve.** "`rule=slope` adds pods from the smoothed rise carried forward 20 seconds, and it will not size past the forecast mean by more than a small margin. It does not use the upper bound. A wiggle of a few RPS per second while you are well under capacity does not count. If live RPS is already over capacity, `rule=live-capacity` adds the pod on that same tick."
5. **At the top.** "Each pod is budgeted at 200 RPS, cap 10. The replay log's `achieved_rps` is what nginx actually finished, next to `target_rps`."
6. **After the morning falls.** "Desired drops right away. The running count does not. Scale-down waits 100 seconds, checks that the busiest live rate and forecast in that window fit in fewer pods, and then removes one pod."
7. **Close on the numbers.** Gateway RPS, the "forecast leads by" line, desired replicas, and `scale_rule`. Raw JSON: the dashboard's `/api/orchestrator/api/target/status` (`forecast_lead_rps`, `scale_rule`, `raw_ml_mean`, `current_rps`).

If a pod stays in `ImagePullBackOff` on AKS, the registry was not attached or the overlay was not applied. Re-run `./deploy/deploy_aks.sh`; it attaches the registry again and rewrites image names to `<acr>.azurecr.io/...`. `capstone/<name>:latest` is only for kind and minikube.

## Local simulator rehearsal (not the AKS loop)

`scripts/demo_rehearsal.py` is the docker-compose storefront checklist. It restocks NexusGear itself (`scripts/prep_load_test_stock.py`) before checkout, and retries once on HTTP 409. You do not need a separate restock step unless you are running Locust by hand:

```bash
python scripts/prep_load_test_stock.py
python scripts/demo_rehearsal.py --runs 1
```

The compose orchestrator does not run the Kubernetes monitor, so it does not fight the simulator for the predictor's z-score. It also does not set `MODEL_DIR`, so that path still uses the original hourly weights.
