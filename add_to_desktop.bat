@echo off
title HelioTrack Shortcut Installer
setlocal enabledelayedexpansion

echo ========================================================
echo   HELIOTRACK SOLAR MPPT - SMART DESKTOP SHORTCUT INSTALLER
echo ========================================================
echo.

powershell -ExecutionPolicy Bypass -Command "$desktop = [Environment]::GetFolderPath('Desktop'); $projectRoot = '%~dp0'; $launcherBat = Join-Path $projectRoot 'launch_dashboard.bat'; $icoPath = Join-Path $projectRoot 'client\public\icon.ico'; $shortcutPath = Join-Path $desktop 'HelioTrack MPPT Dashboard.lnk'; $wsh = New-Object -ComObject WScript.Shell; $shortcut = $wsh.CreateShortcut($shortcutPath); $shortcut.TargetPath = $launcherBat; $shortcut.WorkingDirectory = $projectRoot; $shortcut.IconLocation = \"$icoPath,0\"; $shortcut.WindowStyle = 7; $shortcut.Description = 'Start HelioTrack Server & Open Real-Time MPPT Dashboard'; $shortcut.Save(); Write-Host '[SUCCESS] Smart Desktop shortcut installed on Desktop!' -ForegroundColor Green; Write-Host 'Double-clicking the icon will now automatically start the server and open http://localhost:3000!' -ForegroundColor Cyan"

echo.
pause
