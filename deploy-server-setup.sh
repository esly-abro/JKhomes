#!/bin/bash
# Production Deployment Script - Automated Setup
# Run this on your production server

set -e  # Exit on error

echo "🚀 JK Real Estate - Production Deployment Script"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root (use sudo)${NC}"
    exit 1
fi

echo -e "${GREEN}Step 1: Updating system...${NC}"
apt update && apt upgrade -y

echo -e "${GREEN}Step 2: Installing Node.js 18...${NC}"
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

echo -e "${GREEN}Step 3: Installing PM2...${NC}"
npm install -g pm2

echo -e "${GREEN}Step 4: Installing Nginx...${NC}"
apt install -y nginx

echo -e "${GREEN}Step 5: Installing Certbot (SSL)...${NC}"
apt install -y certbot python3-certbot-nginx

echo -e "${GREEN}Step 6: Installing Git...${NC}"
apt install -y git

echo -e "${GREEN}Step 7: Creating application directory...${NC}"
mkdir -p /var/www/jk-real-estate
cd /var/www/jk-real-estate

echo ""
echo -e "${YELLOW}================================================${NC}"
echo -e "${YELLOW}Server setup complete!${NC}"
echo -e "${YELLOW}================================================${NC}"
echo ""
echo "Next steps:"
echo "1. Upload your code to /var/www/jk-real-estate"
echo "2. Run: cd /var/www/jk-real-estate && npm install"
echo "3. Configure .env files"
echo "4. Run: npm run build"
echo "5. Start services with PM2"
echo ""
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "PM2 installed: $(pm2 --version)"
echo ""
