Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Starting WDOS Django Platform Server" -ForegroundColor Cyan
Write-Host "  Directory: $PSScriptRoot" -ForegroundColor Cyan
Write-Host "  URL:       http://localhost:8080" -ForegroundColor Green
Write-Host "  Admin:     http://localhost:8080/admin/" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot

$pythonBin = "python"
if (Test-Path "$PSScriptRoot\.venv\Scripts\python.exe") {
    $pythonBin = "$PSScriptRoot\.venv\Scripts\python.exe"
    Write-Host "Using virtual environment: $PSScriptRoot\.venv" -ForegroundColor Cyan
}

Write-Host "Applying database migrations..." -ForegroundColor Yellow
& $pythonBin manage.py migrate --noinput

Write-Host "Opening browser..." -ForegroundColor Yellow
Start-Process "http://localhost:8080"

Write-Host "Press Ctrl+C to stop the server." -ForegroundColor Yellow
& $pythonBin manage.py runserver 8080
