<#
.SYNOPSIS
    Deploy the Capstone autoscaler to Azure Kubernetes Service.
.DESCRIPTION
    Order of work:
      1. Check az login
      2. Register Container Service, Container Registry, Network, and Compute providers
      3. Preflight VM quota and whether the size exists in the region
      4. Create the resource group
      5. Create an Azure Container Registry, build, and push the four app images
      6. Create AKS (or reuse it) and attach that registry
      7. Apply k8s/ with images rewritten to <acr>.azurecr.io/<name>:latest
      8. Print the LoadBalancer address (one public IP: dashboard on port 80,
         storefront on port 8090)

    Azure for Students on this subscription allows only these regions:
    indiasouthcentral, centralindia, eastasia, koreacentral, malaysiawest.
    Quota in each region is 6 regional vCPUs and 4 vCPUs of the Standard BS
    family, so two 2-vCPU nodes and no third node for an upgrade surge.

    Standard_B2s is 4 GiB and does not fit the predictor next to system pods.
    The default is Standard_B2ms (2 vCPU, 8 GiB, same BS family). The cluster
    is a fixed 2 nodes: no cluster autoscaler, auto-upgrade none. Surge 0 is not
    settable on the System pool (AKS: max unavailable must be 0), so the default
    10% surge stays; it only matters during an upgrade, which never runs.

    Tear down when the demo is over:
      az group delete --name capstone-rg --yes --no-wait

    Does not start load. After the IPs print, run:
      .\deploy\load_gen.ps1

    ASCII only so Windows PowerShell 5.1 does not mis-read a UTF-8 file without a BOM.
#>
[CmdletBinding()]
param (
    [string]$ResourceGroup = "capstone-rg",
    [string]$Location      = "indiasouthcentral",
    [string]$ClusterName   = "capstone-aks",
    [string]$NodeSize      = "Standard_B2ms",
    [int]$NodeCount        = 2,
    [string]$AcrName       = ""
)

$ErrorActionPreference = "Stop"

function Assert-Exit {
    param([string]$Step)
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: $Step failed with exit code $LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

function Register-OneProvider {
    param([string]$Namespace)
    $ErrorActionPreference = "Continue"
    $state = az provider show --namespace $Namespace --query registrationState -o tsv 2>$null
    $ErrorActionPreference = "Stop"
    if ($LASTEXITCODE -ne 0 -or -not $state) {
        $state = "Unknown"
    }
    if ($state -eq "Registered") {
        Write-Host "  $Namespace is Registered"
        return
    }
    Write-Host "  Registering $Namespace (currently $state)..."
    az provider register --namespace $Namespace | Out-Null
    Assert-Exit "az provider register $Namespace"
    for ($i = 1; $i -le 18; $i++) {
        $state = az provider show --namespace $Namespace --query registrationState -o tsv
        Assert-Exit "az provider show $Namespace"
        if ($state -eq "Registered") {
            Write-Host "  $Namespace is Registered"
            return
        }
        Start-Sleep -Seconds 10
    }
    throw "ERROR: $Namespace is still '$state'. Wait and re-run."
}

function Invoke-QuotaPreflight {
    $skuJson = az vm list-skus --location $Location --size $NodeSize --resource-type virtualMachines -o json
    Assert-Exit "az vm list-skus"
    $skus = @($skuJson | ConvertFrom-Json | ForEach-Object { $_ })
    $sku = $skus | Where-Object { $_.name -eq $NodeSize } | Select-Object -First 1
    if (-not $sku) {
        throw "VM size $NodeSize is not offered in $Location. Student regions: indiasouthcentral, centralindia, eastasia, koreacentral, malaysiawest. Use Standard_B2ms."
    }
    if ($sku.restrictions) {
        foreach ($restriction in @($sku.restrictions)) {
            $reason = $restriction.reasonCode
            if ($reason -and $reason -ne "None") {
                throw "VM size $NodeSize is restricted in $Location ($reason). Stay on a student region and Standard_B2ms (BS family, 2 vCPU, 8 GiB)."
            }
        }
    }
    $vcpus = 2
    $vcpuCap = @($sku.capabilities) | Where-Object { $_.name -eq "vCPUs" } | Select-Object -First 1
    if ($vcpuCap -and $vcpuCap.value) {
        $vcpus = [int]$vcpuCap.value
    }
    $family = [string]$sku.family
    $usageJson = az vm list-usage --location $Location -o json
    Assert-Exit "az vm list-usage"
    $script:QuotaUsage = @($usageJson | ConvertFrom-Json | ForEach-Object { $_ })

    function Test-OneQuota {
        param([string]$Name, [int]$Need, [bool]$Fatal)
        $item = $script:QuotaUsage | Where-Object { $_.name.value -eq $Name } | Select-Object -First 1
        if (-not $item) {
            Write-Host "WARNING: quota '$Name' not listed; not blocking on it"
            return
        }
        $remaining = [int]$item.limit - [int]$item.currentValue
        Write-Host "Quota ${Name}: $remaining free, need $Need (limit $($item.limit), used $($item.currentValue))"
        if ($remaining -lt $Need) {
            $msg = "quota $Name has $remaining vCPUs left but this request needs $Need"
            if ($Fatal) {
                throw "ERROR: $msg. Lower -NodeCount or use Standard_B2ms. BS-family quota is 4 vCPU (two nodes, no surge)."
            }
            Write-Host "WARNING: $msg."
        }
    }

    $need = $NodeCount * $vcpus
    if ($family) { Test-OneQuota -Name $family -Need $need -Fatal $true }
    Test-OneQuota -Name "cores" -Need $need -Fatal $true
    Write-Host "Preflight OK: $NodeSize ($vcpus vCPU) x $NodeCount fixed node(s), family $family"
    Write-Host "No surge node is requested. A third node would exceed a 4 vCPU BS-family quota."
}

Write-Host "=========================================================="
Write-Host "   Deploying Capstone Autoscaler Stack to Azure (AKS)     "
Write-Host "=========================================================="
Write-Host "Resource group: $ResourceGroup"
Write-Host "Location:       $Location"
Write-Host "Cluster:        $ClusterName"
Write-Host "Node size:      $NodeSize  (fixed count $NodeCount, no autoscaler, auto-upgrade none)"
$allowed = @("indiasouthcentral", "centralindia", "eastasia", "koreacentral", "malaysiawest")
if ($allowed -notcontains $Location) {
    Write-Host "WARNING: $Location is not one of the regions this student subscription allows:"
    Write-Host "  indiasouthcentral, centralindia, eastasia, koreacentral, malaysiawest"
}
if ($NodeSize -eq "Standard_B2s") {
    Write-Host "WARNING: Standard_B2s has 4 GiB RAM. The predictor does not fit next to system pods."
    Write-Host "         Use Standard_B2ms (8 GiB, 2 vCPU, same BS-family quota)."
}

Write-Host ""
Write-Host "[1/8] Checking Azure CLI login..."
az account show --output table
Assert-Exit "az account show"

Write-Host ""
Write-Host "[2/8] Registering resource providers (no-op if already Registered)..."
Register-OneProvider -Namespace "Microsoft.Compute"
Register-OneProvider -Namespace "Microsoft.Network"
Register-OneProvider -Namespace "Microsoft.ContainerRegistry"
Register-OneProvider -Namespace "Microsoft.ContainerService"

Write-Host ""
Write-Host "[3/8] Preflight: VM size and vCPU quota in $Location..."
Invoke-QuotaPreflight

Write-Host ""
Write-Host "[4/8] Ensuring resource group $ResourceGroup in $Location..."
$ErrorActionPreference = "Continue"
$existingLoc = az group show --name $ResourceGroup --query location -o tsv 2>$null
$ErrorActionPreference = "Stop"
if ($LASTEXITCODE -eq 0 -and $existingLoc) {
    $want = ($Location -replace "\s", "").ToLower()
    $got = ($existingLoc -replace "\s", "").ToLower()
    if ($want -ne $got) {
        throw "Resource group $ResourceGroup already exists in '$existingLoc', not '$Location'. Pick another -ResourceGroup or pass -Location $existingLoc."
    }
    Write-Host "Resource group already exists in $existingLoc"
} else {
    az group create --name $ResourceGroup --location $Location --output table
    Assert-Exit "az group create"
}

Write-Host ""
Write-Host "[5/8] Ensuring Azure Container Registry and pushing images..."
if (-not $AcrName) {
    $sub = az account show --query id -o tsv
    Assert-Exit "az account show (subscription id)"
    $sub = ($sub -replace "-", "")
    if ($sub.Length -gt 12) { $sub = $sub.Substring(0, 12) }
    $AcrName = "cap$sub"
}
$AcrName = ($AcrName.ToLower() -replace "[^a-z0-9]", "")
if ($AcrName.Length -lt 5 -or $AcrName.Length -gt 50) {
    throw "ACR name '$AcrName' must be 5-50 alphanumeric characters."
}
# Names are global. check-name catches a collision in another subscription.
$acrAvailable = az acr check-name --name $AcrName --query nameAvailable -o tsv
Assert-Exit "az acr check-name"
$acrReason = az acr check-name --name $AcrName --query reason -o tsv
$ErrorActionPreference = "Continue"
az acr show --name $AcrName --resource-group $ResourceGroup -o none 2>$null
$ErrorActionPreference = "Stop"
$acrInGroup = ($LASTEXITCODE -eq 0)
if ($acrAvailable -ne "true") {
    if ($acrInGroup) {
        Write-Host "ACR $AcrName already exists in $ResourceGroup; reusing it"
    } else {
        if (-not $acrReason) { $acrReason = "taken" }
        throw "ACR name '$AcrName' is not available ($acrReason). Set -AcrName to another 5-50 character name and re-run."
    }
}
if ($acrInGroup) {
    Write-Host "ACR $AcrName already exists"
} else {
    az acr create --name $AcrName --resource-group $ResourceGroup --sku Basic --admin-enabled false --output table
    Assert-Exit "az acr create"
}
$LoginServer = az acr show --name $AcrName --query loginServer -o tsv
Assert-Exit "az acr show loginServer"
Write-Host "Registry: $LoginServer"

$root = Split-Path -Parent $PSScriptRoot
# ACR Tasks (az acr build) is not offered in indiasouthcentral
# (NoRegisteredProviderFound for registries/listBuildSourceUploadUrl), so build
# with the local Docker engine and push. az acr login uses a short-lived token,
# not an interactive login.
az acr login --name $AcrName
Assert-Exit "az acr login"
function Build-Image {
    param([string]$Name, [string]$Context)
    Write-Host "---- building ${LoginServer}/${Name}:latest from $Context"
    docker build -t "${LoginServer}/${Name}:latest" (Join-Path $root $Context)
    Assert-Exit "docker build $Name"
    docker push "${LoginServer}/${Name}:latest"
    Assert-Exit "docker push $Name"
}
Build-Image -Name "target-app" -Context "services/target-app"
Build-Image -Name "orchestrator" -Context "services/orchestrator"
Build-Image -Name "dashboard" -Context "services/dashboard"
Build-Image -Name "predictor" -Context "services/load-predictor"

Write-Host ""
Write-Host "[6/8] Ensuring AKS cluster $ClusterName (attached to $AcrName)..."
$ErrorActionPreference = "Continue"
az aks show --resource-group $ResourceGroup --name $ClusterName -o none 2>$null
$ErrorActionPreference = "Stop"
if ($LASTEXITCODE -eq 0) {
    Write-Host "Cluster already exists; attaching ACR in case it was not attached before"
    az aks update --resource-group $ResourceGroup --name $ClusterName --attach-acr $AcrName --output table
    Assert-Exit "az aks update --attach-acr"
} else {
    # Fixed node count. Autoscaler is off: the BS-family quota is 4 vCPU,
    # which is exactly these two nodes.
    az aks create `
        --resource-group $ResourceGroup `
        --name $ClusterName `
        --node-count $NodeCount `
        --node-vm-size $NodeSize `
        --auto-upgrade-channel none `
        --attach-acr $AcrName `
        --generate-ssh-keys `
        --output table
    Assert-Exit "az aks create"
}
# max-surge 0 is not possible here: the only pool is a System pool, and AKS
# rejects max-unavailable > 0 on System pools (InvalidParameter), while surge 0
# needs max-unavailable > 0. The default is max-surge 10% (1 node) and it only
# applies during an upgrade. Auto-upgrade is none, so no upgrade and no surge
# node happens unless someone runs one. Do not run az aks upgrade on this
# cluster: the surge node would exceed the 4 vCPU BS-family quota.
az aks update --resource-group $ResourceGroup --name $ClusterName --auto-upgrade-channel none --output table
Assert-Exit "az aks update --auto-upgrade-channel none"

Write-Host ""
Write-Host "[7/8] Configuring kubectl and applying manifests..."
az aks get-credentials --resource-group $ResourceGroup --name $ClusterName --overwrite-existing
Assert-Exit "az aks get-credentials"

# kustomize rejects an absolute resources path, and an overlay inside k8s/
# is a cycle. Keep it under deploy/ and point at ../../k8s.
$overlay = Join-Path $root "deploy/aks-overlay"
if (Test-Path $overlay) { Remove-Item -Recurse -Force $overlay }
New-Item -ItemType Directory -Path $overlay | Out-Null
$kustomize = @"
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../k8s
images:
  - name: capstone/target-app
    newName: $LoginServer/target-app
    newTag: latest
  - name: capstone/predictor
    newName: $LoginServer/predictor
    newTag: latest
  - name: capstone/orchestrator
    newName: $LoginServer/orchestrator
    newTag: latest
  - name: capstone/dashboard
    newName: $LoginServer/dashboard
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
"@
Set-Content -Path (Join-Path $overlay "kustomization.yaml") -Value $kustomize -Encoding Ascii
try {
    kubectl apply -k $overlay
    Assert-Exit "kubectl apply"
} finally {
    if (Test-Path $overlay) {
        Remove-Item -Recurse -Force $overlay
    }
}

Write-Host ""
Write-Host "[8/8] Waiting for the nginx-lb LoadBalancer address (up to 3 minutes)..."
Write-Host "The dashboard is ClusterIP. It is served on this same IP, port 80."
kubectl -n capstone rollout status deployment/nginx-lb --timeout=180s
if ($LASTEXITCODE -ne 0) { Write-Host "nginx-lb rollout still in progress" }
kubectl -n capstone rollout status deployment/dashboard --timeout=180s
if ($LASTEXITCODE -ne 0) { Write-Host "dashboard rollout still in progress" }

$websiteIp = ""
$elapsed = 0
while ($elapsed -lt 180 -and (-not $websiteIp)) {
    Start-Sleep -Seconds 10
    $elapsed += 10
    $ErrorActionPreference = "Continue"
    $websiteIp = kubectl get svc nginx-lb -n capstone -o jsonpath="{.status.loadBalancer.ingress[0].ip}" 2>$null
    $ErrorActionPreference = "Stop"
    Write-Host "Waiting for the nginx-lb IP... (${elapsed}s elapsed)"
}
if (-not $websiteIp) { $websiteIp = "Pending" }

Write-Host ""
Write-Host "=========================================================="
Write-Host " Capstone stack applied to AKS"
Write-Host "=========================================================="
Write-Host ""
Write-Host "  Target app (nginx):   http://${websiteIp}:8090"
Write-Host "  Autoscaler dashboard: http://${websiteIp}"
Write-Host "  Registry:             $LoginServer"
Write-Host ""
kubectl get pods -n capstone -o wide
Write-Host ""
Write-Host "Generate the demo spike (in-cluster Locust):"
Write-Host "  .\deploy\load_gen.ps1"
Write-Host ""
Write-Host "Watch replicas. Scale-up is immediate; scale-down waits 100s, then one pod:"
Write-Host "  kubectl get pods -n capstone -l app=target-app -w"
Write-Host ""
Write-Host "Tear down when the demo is over (deletes the cluster, registry, and IPs):"
Write-Host "  az group delete --name $ResourceGroup --yes --no-wait"
Write-Host "=========================================================="
