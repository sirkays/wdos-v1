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
"%PYTHON_BIN%" manage.py runserver 8080
pause
