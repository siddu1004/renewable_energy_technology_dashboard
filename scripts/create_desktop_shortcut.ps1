$desktop = [Environment]::GetFolderPath("Desktop")
$projectRoot = Split-Path -Parent $PSScriptRoot
$launcherBat = Join-Path $projectRoot "launch_dashboard.bat"
$icoPath = Join-Path $projectRoot "client\public\icon.ico"
$shortcutPath = Join-Path $desktop "HelioTrack MPPT Dashboard.lnk"

# Remove any old .url shortcut so only the smart .lnk remains
$oldUrl = Join-Path $desktop "HelioTrack MPPT Dashboard.url"
if (Test-Path $oldUrl) { Remove-Item $oldUrl -Force }

# Create Smart Windows Shell Shortcut (.lnk)
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcherBat
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = "$icoPath,0"
$shortcut.WindowStyle = 7 # Minimized execution for clean launcher experience
$shortcut.Description = "Start HelioTrack Server & Open Real-Time MPPT Dashboard"
$shortcut.Save()

Write-Host "Smart Desktop shortcut installed successfully:"
Write-Host "  -> Target: $launcherBat"
Write-Host "  -> Icon:   $icoPath"
Write-Host "  -> Link:   $shortcutPath"
