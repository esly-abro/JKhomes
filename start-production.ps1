#!/usr/bin/env pwsh
# ============================================
# JK Homes - Production Mode (Built + Tunnel)
# ============================================
# Builds frontend, serves from backend on port 4000.
# One URL, one port, more stable than dev mode.
# No HMR - you must rebuild after code changes.
# ============================================

$ROOT = $PSScriptRoot
$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  JK Homes - PRODUCTION MODE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Refresh PATH so cloudflared is found
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# --- Step 1: Kill existing processes ---
Write-Host "[1/5] Cleaning up old processes..." -ForegroundColor Yellow
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Stop-Process -Name cloudflared -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# --- Step 2: Build Frontend ---
Write-Host "[2/5] Building frontend..." -ForegroundColor Yellow
Set-Location $ROOT
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Frontend build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Frontend built to dist/" -ForegroundColor Green

# --- Step 3: Start Redis ---
Write-Host "[3/5] Starting Redis..." -ForegroundColor Yellow
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
}
Start-Sleep -Seconds 1

# --- Step 4: Start Backend (serves frontend from dist/) ---
Write-Host "[4/5] Starting Backend (port 4000, serves frontend)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
    `$Host.UI.RawUI.WindowTitle = 'JK Homes - Production (4000)';
    Set-Location '$ROOT\app-backend';
    node src/server.js
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
Write-Host "  NOTE: In production mode, rebuild after changes:" -ForegroundColor Yellow
Write-Host "    npm run build" -ForegroundColor Yellow
Write-Host "    Then restart backend" -ForegroundColor Yellow
Write-Host ""

# Tunnel to backend port (which serves the built frontend)
cloudflared tunnel --url http://localhost:4000
