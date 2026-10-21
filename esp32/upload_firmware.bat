@echo off
echo =======================================================
echo   ESP32 FreeRTOS MPPT Firmware Upload Utility
echo =======================================================
echo Target Port: COM8
echo Board FQBN : esp32:esp32:esp32doit-devkit-v1
echo.

set ARDUINO_CLI="C:\Users\saisi\AppData\Local\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe"
set SKETCH_DIR="%~dp0esp32_mppt_firmware"

echo [1/2] Compiling FreeRTOS Firmware...
%ARDUINO_CLI% compile --fqbn esp32:esp32:esp32doit-devkit-v1 %SKETCH_DIR%
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Compilation failed!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/2] Uploading binary to ESP32 on COM8...
%ARDUINO_CLI% upload -p COM8 --fqbn esp32:esp32:esp32doit-devkit-v1 %SKETCH_DIR%
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Upload failed! Make sure COM8 is not open in another app.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo =======================================================
echo   [SUCCESS] ESP32 FreeRTOS Firmware Uploaded & Running!
echo =======================================================
pause
