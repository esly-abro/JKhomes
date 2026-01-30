#!/bin/bash
# Quick Deploy Script - Run this after server setup
# Usage: ./deploy.sh

set -e

echo "🚀 Deploying JK Real Estate Application..."
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Are you in the project root?"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

cd app-backend
npm install
cd ..

cd zoho-lead-backend
npm install
cd ..

# Build frontend
echo "🏗️  Building frontend..."
npm run build

# Create logs directory
mkdir -p logs

# Copy environment files if they don't exist
if [ ! -f "app-backend/.env" ]; then
    echo "⚠️  Copying app-backend/.env.production to .env"
    cp app-backend/.env.production app-backend/.env
    echo "⚠️  IMPORTANT: Edit app-backend/.env with your credentials!"
fi

if [ ! -f "zoho-lead-backend/.env" ]; then
    echo "⚠️  Copying zoho-lead-backend/.env.production to .env"
    cp zoho-lead-backend/.env.production zoho-lead-backend/.env
    echo "⚠️  IMPORTANT: Edit zoho-lead-backend/.env with your credentials!"
fi

# Stop existing PM2 processes
echo "🛑 Stopping existing processes..."
pm2 delete all || true

# Start services
echo "▶️  Starting services with PM2..."
pm2 start ecosystem.config.cjs

# Save PM2 configuration
pm2 save

# Setup PM2 startup
pm2 startup

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Check status: pm2 status"
echo "📝 View logs: pm2 logs"
echo "🔄 Restart: pm2 restart all"
echo ""
echo "⚠️  Don't forget to:"
echo "1. Configure your .env files"
echo "2. Set up Nginx (copy nginx-config.conf)"
echo "3. Get SSL certificate with certbot"
echo ""
