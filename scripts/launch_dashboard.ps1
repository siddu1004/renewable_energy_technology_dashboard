$projectRoot = "c:\Users\saisi\.antigravity-ide\renewable_energy_technology_dashboard"
Set-Location $projectRoot

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
