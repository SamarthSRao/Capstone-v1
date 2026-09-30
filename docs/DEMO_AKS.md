# AKS demo runbook

One path shows the same loop on Azure Kubernetes Service and on a local kind or minikube cluster:

traffic rises, the forecast upper bound moves, pods scale up before the peak is fully being served, then pods step down after the spike instead of dropping to one replica in a single tick.

Do not point this at a production subscription. The scripts create a resource group, a Basic container registry, and a small AKS cluster. They were not executed against Azure in the change that added them.

## What you are showing

| Piece | Where |
|---|---|
| Target storefront | `target-app` behind `nginx-lb` (stub_status on `:8090/stub_status`) |
| Forecast | Python predictor, gRPC `:50051` |
| Replica decision | Go orchestrator, `:8082` `/api/target/status` |
| Dashboard | Static build, nginx proxies `/api/orchestrator/` to the orchestrator |

Each target pod is treated as **200 requests/second**. The cap is 10, which fits a 1-node student pool if the node is a 2-vCPU size. Scale-up has no cooldown once requests per second are rising (default slope at least 2 RPS/s, `RISING_SLOPE_RPS`). Scale-down waits 45 seconds, then removes one pod per window.

At idle the forecast mean sits near 70 RPS and the standard deviation near 100. The upper bound is `mean + z * std` (the error term is zero while live RPS is below the mean). Monte Carlo dropout redraws `std` every tick, and that value is also a DQN input, so `z` moves with it. The bound therefore jumps through roughly 180-440 RPS without any real traffic, which is enough to cross into a second or third pod. While RPS is flat the orchestrator caps the rate it will scale on at live RPS + `FLAT_HEADROOM_RPS` (default 50), so that noise stays on one pod. The dashboard still shows the raw upper bound. As soon as RPS is rising, the raw bound is used immediately and is projected 30 seconds forward.

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

## What to say, what to show

About four minutes. Have the dashboard and `kubectl get pods -l app=target-app -w` visible before you start Locust.

1. **Idle.** "One pod is the warm floor. The upper bound on the chart can jump even though almost nothing is arriving. That is dropout noise in the uncertainty, not a traffic forecast. Desired replicas stays at 1 until requests per second actually turn up."
2. **Start the load job.** "Locust is inside the cluster, hitting the storefront through nginx. The orchestrator reads nginx's request counter, not the active-connection line, so this RPS is real."
3. **As the curve climbs.** "Desired replicas moves with the upper bound, and the slope is projected about 30 seconds forward. That is the pod start time. New pods show up in kubectl while requests per second is still rising. Readiness probes keep them out of the Service until `/health` passes."
4. **At the top.** "Each pod is budgeted at 200 RPS. The count is that forecast divided across pods, plus one extra pod only when the fleet would be fully saturated. It will not jump to 10 unless the forecast actually needs 10."
5. **After Locust eases off.** "Desired drops right away. The running count does not. Scale-down waits 45 seconds and then removes one pod at a time, so we do not go from a full fleet back to one pod in a single second. `preStop` sleeps five seconds so nginx can finish in-flight requests."
6. **Close on the dashboard numbers.** Point at current RPS, upper bound, current replicas, desired replicas. If you want the raw JSON: the dashboard's `/api/orchestrator/api/target/status`.

If a pod stays in `ImagePullBackOff` on AKS, the registry was not attached or the overlay was not applied. Re-run `./deploy/deploy_aks.sh`; it attaches the registry again and rewrites image names to `<acr>.azurecr.io/...`. `capstone/<name>:latest` is only for kind and minikube.

## Local simulator rehearsal (not the AKS loop)

`scripts/demo_rehearsal.py` is the docker-compose storefront checklist. It restocks NexusGear itself (`scripts/prep_load_test_stock.py`) before checkout, and retries once on HTTP 409. You do not need a separate restock step unless you are running Locust by hand:

```bash
python scripts/prep_load_test_stock.py
python scripts/demo_rehearsal.py --runs 1
```

The compose orchestrator does not run the Kubernetes monitor, so it does not fight the simulator for the predictor's z-score. Model weights are unchanged.
