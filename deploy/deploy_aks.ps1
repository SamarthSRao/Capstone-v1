<#
.SYNOPSIS
    Provisions Azure Kubernetes Service (AKS) with Cluster Autoscaler and deploys the Capstone platform.
.DESCRIPTION
    1. Provisions Resource Group and AKS Cluster with Cluster Autoscaler (1 to 5 nodes).
    2. Attaches ACR (or builds/loads images).
    3. Deploys Kubernetes manifests (RBAC, Predictor, Orchestrator, Target App, Dashboard).
    4. Retrieves Public IP endpoints for Evaluator Testing.
#>

param (
    [string]$ResourceGroup = "capstone-rg",
    [string]$Location      = "eastus",
    [string]$ClusterName   = "capstone-aks",
    [string]$NodeSize      = "Standard_D2s_v5",
    [int]$MinNodes         = 1,
    [int]$MaxNodes         = 4
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   Deploying Capstone Autoscaler Stack to Azure (AKS)     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verify Azure CLI login
Write-Host "`n[1/6] Checking Azure CLI login..." -ForegroundColor Yellow
$account = az account show --output json 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host "Please log in to Azure first by running: az login" -ForegroundColor Red
    exit 1
}
Write-Host "Active Subscription: $($account.name) ($($account.id))" -ForegroundColor Green

# 2. Create Resource Group
Write-Host "`n[2/6] Ensuring Resource Group: $ResourceGroup in $Location..." -ForegroundColor Yellow
az group create --name $ResourceGroup --location $Location --output table

# 3. Create AKS Cluster with Cluster Autoscaler
Write-Host "`n[3/6] Provisioning AKS Cluster: $ClusterName (Node Size: $NodeSize, Autoscaling: $MinNodes - $MaxNodes)..." -ForegroundColor Yellow
az aks create `
    --resource-group $ResourceGroup `
    --name $ClusterName `
    --node-count 2 `
    --node-vm-size $NodeSize `
    --enable-cluster-autoscaler `
    --min-count $MinNodes `
    --max-count $MaxNodes `
    --generate-ssh-keys `
    --output table

# 4. Connect kubectl to AKS Cluster
Write-Host "`n[4/6] Configuring kubectl credentials..." -ForegroundColor Yellow
az aks get-credentials --resource-group $ResourceGroup --name $ClusterName --overwrite-existing

# 5. Apply Kubernetes Manifests
Write-Host "`n[5/6] Applying Kubernetes manifests from k8s/..." -ForegroundColor Yellow
$k8sDir = Join-Path (Split-Path -Parent $PSScriptRoot) "k8s"
kubectl apply -k $k8sDir

# 6. Wait for LoadBalancer External IPs
Write-Host "`n[6/6] Waiting for Azure Public IPs to be assigned (this may take ~60 seconds)..." -ForegroundColor Yellow
$timeout = 180
$elapsed = 0
$websiteIp = ""
$dashboardIp = ""

while ($elapsed -lt $timeout -and (-not $websiteIp -or -not $dashboardIp)) {
    Start-Sleep -Seconds 10
    $elapsed += 10

    if (-not $websiteIp) {
        $websiteIp = kubectl get svc nginx-lb -n capstone -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>$null
    }
    if (-not $dashboardIp) {
        $dashboardIp = kubectl get svc dashboard -n capstone -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>$null
    }
    Write-Host "Waiting for external IPs... (${elapsed}s elapsed)"
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host " 🎉 CAPSTONE SYSTEM SUCCESSFULLY DEPLOYED TO AZURE AKS!   " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  🛒 Live Target App (Nginx LB):  http://${websiteIp}:8090" -ForegroundColor Cyan
Write-Host "  📊 Autoscaler Dashboard:        http://${dashboardIp}:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Cluster Status:" -ForegroundColor Yellow
kubectl get pods -n capstone -o wide
Write-Host ""
Write-Host "To watch proactive autoscaling live during traffic simulation:" -ForegroundColor White
Write-Host "  kubectl get pods -n capstone -l app=target-app -w" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
