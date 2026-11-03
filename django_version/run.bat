@echo off
title WDOS Django Platform Server
cd /d "%~dp0"
echo ========================================================
echo   Starting WDOS Django Platform Server
echo   Directory: %~dp0
echo   URL:       http://localhost:8080
echo   Admin:     http://localhost:8080/admin/
echo ========================================================
echo.

set PYTHON_BIN=python
if exist "%~dp0.venv\Scripts\python.exe" (
    set "PYTHON_BIN=%~dp0.venv\Scripts\python.exe"
    echo Using virtual environment: %~dp0.venv
)

echo Running migrations...
"%PYTHON_BIN%" manage.py migrate --noinput
if errorlevel 1 (
    echo Migration failed. Please check Python environment.
    pause
    exit /b 1
)

echo Opening browser...
start http://localhost:8080
echo.
echo Press Ctrl+C in this window to stop the server.
echo.
rem Realtime (WebSocket) service for Zoom meetings: runserver is WSGI-only and cannot serve /ws/. Needs Redis + REDIS_URL in .env.
if not defined REALTIME_WS_URL set "REALTIME_WS_URL=ws://localhost:8001"
if not defined REALTIME_ALLOWED_ORIGINS set "REALTIME_ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080"
findstr /b /i /c:"REDIS_URL=" .env >nul 2>&1 && start "WDOS realtime (ws://localhost:8001)" /min "%PYTHON_BIN%" -m uvicorn wdos_project.asgi:application --host 127.0.0.1 --port 8001 --ws websockets --log-level warning
"%PYTHON_BIN%" manage.py runserver 8080
pause
