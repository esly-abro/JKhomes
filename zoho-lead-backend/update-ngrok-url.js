/**
 * ngrok URL Updater
 * Helps you update the SERVER_URL in .env after starting ngrok
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('='.repeat(60));
console.log('ngrok URL Updater');
console.log('='.repeat(60));
console.log('');
console.log('Steps:');
console.log('1. Start ngrok in another terminal: ngrok http 3000');
console.log('2. Copy the HTTPS URL from ngrok output');
console.log('3. Paste it below');
console.log('');

rl.question('Enter your ngrok HTTPS URL: ', (url) => {
    url = url.trim();

    // Validate URL
    if (!url.startsWith('https://') || !url.includes('ngrok')) {
        console.log('');
        console.log('❌ Invalid URL!');
        console.log('   URL should start with https:// and contain ngrok');
        console.log('   Example: https://abc123.ngrok-free.app');
        rl.close();
        return;
    }

    // Remove trailing slash if present
    url = url.replace(/\/$/, '');

    console.log('');
    console.log('Updating .env file...');

    // Read .env file
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');

    // Update SERVER_URL
    if (envContent.includes('SERVER_URL=')) {
        envContent = envContent.replace(/SERVER_URL=.*/g, `SERVER_URL=${url}`);
    } else {
        envContent += `\nSERVER_URL=${url}\n`;
    }

    // Write back
    fs.writeFileSync(envPath, envContent);

    console.log('✅ Updated SERVER_URL in .env');
    console.log('');
    console.log('New configuration:');
    console.log(`  SERVER_URL=${url}`);
    console.log('');
    console.log('⚠️  IMPORTANT: Restart the backend server!');
    console.log('   Press Ctrl+C in the server terminal');
    console.log('   Then run: node src/server.js');
    console.log('');
    console.log('Test the integration:');
    console.log(`  curl ${url}/health`);
    console.log('');

    rl.close();
});
