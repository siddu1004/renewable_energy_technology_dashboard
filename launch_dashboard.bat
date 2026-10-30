@echo off
title HelioTrack Solar MPPT Launcher
set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"
powershell -ExecutionPolicy Bypass -NoProfile -File "%PROJECT_DIR%scripts\launch_dashboard.ps1"
