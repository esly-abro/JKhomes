#!/bin/bash
# ─────────────────────────────────────────────
# Pulsar CRM — Auto-Deploy Script
# Triggered by GitHub webhook on PR merge to Main
# ─────────────────────────────────────────────
set -e

REPO_DIR="/home/ec2-user/Pulsar"
DIST_DIR="/home/ec2-user/pulsar-dist"
BRANCH="Main"
LOG_FILE="/home/ec2-user/deploy/deploy.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "========== DEPLOY STARTED =========="

# 1. Pull latest code
log "Pulling latest from origin/$BRANCH..."
cd "$REPO_DIR"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
log "Git pull complete: $(git log -1 --oneline)"

# 2. Install/update frontend dependencies
log "Installing frontend dependencies..."
npm install --production=false 2>&1 | tail -3

# 3. Build frontend
log "Building frontend..."
npx vite build 2>&1 | tail -5

# 4. Deploy built frontend
log "Deploying frontend to $DIST_DIR..."
rm -rf "$DIST_DIR"
mv dist "$DIST_DIR"
chmod 755 "$DIST_DIR"
log "Frontend deployed."

# 5. Install/update backend dependencies
log "Installing backend dependencies..."
cd "$REPO_DIR/app-backend"
npm install --production 2>&1 | tail -3

# 6. Restart backend
log "Restarting backend via PM2..."
pm2 restart app-backend --update-env 2>&1 | tail -3
sleep 2

# 7. Verify backend health
HEALTH=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/api/health)
if [ "$HEALTH" = "200" ]; then
    log "✅ Backend health check passed (HTTP $HEALTH)"
else
    log "⚠️  Backend health check returned HTTP $HEALTH"
fi

log "========== DEPLOY COMPLETE =========="
