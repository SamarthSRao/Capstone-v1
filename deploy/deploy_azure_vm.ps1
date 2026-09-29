<#
.SYNOPSIS
    Deploys the Capstone Cloud Autoscaler stack onto an Azure Ubuntu Virtual Machine.
.DESCRIPTION
    Creates an Azure Resource Group, Virtual Network, NSG with required ports
    (8090, 3000, 8082, 8080, 8083, 22), provisions an Ubuntu VM, and configures the environment.
#>

param (
    [string]$ResourceGroup = "capstone-rg",
    [string]$Location      = "eastus",
    [string]$VmName        = "capstone-autoscaler-vm",
    [string]$VmSize        = "Standard_D2s_v5",
    [string]$AdminUser     = "azureuser"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Provisioning Capstone Infrastructure on Microsoft Azure " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verify Azure CLI login
Write-Host "`n[1/5] Checking Azure CLI login..." -ForegroundColor Yellow
$account = az account show --output json 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host "Please log in to Azure first by running: az login" -ForegroundColor Red
    exit 1
}
Write-Host "Using Azure Subscription: $($account.name) ($($account.id))" -ForegroundColor Green

# 2. Create Resource Group
Write-Host "`n[2/5] Creating Resource Group: $ResourceGroup in $Location..." -ForegroundColor Yellow
az group create --name $ResourceGroup --location $Location --output table

# 3. Create Network Security Group & Inbound Rules
Write-Host "`n[3/5] Creating NSG & opening ports (8090, 3000, 8082, 8080, 8083, 22)..." -ForegroundColor Yellow
$nsgName = "$($VmName)-nsg"
az network nsg create --resource-group $ResourceGroup --name $nsgName --output none

$rules = @(
    @{ Name = "Allow-SSH"; Port = "22"; Priority = 1000 },
    @{ Name = "Allow-Storefront"; Port = "8090"; Priority = 1010 },
    @{ Name = "Allow-Dashboard"; Port = "3000"; Priority = 1020 },
    @{ Name = "Allow-Orchestrator"; Port = "8082"; Priority = 1030 },
    @{ Name = "Allow-API"; Port = "8080"; Priority = 1040 },
    @{ Name = "Allow-Simulator"; Port = "8083"; Priority = 1050 }
)

foreach ($r in $rules) {
    az network nsg rule create `
        --resource-group $ResourceGroup `
        --nsg-name $nsgName `
        --name $r.Name `
        --priority $r.Priority `
        --access Allow `
        --direction Inbound `
        --protocol Tcp `
        --destination-port-ranges $r.Port `
        --output none
}
Write-Host "NSG rules configured." -ForegroundColor Green

# 4. Create VM
Write-Host "`n[4/5] Provisioning Ubuntu 22.04 LTS VM: $VmName ($VmSize)..." -ForegroundColor Yellow
az vm create `
    --resource-group $ResourceGroup `
    --name $VmName `
    --image Ubuntu2204 `
    --size $VmSize `
    --admin-username $AdminUser `
    --generate-ssh-keys `
    --nsg $nsgName `
    --public-ip-sku Standard `
    --output table

# 5. Retrieve Public IP
Write-Host "`n[5/5] Fetching Public IP address..." -ForegroundColor Yellow
$publicIp = az vm list-ip-addresses --resource-group $ResourceGroup --name $VmName --query "[0].virtualMachine.network.publicIpAddresses[0].ipAddress" -o tsv

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host " 🎉 Azure VM Created Successfully!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Public IP: $publicIp" -ForegroundColor Cyan
Write-Host ""
Write-Host "To connect and deploy the containers, run:" -ForegroundColor White
Write-Host "  ssh $AdminUser@$publicIp" -ForegroundColor Yellow
Write-Host ""
Write-Host "Then clone this repository and execute:" -ForegroundColor White
Write-Host "  chmod +x Capstone-v1/deploy/setup_azure.sh" -ForegroundColor Yellow
Write-Host "  ./Capstone-v1/deploy/setup_azure.sh" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
