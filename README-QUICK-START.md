# JK Homes - Quick Start Guide

## 🚀 Starting the Application

### Option 1: Double-click (Easiest)
Simply **double-click** `start-all.bat` - this will open 3 terminal windows, one for each service.

### Option 2: PowerShell
Open PowerShell in this directory and run:
```powershell
.\start-all.ps1
```

### Option 3: Command Prompt
Open Command Prompt in this directory and run:
```cmd
start-all.bat
```

## 🛑 Stopping the Application

### Option 1: Double-click
Double-click `stop-all.bat`

### Option 2: PowerShell
```powershell
.\stop-all.ps1
```

### Option 3: Manual
Close all the terminal windows that were opened

## 🌐 Access Points

Once started, you can access:
- **Frontend**: http://localhost:5173
- **App Backend API**: http://localhost:4000
- **Zoho Lead Backend API**: http://localhost:3000

## 📝 Services Overview

1. **Frontend** (port 5173) - React application with Vite
2. **App Backend** (port 4000) - Main API with JWT authentication and Zoho integration
3. **Zoho Lead Backend** (port 3000) - Lead ingestion service

## ⚙️ Configuration

All environment variables are configured in:
- `app-backend/.env`
- `zoho-lead-backend/.env`

## 🔧 Troubleshooting

### Ports already in use
If you see "port already in use" errors, run the stop script first:
```
.\stop-all.bat
```
Then start again.

### Services not starting
Make sure Node.js is installed and added to your PATH. Check by running:
```
node --version
```

## 📦 Dependencies

Make sure you've installed dependencies for all services:
```powershell
# In root directory
npm install

# In app-backend
cd app-backend
npm install

# In zoho-lead-backend
cd zoho-lead-backend
npm install
```
