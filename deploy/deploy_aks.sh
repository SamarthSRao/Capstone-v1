#!/usr/bin/env bash
# Deploy the Capstone autoscaler to Azure Kubernetes Service.
#
# What this actually does (in order):
#   1. Check az login
#   2. Register Microsoft.ContainerService / ContainerRegistry / Network / Compute
#   3. Preflight VM quota and whether the size is offered in the region
#   4. Create the resource group
#   5. Create an Azure Container Registry, build and push the four app images
#   6. Create AKS (or reuse it) and attach that registry
#   7. Apply k8s/ with the images rewritten to <acr>.azurecr.io/<name>:latest
#   8. Print the LoadBalancer addresses
#
# Azure for Students on this subscription allows only:
#   indiasouthcentral, centralindia, eastasia, koreacentral, malaysiawest
# Quota in each region: 6 regional vCPUs, and 4 vCPUs of the Standard BS
# family. That is two 2-vCPU nodes and no third node for an upgrade surge.
#
# Standard_B2s is 2 vCPU and 4 GiB. Allocatable memory is under 3 GiB after
# kube and the system pods, which is not enough for the predictor image
# alongside the rest of the stack. The default is Standard_B2ms (2 vCPU,
# 8 GiB, same BS family, so two nodes are still 4 vCPU).
#
# The cluster is a fixed 2 nodes. Cluster autoscaler is off, auto-upgrade
# is none, and the node pool max surge is 0. A surge node would ask for
# 6 vCPU of BS family and the create or upgrade would be denied.
#
#   ./deploy/deploy_aks.sh
#   ./deploy/deploy_aks.sh my-rg centralindia my-aks Standard_B2ms
#
# Env overrides (win over defaults, lose to positional args when those are set):
#   RESOURCE_GROUP LOCATION CLUSTER_NAME NODE_SIZE NODE_COUNT ACR_NAME
#
# Tear the whole thing down (registry, cluster, and the public IPs):
#   az group delete --name capstone-rg --yes --no-wait
#
# This script does not start the load generator. After the IPs print, run:
#   ./deploy/load_gen.sh

set -euo pipefail

RESOURCE_GROUP="${1:-${RESOURCE_GROUP:-capstone-rg}}"
LOCATION="${2:-${LOCATION:-indiasouthcentral}}"
CLUSTER_NAME="${3:-${CLUSTER_NAME:-capstone-aks}}"
NODE_SIZE="${4:-${NODE_SIZE:-Standard_B2ms}}"
NODE_COUNT="${NODE_COUNT:-2}"
ACR_NAME="${ACR_NAME:-}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=========================================================="
echo "   Deploying Capstone Autoscaler Stack to Azure (AKS)     "
echo "=========================================================="
echo "Resource group: $RESOURCE_GROUP"
echo "Location:       $LOCATION"
echo "Cluster:        $CLUSTER_NAME"
echo "Node size:      $NODE_SIZE  (fixed count $NODE_COUNT, max surge 0, no autoscaler)"
case "$LOCATION" in
  indiasouthcentral|centralindia|eastasia|koreacentral|malaysiawest) ;;
  *)
    echo "WARNING: $LOCATION is not one of the regions this student subscription allows:"
    echo "  indiasouthcentral, centralindia, eastasia, koreacentral, malaysiawest"
    ;;
esac
case "$NODE_SIZE" in
  Standard_B2s|standard_b2s)
    echo "WARNING: Standard_B2s has 4 GiB RAM. The predictor does not fit next to system pods."
    echo "         Use Standard_B2ms (8 GiB, 2 vCPU, same BS-family quota)."
    ;;
esac

echo
echo "[1/8] Checking Azure CLI login..."
az account show --output table

echo
echo "[2/8] Registering resource providers (no-op if already Registered)..."
register_provider() {
  local ns="$1"
  local state
  state="$(az provider show --namespace "$ns" --query registrationState -o tsv 2>/dev/null || echo "Unknown")"
  if [ "$state" = "Registered" ]; then
    echo "  $ns is Registered"
    return 0
  fi
  echo "  Registering $ns (currently $state)..."
  az provider register --namespace "$ns" >/dev/null
  local i
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18; do
    state="$(az provider show --namespace "$ns" --query registrationState -o tsv)"
    if [ "$state" = "Registered" ]; then
      echo "  $ns is Registered"
      return 0
    fi
    sleep 10
  done
  echo "ERROR: $ns is still '$state'. Wait and re-run. 'az provider register -n $ns' can take several minutes the first time."
  exit 1
}
register_provider Microsoft.Compute
register_provider Microsoft.Network
register_provider Microsoft.ContainerRegistry
register_provider Microsoft.ContainerService

echo
echo "[3/8] Preflight: VM size and vCPU quota in $LOCATION..."
preflight_quota() {
  local sku_file usage_file
  sku_file="$(mktemp)"
  usage_file="$(mktemp)"
  az vm list-skus --location "$LOCATION" --size "$NODE_SIZE" -o json >"$sku_file"
  az vm list-usage --location "$LOCATION" -o json >"$usage_file"
  python3 - "$sku_file" "$usage_file" "$NODE_SIZE" "$NODE_COUNT" <<'PY'
import json, sys
sku_path, usage_path, size, nodes = sys.argv[1:]
nodes = int(nodes)
skus = json.load(open(sku_path))
sku = next((s for s in skus if s.get("name") == size), None)
if sku is None:
    sys.exit(
        "ERROR: VM size %s is not offered in this region.\n"
        "Student regions: indiasouthcentral, centralindia, eastasia, koreacentral, malaysiawest.\n"
        "Use Standard_B2ms (8 GiB). Standard_B2s is 4 GiB and will not fit the predictor."
        % size
    )
for restriction in sku.get("restrictions") or []:
    reason = restriction.get("reasonCode") or ""
    if reason and reason != "None":
        sys.exit(
            "ERROR: %s is restricted in this region (%s).\n"
            "Stay on a student region and Standard_B2ms (BS family, 2 vCPU, 8 GiB)."
            % (size, reason)
        )
vcpus = 2
for cap in sku.get("capabilities") or []:
    if cap.get("name") == "vCPUs":
        vcpus = int(cap.get("value") or 2)
family = sku.get("family") or ""
usage = json.load(open(usage_path))

def row(name):
    for item in usage:
        if (item.get("name") or {}).get("value") == name:
            return item
    return None

def check(name, need, fatal):
    item = row(name)
    if item is None:
        print("WARNING: quota '%s' not listed; not blocking on it" % name)
        return
    remaining = int(item["limit"]) - int(item["currentValue"])
    print("Quota %s: %d free, need %d (limit %s, used %s)" % (
        name, remaining, need, item["limit"], item["currentValue"]))
    if remaining < need:
        msg = "quota %s has %d vCPUs left but this request needs %d" % (name, remaining, need)
        if fatal:
            sys.exit(
                "ERROR: " + msg + ".\n"
                "Lower NODE_COUNT, pick Standard_B2ms, or request a quota increase.\n"
                "This subscription's BS-family quota is 4 vCPU, which is two nodes and no surge."
            )
        print("WARNING: " + msg + ". The initial node fits; autoscaler growth may be denied.")

need = nodes * vcpus
if family:
    check(family, need, True)
check("cores", need, True)
print("Preflight OK: %s (%d vCPU) x %d fixed node(s), family %s" % (size, vcpus, nodes, family or "unknown"))
print("No surge node is requested. A third node would be %d more vCPU and exceeds a 4 vCPU BS-family quota." % vcpus)
PY
  rm -f "$sku_file" "$usage_file"
}
preflight_quota

echo
echo "[4/8] Ensuring resource group $RESOURCE_GROUP in $LOCATION..."
if az group show --name "$RESOURCE_GROUP" >/dev/null 2>&1; then
  existing="$(az group show --name "$RESOURCE_GROUP" --query location -o tsv)"
  # Azure returns locations without spaces, lowercased (eastus2).
  want="$(echo "$LOCATION" | tr -d ' ' | tr '[:upper:]' '[:lower:]')"
  got="$(echo "$existing" | tr -d ' ' | tr '[:upper:]' '[:lower:]')"
  if [ "$want" != "$got" ]; then
    echo "ERROR: resource group $RESOURCE_GROUP already exists in '$existing', not '$LOCATION'."
    echo "Pick another RESOURCE_GROUP name or pass -Location $existing."
    exit 1
  fi
  echo "Resource group already exists in $existing"
else
  az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output table
fi

echo
echo "[5/8] Ensuring Azure Container Registry and pushing images..."
if [ -z "$ACR_NAME" ]; then
  sub="$(az account show --query id -o tsv | tr -d '-' | cut -c1-12)"
  ACR_NAME="cap${sub}"
fi
ACR_NAME="$(echo "$ACR_NAME" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')"
if [ "${#ACR_NAME}" -lt 5 ] || [ "${#ACR_NAME}" -gt 50 ]; then
  echo "ERROR: ACR name '$ACR_NAME' must be 5-50 alphanumeric characters."
  exit 1
fi
# Names are global. check-name catches a collision in another subscription
# before az acr create fails halfway through the deploy.
acr_available="$(az acr check-name --name "$ACR_NAME" --query nameAvailable -o tsv)"
acr_reason="$(az acr check-name --name "$ACR_NAME" --query reason -o tsv)"
if [ "$acr_available" != "true" ]; then
  if az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
    echo "ACR $ACR_NAME already exists in $RESOURCE_GROUP; reusing it"
  else
    echo "ERROR: ACR name '$ACR_NAME' is not available (${acr_reason:-taken})."
    echo "Set ACR_NAME to another 5-50 character alphanumeric name and re-run."
    exit 1
  fi
fi
if az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  echo "ACR $ACR_NAME already exists"
else
  az acr create \
    --name "$ACR_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --sku Basic \
    --admin-enabled false \
    --output table
fi
LOGIN_SERVER="$(az acr show --name "$ACR_NAME" --query loginServer -o tsv)"
echo "Registry: $LOGIN_SERVER"

# az acr build uploads the context and pushes :latest. No local docker required.
build_image() {
  local name="$1"
  local context="$2"
  echo "---- building ${LOGIN_SERVER}/${name}:latest from ${context}"
  az acr build --registry "$ACR_NAME" --image "${name}:latest" "$context"
}
build_image target-app services/target-app
build_image orchestrator services/orchestrator
build_image dashboard services/dashboard
build_image predictor services/load-predictor

echo
echo "[6/8] Ensuring AKS cluster $CLUSTER_NAME (attached to $ACR_NAME)..."
if az aks show --resource-group "$RESOURCE_GROUP" --name "$CLUSTER_NAME" >/dev/null 2>&1; then
  echo "Cluster already exists; attaching ACR in case it was not attached before"
  az aks update \
    --resource-group "$RESOURCE_GROUP" \
    --name "$CLUSTER_NAME" \
    --attach-acr "$ACR_NAME" \
    --output table
else
  # Fixed node count. Autoscaler is off on purpose: the BS-family quota
  # is 4 vCPU, which is exactly these two nodes.
  az aks create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$CLUSTER_NAME" \
    --node-count "$NODE_COUNT" \
    --node-vm-size "$NODE_SIZE" \
    --auto-upgrade-channel none \
    --attach-acr "$ACR_NAME" \
    --generate-ssh-keys \
    --output table
fi
# A surge node during an upgrade would be a third VM and would exceed the
# 4 vCPU BS-family quota. 0 disables that extra node. Auto-upgrade stays off.
pool="$(az aks nodepool list --resource-group "$RESOURCE_GROUP" --cluster-name "$CLUSTER_NAME" --query '[0].name' -o tsv)"
az aks nodepool update \
  --resource-group "$RESOURCE_GROUP" \
  --cluster-name "$CLUSTER_NAME" \
  --name "$pool" \
  --max-surge 0 \
  --output table
az aks update \
  --resource-group "$RESOURCE_GROUP" \
  --name "$CLUSTER_NAME" \
  --auto-upgrade-channel none \
  --output table

echo
echo "[7/8] Configuring kubectl and applying manifests..."
az aks get-credentials --resource-group "$RESOURCE_GROUP" --name "$CLUSTER_NAME" --overwrite-existing

# kustomize rejects an absolute resources path, and an overlay inside k8s/
# is detected as a cycle. Keep it next to this script and point at ../../k8s.
OVERLAY="$ROOT/deploy/aks-overlay"
rm -rf "$OVERLAY"
mkdir -p "$OVERLAY"
trap 'rm -rf "$ROOT/deploy/aks-overlay"' EXIT
cat >"$OVERLAY/kustomization.yaml" <<EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../k8s
images:
  - name: capstone/target-app
    newName: ${LOGIN_SERVER}/target-app
    newTag: latest
  - name: capstone/predictor
    newName: ${LOGIN_SERVER}/predictor
    newTag: latest
  - name: capstone/orchestrator
    newName: ${LOGIN_SERVER}/orchestrator
    newTag: latest
  - name: capstone/dashboard
    newName: ${LOGIN_SERVER}/dashboard
    newTag: latest
patches:
  - target:
      kind: Deployment
      name: target-app
    patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: target-app
        namespace: capstone
      spec:
        template:
          spec:
            containers:
              - name: target-app
                imagePullPolicy: Always
  - target:
      kind: Deployment
      name: predictor
    patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: predictor
        namespace: capstone
      spec:
        template:
          spec:
            containers:
              - name: predictor
                imagePullPolicy: Always
  - target:
      kind: Deployment
      name: orchestrator
    patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: orchestrator
        namespace: capstone
      spec:
        template:
          spec:
            containers:
              - name: orchestrator
                imagePullPolicy: Always
  - target:
      kind: Deployment
      name: dashboard
    patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: dashboard
        namespace: capstone
      spec:
        template:
          spec:
            containers:
              - name: dashboard
                imagePullPolicy: Always
EOF
kubectl apply -k "$OVERLAY"
rm -rf "$OVERLAY"

echo
echo "[8/8] Waiting for LoadBalancer addresses (up to 3 minutes)..."
kubectl -n capstone rollout status deployment/nginx-lb --timeout=180s || true
kubectl -n capstone rollout status deployment/dashboard --timeout=180s || true
kubectl wait --namespace capstone --for=jsonpath='{.status.loadBalancer.ingress[0].ip}' service/nginx-lb --timeout=180s || true
kubectl wait --namespace capstone --for=jsonpath='{.status.loadBalancer.ingress[0].ip}' service/dashboard --timeout=180s || true

WEBSITE_IP="$(kubectl get svc nginx-lb -n capstone -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)"
DASHBOARD_IP="$(kubectl get svc dashboard -n capstone -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)"
if [ -z "$WEBSITE_IP" ]; then WEBSITE_IP="Pending"; fi
if [ -z "$DASHBOARD_IP" ]; then DASHBOARD_IP="Pending"; fi

echo
echo "=========================================================="
echo " Capstone stack applied to AKS"
echo "=========================================================="
echo
echo "  Target app (nginx):   http://${WEBSITE_IP}:8090"
echo "  Autoscaler dashboard: http://${DASHBOARD_IP}"
echo "  Registry:             ${LOGIN_SERVER}"
echo
kubectl get pods -n capstone -o wide || true
echo
echo "Generate the demo spike (in-cluster Locust, hits nginx directly):"
echo "  ./deploy/load_gen.sh"
echo
echo "Watch replicas. Scale-up is immediate; scale-down waits 100s, then one pod:"
echo "  kubectl get pods -n capstone -l app=target-app -w"
echo
echo "Tear down when the demo is over (deletes the cluster, registry, and IPs):"
echo "  az group delete --name $RESOURCE_GROUP --yes --no-wait"
echo "=========================================================="
