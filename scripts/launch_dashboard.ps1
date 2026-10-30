$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

# Auto-install dependencies if node_modules does not exist yet (e.g. fresh ZIP extraction)
if (-not (Test-Path (Join-Path $projectRoot "node_modules"))) {
    Write-Host "First-time setup detected: Installing npm packages (this takes ~1 minute)..." -ForegroundColor Yellow
    Start-Process -FilePath "npm.cmd" -ArgumentList "install" -WorkingDirectory $projectRoot -Wait -NoNewWindow
}

Write-Host "Checking HelioTrack Dashboard server on port 3000..." -ForegroundColor Cyan

$portActive = (Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' })
if (-not $portActive) {
    Write-Host "Server is offline. Starting HelioTrack server in background..." -ForegroundColor Yellow
    Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev" -WorkingDirectory $projectRoot -WindowStyle Minimized
    
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        $portActive = (Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' })
        if ($portActive) {
            Write-Host "Server initialized on port 3000!" -ForegroundColor Green
            break
        }
    }
} else {
    Write-Host "Server is already running on port 3000." -ForegroundColor Green
}

Write-Host "Opening http://localhost:3000 in your browser..." -ForegroundColor Cyan
Start-Process "http://localhost:3000"
