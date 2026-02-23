/**
 * Pulsar CRM — GitHub Webhook Listener
 * Listens for PR merge events on the Main branch and triggers auto-deploy.
 *
 * Port: 9000
 * Endpoint: POST /webhook/github
 * Health:   GET  /webhook/health
 */

const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────
const PORT = 9000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'pulsar-deploy-secret-2026';
const DEPLOY_SCRIPT = path.join(__dirname, 'deploy-pull.sh');
const LOG_FILE = path.join(__dirname, 'deploy.log');
const TARGET_BRANCH = 'Main';

let isDeploying = false;

// ── Helpers ─────────────────────────────────────────
function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

function verifySignature(payload, signature) {
    if (!signature) return false;
    const sig = Buffer.from(signature, 'utf8');
    const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
    const digest = Buffer.from('sha256=' + hmac.update(payload).digest('hex'), 'utf8');
    return sig.length === digest.length && crypto.timingSafeEqual(digest, sig);
}

function runDeploy() {
    if (isDeploying) {
        log('⏳ Deploy already in progress, skipping.');
        return;
    }
    isDeploying = true;
    log('🚀 Starting deploy...');

    execFile('bash', [DEPLOY_SCRIPT], { timeout: 300000 }, (error, stdout, stderr) => {
        isDeploying = false;
        if (error) {
            log(`❌ Deploy failed: ${error.message}`);
            if (stderr) log(`STDERR: ${stderr.slice(-500)}`);
        } else {
            log('✅ Deploy completed successfully.');
        }
        if (stdout) log(`OUTPUT (last 500 chars): ${stdout.slice(-500)}`);
    });
}

// ── HTTP Server ─────────────────────────────────────
const server = http.createServer((req, res) => {
    // Health check
    if (req.method === 'GET' && req.url === '/webhook/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            status: 'ok',
            deploying: isDeploying,
            uptime: process.uptime()
        }));
    }

    // Webhook endpoint
    if (req.method === 'POST' && req.url === '/webhook/github') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            // Verify signature
            const signature = req.headers['x-hub-signature-256'];
            if (!verifySignature(body, signature)) {
                log('⛔ Invalid webhook signature — rejected.');
                res.writeHead(401);
                return res.end('Unauthorized');
            }

            let payload;
            try {
                payload = JSON.parse(body);
            } catch (e) {
                log('⛔ Invalid JSON payload.');
                res.writeHead(400);
                return res.end('Bad Request');
            }

            const event = req.headers['x-github-event'];
            log(`📨 Received event: ${event}`);

            // Handle push to Main (direct push or PR merge)
            if (event === 'push') {
                const branch = (payload.ref || '').replace('refs/heads/', '');
                if (branch === TARGET_BRANCH) {
                    const pusher = payload.pusher?.name || 'unknown';
                    const headCommit = payload.head_commit?.message || 'no message';
                    log(`📦 Push to ${TARGET_BRANCH} by ${pusher}: "${headCommit}"`);
                    runDeploy();
                    res.writeHead(200);
                    return res.end('Deploy triggered');
                } else {
                    log(`ℹ️  Push to ${branch} — ignoring (not ${TARGET_BRANCH}).`);
                    res.writeHead(200);
                    return res.end('Ignored — not target branch');
                }
            }

            // Handle PR merged event
            if (event === 'pull_request') {
                const action = payload.action;
                const merged = payload.pull_request?.merged;
                const baseBranch = payload.pull_request?.base?.ref;

                if (action === 'closed' && merged && baseBranch === TARGET_BRANCH) {
                    const title = payload.pull_request?.title || 'untitled';
                    const author = payload.pull_request?.user?.login || 'unknown';
                    log(`🔀 PR merged to ${TARGET_BRANCH}: "${title}" by ${author}`);
                    runDeploy();
                    res.writeHead(200);
                    return res.end('Deploy triggered');
                } else {
                    log(`ℹ️  PR event (action=${action}, merged=${merged}, base=${baseBranch}) — ignoring.`);
                    res.writeHead(200);
                    return res.end('Ignored — not a merge to target branch');
                }
            }

            // Other events — acknowledge but ignore
            log(`ℹ️  Unhandled event: ${event}`);
            res.writeHead(200);
            res.end('OK');
        });
        return;
    }

    // 404 for everything else
    res.writeHead(404);
    res.end('Not Found');
});

server.listen(PORT, () => {
    log(`🎧 Webhook listener started on port ${PORT}`);
    log(`   Target branch: ${TARGET_BRANCH}`);
    log(`   Deploy script: ${DEPLOY_SCRIPT}`);
    log(`   Secret configured: ${WEBHOOK_SECRET !== 'pulsar-deploy-secret-2026' ? 'custom' : 'default'}`);
});
