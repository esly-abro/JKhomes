
#!/usr/bin/env pwsh
# ============================================
# JK Homes - Live Server Mode (Dev + Tunnel)
# ============================================
# Your laptop becomes the live server.
# Friend accesses via Cloudflare Tunnel URL.
# Code changes → HMR → friend sees updates live.
# ============================================

$ROOT = $PSScriptRoot
$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  JK Homes - LIVE SERVER MODE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Refresh PATH so cloudflared is found
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# --- Step 1: Kill existing node processes ---
Write-Host "[1/5] Cleaning up old processes..." -ForegroundColor Yellow
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Stop-Process -Name cloudflared -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# --- Step 2: Start Redis ---
Write-Host "[2/5] Starting Redis..." -ForegroundColor Yellow
$redisExe = Join-Path $ROOT "redis-win\redis-server.exe"
$redisConf = Join-Path $ROOT "redis-win\redis.windows.conf"
if (Test-Path $redisExe) {
    $redisRunning = Get-Process redis-server -ErrorAction SilentlyContinue
    if (-not $redisRunning) {
        Start-Process -FilePath $redisExe -ArgumentList $redisConf -WindowStyle Minimized
        Write-Host "  Redis started" -ForegroundColor Green
    } else {
        Write-Host "  Redis already running" -ForegroundColor Green
    }
} else {
    Write-Host "  WARNING: Redis not found at $redisExe" -ForegroundColor Red
    Write-Host "  Workflow engine will not work without Redis" -ForegroundColor Red
}
Start-Sleep -Seconds 1

# --- Step 3: Start Backend (nodemon for auto-reload) ---
Write-Host "[3/5] Starting Backend (port 4000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
    `$Host.UI.RawUI.WindowTitle = 'JK Homes - Backend (4000)';
    Set-Location '$ROOT\app-backend';
    npx nodemon src/server.js
" -WindowStyle Normal
Start-Sleep -Seconds 3

# --- Step 4: Start Frontend (Vite with host mode) ---
Write-Host "[4/5] Starting Frontend (port 5173)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
    `$Host.UI.RawUI.WindowTitle = 'JK Homes - Frontend (5173)';
    Set-Location '$ROOT';
    npx vite --host
" -WindowStyle Normal
Start-Sleep -Seconds 4

# --- Step 5: Start Cloudflare Tunnel ---
Write-Host "[5/5] Starting Cloudflare Tunnel..." -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  WAITING FOR TUNNEL URL..." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Look for the URL like:" -ForegroundColor White
Write-Host "  https://random-name.trycloudflare.com" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Send that URL to your friend!" -ForegroundColor White
Write-Host ""
Write-Host "  Press Ctrl+C to stop the tunnel." -ForegroundColor Yellow
Write-Host "  Run .\stop-all.ps1 to stop everything." -ForegroundColor Yellow
Write-Host ""

# Run tunnel in foreground so user can see the URL
cloudflared tunnel --url http://localhost:5173
