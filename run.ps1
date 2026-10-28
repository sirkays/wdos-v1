# WDOS v85.8 Local Server Launcher
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Starting WDOS v85.8 Local Server" -ForegroundColor Green
Write-Host "  Directory: $scriptDir\app" -ForegroundColor Yellow
Write-Host "  URL:       http://localhost:8080" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

Start-Process "http://localhost:8080"
Write-Host "Server is running. Press Ctrl+C to terminate." -ForegroundColor Yellow
python server.py
