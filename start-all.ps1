#!/usr/bin/env pwsh
# Start All Pulsar CRM Services
# This script starts the app-backend and frontend

Write-Host "🚀 Starting Pulsar CRM Application..." -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Start App Backend
Write-Host "📦 Starting App Backend (port 4000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Push-Location '$PSScriptRoot\app-backend'; node src\server.js"
Start-Sleep -Seconds 2

# Start Frontend
Write-Host "🎨 Starting Frontend (port 5173)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Push-Location '$PSScriptRoot'; npm run dev"
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "✅ All services started!" -ForegroundColor Green
Write-Host ""
Write-Host "Services running at:" -ForegroundColor Cyan
Write-Host "  🌐 Frontend:           http://localhost:5173" -ForegroundColor White
Write-Host "  🔧 App Backend:        http://localhost:4000" -ForegroundColor White
Write-Host ""
Write-Host "To stop all services, run: .\stop-all.ps1" -ForegroundColor Yellow
Write-Host ""
