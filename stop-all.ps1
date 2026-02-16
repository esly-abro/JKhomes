#!/usr/bin/env pwsh
# Stop All JK Homes Services
# This script stops all running node, redis, and cloudflared processes

Write-Host "Stopping JK Homes Application..." -ForegroundColor Red
Write-Host "===================================" -ForegroundColor Red
Write-Host ""

# Stop all node processes
Write-Host "Stopping Node.js processes..." -ForegroundColor Yellow
Stop-Process -Name node -Force -ErrorAction SilentlyContinue

# Stop cloudflared tunnel
Write-Host "Stopping Cloudflare Tunnel..." -ForegroundColor Yellow
Stop-Process -Name cloudflared -Force -ErrorAction SilentlyContinue

# Stop Redis (optional - uncomment if you want to stop Redis too)
# Write-Host "Stopping Redis..." -ForegroundColor Yellow
# Stop-Process -Name redis-server -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "All services stopped!" -ForegroundColor Green
Write-Host ""
