<#
.SYNOPSIS
    Generate the demo traffic spike against the target app.
.DESCRIPTION
    In-cluster (preferred). Locust ramps inside the cluster so RPS is high
    enough for several pods to appear, then the ramp ends so scale-down shows:

      .\deploy\load_gen.ps1

    From this machine, against the public LoadBalancer (lighter spike).
    The dashboard is that same IP on port 80. There is no second address.

      .\deploy\load_gen.ps1 -Url http://<NGINX-IP>:8090

    NASA morning, about 10 minutes looped 3 times. Default 4 parallel pods.
    Each logs achieved_rps next to target_rps. Override the count with
    -ReplayParallelism or the REPLAY_PARALLELISM environment variable:

      .\deploy\load_gen.ps1 -Replay
      .\deploy\load_gen.ps1 -Replay -ReplayParallelism 2

    ASCII only for Windows PowerShell 5.1.
#>
[CmdletBinding()]
param (
    [string]$Url = "",
    [string]$Namespace = "capstone",
    [switch]$Replay,
    [int]$ReplayParallelism = 0
)

$ErrorActionPreference = "Stop"

function Assert-Exit {
    param([string]$Step)
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: $Step failed with exit code $LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

if ($Url) {
    $target = $Url.TrimEnd("/") + "/"
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if (-not $curl) {
        throw "curl.exe is required for -Url mode. Run .\deploy\load_gen.ps1 with no -Url to use the in-cluster Job."
    }
    function Invoke-Burst {
        param([int]$Seconds, [int]$Parallel)
        $deadline = (Get-Date).AddSeconds($Seconds)
        while ((Get-Date) -lt $deadline) {
            $procs = @()
            for ($i = 0; $i -lt $Parallel; $i++) {
                $procs += Start-Process -FilePath "curl.exe" -ArgumentList @("-s", "-o", "NUL", "--max-time", "5", $target) -WindowStyle Hidden -PassThru
            }
            foreach ($proc in $procs) {
                if (-not $proc.HasExited) {
                    $proc.WaitForExit(8000) | Out-Null
                }
            }
        }
    }
    Write-Host "Light load for 20s against $target"
    Invoke-Burst -Seconds 20 -Parallel 1
    Write-Host "Spike for 70s"
    Invoke-Burst -Seconds 70 -Parallel 8
    Write-Host "Calm for 30s"
    Invoke-Burst -Seconds 30 -Parallel 1
    Write-Host "Done. In another window: kubectl get pods -n $Namespace -l app=target-app -w"
    exit 0
}

$root = Split-Path -Parent $PSScriptRoot
if ($Replay) {
    $count = $ReplayParallelism
    if ($count -lt 1) {
        if ($env:REPLAY_PARALLELISM) {
            $count = [int]$env:REPLAY_PARALLELISM
        } else {
            $count = 4
        }
    }
    if ($count -lt 1 -or $count -gt 16) {
        throw "ReplayParallelism must be from 1 to 16 (got $count)"
    }
    $jobFile = Join-Path $root "k8s/07-nasa-replay-job.yaml"
    $content = [System.IO.File]::ReadAllText($jobFile)
    $content = [regex]::Replace($content, 'parallelism: \d+ # replay-parallelism', "parallelism: $count # replay-parallelism")
    $content = [regex]::Replace($content, 'completions: \d+ # replay-parallelism', "completions: $count # replay-parallelism")
    $content = [regex]::Replace($content, 'value: "\d+" # replay-shards', "value: `"$count`" # replay-shards")
    $content = [regex]::Replace($content, '- "\d+" # replay-shards', "- `"$count`" # replay-shards")
    $rendered = Join-Path $env:TEMP "nasa-replay-job.yaml"
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($rendered, $content, $utf8)
    Write-Host "Applying NASA replay Job in namespace $Namespace ($count parallel pods)"
    kubectl delete job nasa-replay -n $Namespace --ignore-not-found
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARNING: kubectl delete job returned $LASTEXITCODE (continuing)"
    }
    kubectl apply -f $rendered
    Assert-Exit "kubectl apply nasa-replay"
    Write-Host "Look for achieved_rps next to target_rps. The summary line is at the end of each pod."
    Write-Host "Watch pods: kubectl get pods -n $Namespace -l app=target-app -w"
    kubectl wait -n $Namespace --for=condition=ready pod -l app=nasa-replay --timeout=180s
    if ($LASTEXITCODE -ne 0) {
        Write-Host "nasa-replay pod was not Ready within 180s; dumping pods"
        kubectl get pods -n $Namespace -o wide
        exit $LASTEXITCODE
    }
    kubectl logs -n $Namespace -l app=nasa-replay -f --tail=20 --prefix
    exit 0
}
$jobFile = Join-Path $root "k8s/06-loadgen-job.yaml"
Write-Host "Applying in-cluster Locust job in namespace $Namespace"
kubectl delete job loadgen -n $Namespace --ignore-not-found
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: kubectl delete job returned $LASTEXITCODE (continuing)"
}
kubectl apply -f $jobFile
Assert-Exit "kubectl apply loadgen"
Write-Host "Following logs. Ctrl-C stops following; the Job keeps running."
Write-Host "Watch pods: kubectl get pods -n $Namespace -l app=target-app -w"
kubectl wait -n $Namespace --for=condition=ready pod -l app=loadgen --timeout=180s
if ($LASTEXITCODE -ne 0) {
    Write-Host "loadgen pod was not Ready within 180s; dumping pods"
    kubectl get pods -n $Namespace -o wide
    exit $LASTEXITCODE
}
kubectl logs -n $Namespace -l app=loadgen -f --tail=20
