#!/usr/bin/env bash
# ==============================================================================
# Deploy Capstone Autoscaler Stack to Azure Kubernetes Service (AKS)
# ==============================================================================

set -e

RESOURCE_GROUP="${1:-capstone-rg}"
LOCATION="${2:-eastus}"
CLUSTER_NAME="${3:-capstone-aks}"
NODE_SIZE="${4:-Standard_D2s_v5}"
MIN_NODES=1
MAX_NODES=4

echo "=========================================================="
echo "   Deploying Capstone Autoscaler Stack to Azure (AKS)     "
echo "=========================================================="

# 1. Check Azure Login
echo "[1/6] Checking Azure CLI login..."
az account show --output table || { echo "Run 'az login' first."; exit 1; }

# 2. Create Resource Group
echo "[2/6] Ensuring Resource Group: $RESOURCE_GROUP in $LOCATION..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output table

# 3. Create AKS Cluster
echo "[3/6] Provisioning AKS Cluster: $CLUSTER_NAME..."
az aks create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$CLUSTER_NAME" \
    --node-count 2 \
    --node-vm-size "$NODE_SIZE" \
    --enable-cluster-autoscaler \
    --min-count "$MIN_NODES" \
    --max-count "$MAX_NODES" \
    --generate-ssh-keys \
    --output table

# 4. Get Credentials
echo "[4/6] Configuring kubectl credentials..."
az aks get-credentials --resource-group "$RESOURCE_GROUP" --name "$CLUSTER_NAME" --overwrite-existing

# 5. Apply Manifests
echo "[5/6] Applying Kubernetes manifests..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(dirname "$SCRIPT_DIR")/k8s"
kubectl apply -k "$K8S_DIR"

# 6. Wait for LoadBalancer IPs
echo "[6/6] Waiting for Azure LoadBalancer public IPs..."
kubectl wait --namespace capstone --for=jsonpath='{.status.loadBalancer.ingress[0].ip}' service/nginx-lb --timeout=180s || true
kubectl wait --namespace capstone --for=jsonpath='{.status.loadBalancer.ingress[0].ip}' service/dashboard --timeout=180s || true

WEBSITE_IP=$(kubectl get svc nginx-lb -n capstone -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "Pending")
DASHBOARD_IP=$(kubectl get svc dashboard -n capstone -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "Pending")

echo ""
echo "=========================================================="
echo " 🎉 CAPSTONE SYSTEM SUCCESSFULLY DEPLOYED TO AZURE AKS!   "
echo "=========================================================="
echo ""
echo "  🛒 Live Target App (Nginx LB):  http://${WEBSITE_IP}:8090"
echo "  📊 Autoscaler Dashboard:        http://${DASHBOARD_IP}:3000"
echo ""
echo "Watch proactive autoscaling live:"
echo "  kubectl get pods -n capstone -l app=target-app -w"
echo "=========================================================="
