$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

# 1. Remove unnecessary temporary/cache files inside workspace
$unnecessaryPaths = @(
    "HELIOTRACK_MPPT_SIMULATION_PACKAGE.zip",
    "HELIOTRACK_FULL_PROJECT_CLEAN.zip",
    "matlab\slprj",
    "slprj",
    "dist",
    "tmp",
    "temp",
    ".project-config.json"
)
foreach ($rel in $unnecessaryPaths) {
    $full = Join-Path $projectRoot $rel
    if (Test-Path $full) {
        Remove-Item $full -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Removed unnecessary path: $rel"
    }
}

# Remove any .slxc, .autosave, .asv, .bak, .log files across workspace (excluding node_modules)
Get-ChildItem -Path $projectRoot -Include *.slxc,*.autosave,*.asv,*.bak,*.log -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch "\\node_modules\\" -and $_.FullName -notmatch "\\\.git\\" } |
    ForEach-Object {
        Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
        Write-Host "Removed cache file: $($_.Name)"
    }

# 2. Build clean standalone ZIP in Downloads and Project Root
$stagingDir = Join-Path $env:TEMP "HelioTrack_Clean_Staging\renewable_energy_technology_dashboard"
if (Test-Path (Split-Path $stagingDir)) {
    Remove-Item (Split-Path $stagingDir) -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null

$includeItems = @(
    "client",
    "server",
    "shared",
    "matlab",
    "esp32",
    "scripts",
    "drizzle",
    "patches",
    "HELIOTRACK_MPPT_SIMULATION_PACKAGE",
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "tsconfig.node.json",
    "vite.config.ts",
    "vitest.config.ts",
    "drizzle.config.ts",
    "components.json",
    "README.md",
    "add_to_desktop.bat",
    "launch_dashboard.bat",
    ".gitignore",
    ".prettierrc",
    ".prettierignore"
)

foreach ($item in $includeItems) {
    $src = Join-Path $projectRoot $item
    if (Test-Path $src) {
        $dest = Join-Path $stagingDir $item
        Copy-Item -Path $src -Destination $dest -Recurse -Force
    }
}

$zipDownloads = Join-Path ([Environment]::GetFolderPath("UserProfile")) "Downloads\renewable_energy_technology_dashboard_CLEAN.zip"
$zipWorkspace = Join-Path $projectRoot "renewable_energy_technology_dashboard_CLEAN.zip"

if (Test-Path $zipDownloads) { Remove-Item $zipDownloads -Force }
if (Test-Path $zipWorkspace) { Remove-Item $zipWorkspace -Force }

Compress-Archive -Path $stagingDir -DestinationPath $zipDownloads -CompressionLevel Optimal
Copy-Item -Path $zipDownloads -Destination $zipWorkspace -Force

Remove-Item (Split-Path $stagingDir) -Recurse -Force
$sizeMB = [math]::Round((Get-Item $zipDownloads).Length / 1MB, 2)
Write-Host "SUCCESS: Created clean ZIP ($sizeMB MB) at:"
Write-Host "  1) $zipDownloads"
Write-Host "  2) $zipWorkspace"
