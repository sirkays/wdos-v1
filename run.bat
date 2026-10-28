@echo off
title WDOS v85.8 Local Server
cd /d "%~dp0"
echo ========================================================
echo   Starting WDOS v85.8 Local Server
echo   Directory: %~dp0app
echo   URL:       http://localhost:8080
echo ========================================================
echo.
echo Opening browser...
start http://localhost:8080
echo.
echo Press Ctrl+C in this window to stop the server.
echo.
python server.py
if errorlevel 1 (
    echo Python server.py failed, trying default python http.server...
    cd /d "%~dp0app"
    python -m http.server 8080
)
pause
