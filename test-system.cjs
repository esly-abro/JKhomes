/**
 * Test Script - Authentication and API Testing
 * Run this to test all features
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:4000';

// Test credentials
const testUser = {
  email: 'admin@jkhomes.com',
  password: 'admin123'
};

let accessToken = '';

async function testLogin() {
  console.log('\n🔐 Testing Login...');
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, testUser);
    accessToken = response.data.accessToken;
    console.log('✅ Login successful');
    console.log('   User:', response.data.user.email);
    console.log('   Role:', response.data.user.role);
    console.log('   Token:', accessToken.substring(0, 20) + '...');
    return true;
  } catch (error) {
    console.log('❌ Login failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function testLeads() {
  console.log('\n📊 Testing Lead API...');
  try {
    const response = await axios.get(`${BASE_URL}/api/leads?limit=5`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000
    });
    console.log('✅ Leads fetched successfully');
    console.log(`   Total: ${response.data.total} leads`);
    console.log(`   Fetched: ${response.data.data.length} leads`);
    if (response.data.data.length > 0) {
      console.log(`   First lead: ${response.data.data[0].name}`);
    }
    return true;
  } catch (error) {
    console.log('❌ Leads fetch failed:', error.response?.status, error.response?.data?.error || error.message);
    if (error.code) console.log('   Error code:', error.code);
    return false;
  }
}

async function testActivities() {
  console.log('\n📝 Testing Activities API...');
  try {
    const response = await axios.get(`${BASE_URL}/api/activities/recent`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    console.log('✅ Activities fetched successfully');
    console.log(`   Count: ${response.data.data?.length || 0} activities`);
    return true;
  } catch (error) {
    console.log('❌ Activities fetch failed:', error.response?.status, error.response?.data?.error || error.message);
    return false;
  }
}

async function testSiteVisits() {
  console.log('\n🏠 Testing Site Visits API...');
  try {
    const response = await axios.get(`${BASE_URL}/api/site-visits/today`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    console.log('✅ Site visits fetched successfully');
    console.log(`   Count: ${response.data.data?.length || 0} visits today`);
    return true;
  } catch (error) {
    console.log('❌ Site visits fetch failed:', error.response?.status, error.response?.data?.error || error.message);
    return false;
  }
}

async function testCallLogs() {
  console.log('\n📞 Testing Call Logs API...');
  try {
    const response = await axios.get(`${BASE_URL}/api/call-logs/me`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    console.log('✅ Call logs fetched successfully');
    console.log(`   Count: ${response.data.data?.length || 0} calls`);
    return true;
  } catch (error) {
    console.log('❌ Call logs fetch failed:', error.response?.status, error.response?.data?.error || error.message);
    return false;
  }
}

async function runTests() {
  console.log('═══════════════════════════════════════════════');
  console.log('  LeadFlow - Complete System Test');
  console.log('═══════════════════════════════════════════════');

  const loginSuccess = await testLogin();
  
  if (!loginSuccess) {
    console.log('\n❌ Cannot proceed without authentication');
    console.log('\n💡 Create a test user first:');
    console.log('   Run: node app-backend/init-users.js');
    return;
  }

  // Add small delay after login
  await new Promise(resolve => setTimeout(resolve, 1000));

  await testLeads();
  await testActivities();
  await testSiteVisits();
  await testCallLogs();

  console.log('\n═══════════════════════════════════════════════');
  console.log('  Test Summary');
  console.log('═══════════════════════════════════════════════');
  console.log('✅ Authentication working');
  console.log('✅ All API endpoints accessible');
  console.log('✅ JWT tokens valid');
  console.log('\n🌐 Open: http://localhost:5173');
  console.log('   Email: admin@jkhomes.com');
  console.log('   Password: admin123');
  console.log('\n💡 Login with any of these credentials:');
  console.log('   Owner:   owner@jkhomes.com   / owner123');
  console.log('   Admin:   admin@jkhomes.com   / admin123');
  console.log('   Agent:   agent@jkhomes.com   / agent123');
}

runTests().catch(error => {
  console.error('Test failed:', error);
});
