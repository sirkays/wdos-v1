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
$realtimeProc = $null
try {
    # ---- Realtime (WebSocket) service ------------------------------------------------------------------------
    # `runserver` is WSGI and cannot serve /ws/... (that is what caused "Not Found: /ws/meetings/..."). Zoom meetings use
    # a separate ASGI service for WebSockets, exactly as production does (see render.yaml: wdos-realtime). It talks to
    # this server through Redis, so Redis must be running and REDIS_URL set (in .env or the environment).
    $envFile = Join-Path $PSScriptRoot ".env"
    $hasKey = { param($k) [Environment]::GetEnvironmentVariable($k) -or ((Test-Path $envFile) -and (Select-String -Path $envFile -Pattern "^\s*$k\s*=\s*\S" -Quiet)) }
    if (-not (& $hasKey "REDIS_URL")) {
        Write-Host "REDIS_URL is not set: WebSockets (live lobby / check-ins for Zoom meetings) are DISABLED. Start Redis and add REDIS_URL=redis://localhost:6379/0 to .env." -ForegroundColor DarkYellow
    } else {
        if (-not (& $hasKey "REALTIME_WS_URL")) { $env:REALTIME_WS_URL = "ws://localhost:8001" }
        if (-not (& $hasKey "REALTIME_ALLOWED_ORIGINS")) { $env:REALTIME_ALLOWED_ORIGINS = "http://localhost:8080,http://127.0.0.1:8080" }
        Write-Host "Starting realtime WebSocket service on ws://localhost:8001 ..." -ForegroundColor Yellow
        $realtimeProc = Start-Process -PassThru -NoNewWindow -WorkingDirectory $PSScriptRoot $pythonBin `
            -ArgumentList "-m", "uvicorn", "wdos_project.asgi:application", "--host", "127.0.0.1", "--port", "8001", "--ws", "websockets", "--log-level", "warning"
    }
} catch {
    Write-Host "Could not start the realtime service: $_" -ForegroundColor Red
}

try {
    & $pythonBin manage.py runserver 8080
} finally {
    if ($realtimeProc -and -not $realtimeProc.HasExited) { Stop-Process -Id $realtimeProc.Id -Force -ErrorAction SilentlyContinue }
}
