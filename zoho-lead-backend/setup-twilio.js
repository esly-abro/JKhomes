/**
 * Twilio Setup Helper
 * This script helps you verify your Twilio configuration
 */

console.log('='.repeat(60));
console.log('Twilio + ElevenLabs Integration Setup Helper');
console.log('='.repeat(60));
console.log('');

console.log('📋 Required Steps:');
console.log('');
console.log('1. Get Twilio Credentials');
console.log('   → Go to: https://console.twilio.com/');
console.log('   → Copy your Account SID and Auth Token');
console.log('');
console.log('2. Verify Phone Number');
console.log('   → Your Twilio phone: +1 765 507 6878');
console.log('   → Ensure it\'s active in Twilio console');
console.log('');
console.log('3. Install ngrok (for local testing)');
console.log('   → Download: https://ngrok.com/download');
console.log('   → Run: ngrok http 3000');
console.log('   → Copy the HTTPS URL');
console.log('');
console.log('4. Update .env file with:');
console.log('');
console.log('   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxx');
console.log('   TWILIO_AUTH_TOKEN=your_auth_token_here');
console.log('   TWILIO_PHONE_NUMBER=+17655076878');
console.log('   SERVER_URL=https://your-ngrok-url.ngrok.io');
console.log('');
console.log('5. Restart the server:');
console.log('   → node src/server.js');
console.log('');
console.log('='.repeat(60));
console.log('');

// Check if credentials are set
require('dotenv').config();

const twilioSid = process.env.TWILIO_ACCOUNT_SID;
const twilioToken = process.env.TWILIO_AUTH_TOKEN;
const serverUrl = process.env.SERVER_URL;

console.log('Current Configuration:');
console.log('');
console.log(`  TWILIO_ACCOUNT_SID: ${twilioSid ? '✅ Set' : '❌ Not set'}`);
console.log(`  TWILIO_AUTH_TOKEN:  ${twilioToken ? '✅ Set' : '❌ Not set'}`);
console.log(`  SERVER_URL:         ${serverUrl || '❌ Not set'}`);
console.log('');

if (!twilioSid || !twilioToken) {
    console.log('⚠️  Twilio credentials not configured!');
    console.log('   Add them to your .env file to enable calling.');
    console.log('');
} else if (!serverUrl) {
    console.log('⚠️  SERVER_URL not configured!');
    console.log('   Run ngrok and add the URL to .env');
    console.log('');
} else {
    console.log('✅ Configuration looks good!');
    console.log('   Restart the server to apply changes.');
    console.log('');
}

console.log('='.repeat(60));
console.log('');
console.log('Need help? Check TWILIO_SETUP.md for detailed instructions.');
console.log('');
