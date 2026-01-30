/**
 * Comprehensive Test Suite for Post-Call Automation System
 * 
 * Tests:
 * 1. WhatsApp Service - Message sending, formatting
 * 2. Intent Analyzer Service - Intent extraction, NLP analysis
 * 3. Post-Call Orchestrator - End-to-end webhook processing
 * 4. Webhook Routes - HTTP endpoint testing
 * 
 * Run with: node test-post-call-automation.js
 */

const axios = require('axios');

// Configuration
const CONFIG = {
    baseUrl: process.env.SERVER_URL || 'http://localhost:3000',
    testPhoneNumber: process.env.TEST_PHONE_NUMBER || '+919876543210',
    verbose: true
};

// Test results tracking
const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: []
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function log(message, type = 'info') {
    const colors = {
        info: '\x1b[36m',    // Cyan
        success: '\x1b[32m', // Green
        error: '\x1b[31m',   // Red
        warn: '\x1b[33m',    // Yellow
        reset: '\x1b[0m'
    };
    console.log(`${colors[type]}${message}${colors.reset}`);
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function runTest(name, testFn) {
    const startTime = Date.now();
    try {
        await testFn();
        const duration = Date.now() - startTime;
        results.passed++;
        results.tests.push({ name, status: 'passed', duration });
        log(`  ✅ ${name} (${duration}ms)`, 'success');
    } catch (error) {
        const duration = Date.now() - startTime;
        results.failed++;
        results.tests.push({ name, status: 'failed', error: error.message, duration });
        log(`  ❌ ${name}: ${error.message}`, 'error');
    }
}

function skipTest(name, reason) {
    results.skipped++;
    results.tests.push({ name, status: 'skipped', reason });
    log(`  ⏭️  ${name}: ${reason}`, 'warn');
}

// ============================================================================
// TEST: WHATSAPP SERVICE
// ============================================================================

async function testWhatsAppService() {
    log('\n📱 Testing WhatsApp Service...', 'info');

    const whatsappService = require('./src/services/whatsappService');

    // Test 1: Phone number formatting
    await runTest('Format Indian phone number (10 digits)', () => {
        const formatted = whatsappService.formatWhatsAppNumber('9876543210');
        assert(formatted === 'whatsapp:+919876543210', `Expected whatsapp:+919876543210, got ${formatted}`);
    });

    await runTest('Format phone number with country code', () => {
        const formatted = whatsappService.formatWhatsAppNumber('+919876543210');
        assert(formatted === 'whatsapp:+919876543210', `Expected whatsapp:+919876543210, got ${formatted}`);
    });

    await runTest('Format phone number with spaces', () => {
        const formatted = whatsappService.formatWhatsAppNumber('98765 43210');
        assert(formatted === 'whatsapp:+919876543210', `Expected whatsapp:+919876543210, got ${formatted}`);
    });

    // Test 2: Service availability check
    await runTest('Check service availability', () => {
        const available = whatsappService.isAvailable();
        // This might be false if Twilio not configured, which is okay
        assert(typeof available === 'boolean', 'isAvailable should return boolean');
    });

    // Test 3: Phone number masking
    await runTest('Phone number masking for logging', () => {
        const masked = whatsappService.maskPhoneNumber('+919876543210');
        assert(masked.includes('****'), 'Masked number should contain ****');
        assert(!masked.includes('9876543210'), 'Masked number should not contain full number');
    });
}

// ============================================================================
// TEST: INTENT ANALYZER SERVICE
// ============================================================================

async function testIntentAnalyzerService() {
    log('\n🧠 Testing Intent Analyzer Service...', 'info');

    const { IntentAnalyzerService, INTENT_TYPES, LEAD_QUALIFICATION } = require('./src/services/intentAnalyzer.service');

    // Test 1: Constants are defined
    await runTest('Intent types are defined', () => {
        assert(INTENT_TYPES.SEND_WHATSAPP === 'send_whatsapp', 'SEND_WHATSAPP intent type');
        assert(INTENT_TYPES.BOOK_SITE_VISIT === 'book_site_visit', 'BOOK_SITE_VISIT intent type');
        assert(INTENT_TYPES.NOT_INTERESTED === 'not_interested', 'NOT_INTERESTED intent type');
    });

    await runTest('Lead qualification levels are defined', () => {
        assert(LEAD_QUALIFICATION.HOT === 'hot', 'HOT qualification');
        assert(LEAD_QUALIFICATION.WARM === 'warm', 'WARM qualification');
        assert(LEAD_QUALIFICATION.COLD === 'cold', 'COLD qualification');
    });

    // Test 2: Quick intent detection
    await runTest('Detect WhatsApp intent from transcript', () => {
        const hasIntent = IntentAnalyzerService.hasIntent(
            'Please send me the details on WhatsApp',
            INTENT_TYPES.SEND_WHATSAPP
        );
        assert(hasIntent === true, 'Should detect WhatsApp intent');
    });

    await runTest('Detect site visit intent from transcript', () => {
        const hasIntent = IntentAnalyzerService.hasIntent(
            'I would like to schedule a site visit',
            INTENT_TYPES.BOOK_SITE_VISIT
        );
        assert(hasIntent === true, 'Should detect site visit intent');
    });

    await runTest('Detect not interested intent', () => {
        const hasIntent = IntentAnalyzerService.hasIntent(
            'No thanks, I am not interested right now',
            INTENT_TYPES.NOT_INTERESTED
        );
        assert(hasIntent === true, 'Should detect not interested intent');
    });

    // Test 3: Fallback analysis (without OpenAI)
    await runTest('Fallback analysis extracts WhatsApp intent', async () => {
        const result = await IntentAnalyzerService.analyzeConversation(
            'Customer: Can you send me the property details on WhatsApp please?',
            null,
            {}
        );
        const hasWhatsAppIntent = result.intents.some(i => i.type === INTENT_TYPES.SEND_WHATSAPP);
        assert(hasWhatsAppIntent, 'Should extract WhatsApp intent from transcript');
    });

    await runTest('Fallback analysis extracts site visit intent', async () => {
        const result = await IntentAnalyzerService.analyzeConversation(
            'Customer: I want to visit the property and see it in person',
            null,
            {}
        );
        const hasSiteVisitIntent = result.intents.some(i => i.type === INTENT_TYPES.BOOK_SITE_VISIT);
        assert(hasSiteVisitIntent, 'Should extract site visit intent from transcript');
    });

    // Test 4: ElevenLabs evaluation criteria extraction
    await runTest('Extract intents from ElevenLabs analysis', async () => {
        const elevenLabsAnalysis = {
            evaluation_criteria_results: {
                user_interested: 'success',
                site_visit_requested: 'success'
            },
            transcript_summary: 'Customer is interested in 3BHK in OMR'
        };

        const result = await IntentAnalyzerService.analyzeConversation(
            'Sample transcript',
            elevenLabsAnalysis,
            {}
        );

        const hasInterestedIntent = result.intents.some(i => i.type === INTENT_TYPES.INTERESTED);
        const hasSiteVisitIntent = result.intents.some(i => i.type === INTENT_TYPES.BOOK_SITE_VISIT);

        assert(hasInterestedIntent, 'Should extract interested intent from ElevenLabs criteria');
        assert(hasSiteVisitIntent, 'Should extract site visit intent from ElevenLabs criteria');
    });

    // Test 5: Service availability
    await runTest('Service availability check', () => {
        // Fallback is always available
        assert(IntentAnalyzerService.isAvailable() === true, 'Service should always be available (fallback)');
    });
}

// ============================================================================
// TEST: POST-CALL ORCHESTRATOR
// ============================================================================

async function testPostCallOrchestrator() {
    log('\n🎯 Testing Post-Call Orchestrator...', 'info');

    const { PostCallOrchestrator, LEAD_STATUS, ACTION_TYPES } = require('./src/services/postCallOrchestrator');

    // Test 1: Constants are defined
    await runTest('Lead status constants are defined', () => {
        assert(LEAD_STATUS.SITE_VISIT_BOOKED === 'Site Visit Booked', 'SITE_VISIT_BOOKED status');
        assert(LEAD_STATUS.WHATSAPP_SENT === 'Details Sent - WhatsApp', 'WHATSAPP_SENT status');
        assert(LEAD_STATUS.NOT_INTERESTED === 'Not Interested', 'NOT_INTERESTED status');
    });

    await runTest('Action types are defined', () => {
        assert(ACTION_TYPES.SEND_WHATSAPP_DETAILS === 'send_whatsapp_details', 'SEND_WHATSAPP_DETAILS action');
        assert(ACTION_TYPES.SEND_BOOKING_LINK === 'send_booking_link', 'SEND_BOOKING_LINK action');
    });

    // Test 2: Webhook processing with mock data
    await runTest('Process test webhook payload', async () => {
        const testPayload = {
            type: 'post_call_transcription',
            event_timestamp: Math.floor(Date.now() / 1000),
            data: {
                conversation_id: 'test-conv-123',
                transcript: [
                    { role: 'agent', message: 'Hello, how can I help?' },
                    { role: 'user', message: 'Send me details on WhatsApp please' }
                ],
                analysis: {
                    evaluation_criteria_results: {
                        whatsapp_requested: 'success'
                    },
                    transcript_summary: 'Customer requested WhatsApp details'
                },
                conversation_initiation_client_data: {
                    dynamic_variables: {
                        lead_id: 'test-lead-456',
                        lead_name: 'Test Customer'
                    }
                },
                metadata: {
                    call_duration_secs: 30
                }
            }
        };

        const result = await PostCallOrchestrator.processPostCallWebhook(testPayload);

        assert(result !== null, 'Should return a result');
        assert(result.conversationId === 'test-conv-123', 'Should capture conversation ID');
        assert(Array.isArray(result.actionsExecuted), 'Should have actionsExecuted array');
    });

    // Test 3: Call failure handling
    await runTest('Handle call initiation failure webhook', async () => {
        const failurePayload = {
            type: 'call_initiation_failure',
            event_timestamp: Math.floor(Date.now() / 1000),
            data: {
                agent_id: 'test-agent',
                conversation_id: 'failed-conv-123',
                failure_reason: 'busy',
                metadata: {
                    type: 'twilio',
                    body: {
                        To: '+919876543210',
                        CallStatus: 'busy'
                    }
                }
            }
        };

        const result = await PostCallOrchestrator.processPostCallWebhook(failurePayload);

        assert(result !== null, 'Should return a result');
        assert(result.type === 'call_failure_handled', 'Should be marked as failure handled');
        assert(result.failureReason === 'busy', 'Should capture failure reason');
    });

    // Test 4: Simple call status processing
    await runTest('Process simple call status', async () => {
        const result = await PostCallOrchestrator.processCallStatus({
            status: 'completed',
            phoneNumber: '+919876543210',
            duration: 45
        });

        assert(result.success === true, 'Should succeed');
        assert(result.status !== null, 'Should return a status');
    });
}

// ============================================================================
// TEST: WEBHOOK HTTP ENDPOINTS
// ============================================================================

async function testWebhookEndpoints() {
    log('\n🌐 Testing Webhook HTTP Endpoints...', 'info');

    // Test 1: Health check endpoint
    await runTest('Webhook health endpoint', async () => {
        try {
            const response = await axios.get(`${CONFIG.baseUrl}/webhook/health`, { timeout: 5000 });
            assert(response.status === 200, 'Should return 200');
            assert(response.data.status === 'healthy', 'Should report healthy status');
            assert(response.data.service === 'ai-webhook-handler', 'Should identify service');
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error('Server not running. Start with: npm start');
            }
            throw error;
        }
    });

    // Test 2: Test webhook endpoint
    await runTest('Test webhook endpoint with sample payload', async () => {
        try {
            const response = await axios.post(`${CONFIG.baseUrl}/webhook/test`, {}, { timeout: 10000 });
            assert(response.status === 200, 'Should return 200');
            assert(response.data.message === 'Test webhook processed', 'Should confirm processing');
            assert(response.data.result !== null, 'Should return result');
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error('Server not running. Start with: npm start');
            }
            throw error;
        }
    });

    // Test 3: Main webhook endpoint
    await runTest('Main ElevenLabs webhook endpoint', async () => {
        try {
            const testPayload = {
                type: 'post_call_transcription',
                event_timestamp: Math.floor(Date.now() / 1000),
                data: {
                    conversation_id: 'http-test-' + Date.now(),
                    transcript: [
                        { role: 'user', message: 'I am interested in your properties' }
                    ],
                    analysis: {
                        transcript_summary: 'HTTP test conversation'
                    },
                    metadata: { call_duration_secs: 10 }
                }
            };

            const response = await axios.post(`${CONFIG.baseUrl}/webhook/elevenlabs`, testPayload, {
                timeout: 5000,
                headers: { 'Content-Type': 'application/json' }
            });

            assert(response.status === 200, 'Should return 200');
            assert(response.data.status === 'received', 'Should acknowledge receipt');
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error('Server not running. Start with: npm start');
            }
            throw error;
        }
    });

    // Test 4: Legacy webhook endpoint
    await runTest('Legacy AI call webhook endpoint', async () => {
        try {
            const legacyPayload = {
                CallSid: 'TEST' + Date.now(),
                CallStatus: 'completed',
                From: '+919876543210',
                Duration: '30'
            };

            const response = await axios.post(`${CONFIG.baseUrl}/ai-call-webhook`, legacyPayload, {
                timeout: 5000,
                headers: { 'Content-Type': 'application/json' }
            });

            assert(response.status === 200, 'Should return 200');
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error('Server not running. Start with: npm start');
            }
            throw error;
        }
    });
}

// ============================================================================
// TEST: INTEGRATION SCENARIOS
// ============================================================================

async function testIntegrationScenarios() {
    log('\n🔗 Testing Integration Scenarios...', 'info');

    // Scenario 1: Customer requests WhatsApp details
    await runTest('Scenario: Customer requests WhatsApp details', async () => {
        const { PostCallOrchestrator } = require('./src/services/postCallOrchestrator');

        const payload = {
            type: 'post_call_transcription',
            event_timestamp: Math.floor(Date.now() / 1000),
            data: {
                conversation_id: 'scenario-whatsapp-' + Date.now(),
                transcript: [
                    { role: 'agent', message: 'Hello, thank you for calling JK Construction. How can I help you?' },
                    { role: 'user', message: 'Hi, I saw your ad for apartments in Chennai. Can you send me the details on WhatsApp?' },
                    { role: 'agent', message: 'Of course! I will send you all the details including brochure and pricing on WhatsApp.' },
                    { role: 'user', message: 'Perfect, thank you!' }
                ],
                analysis: {
                    evaluation_criteria_results: {
                        user_interested: 'success',
                        whatsapp_requested: 'success'
                    },
                    transcript_summary: 'Customer interested in Chennai apartments, requested WhatsApp details.'
                },
                conversation_initiation_client_data: {
                    dynamic_variables: {
                        lead_id: 'scenario-lead-1',
                        lead_name: 'Test Scenario Customer',
                        phone_number: '+919876543210'
                    }
                },
                metadata: { call_duration_secs: 25 }
            }
        };

        const result = await PostCallOrchestrator.processPostCallWebhook(payload);

        // Verify intents were detected
        assert(result.analysis.intents.includes('send_whatsapp'), 'Should detect WhatsApp intent');
        
        // Verify actions were planned
        assert(result.plannedActions.includes('send_whatsapp_details'), 'Should plan WhatsApp action');
    });

    // Scenario 2: Customer wants to book site visit
    await runTest('Scenario: Customer wants to book site visit', async () => {
        const { PostCallOrchestrator } = require('./src/services/postCallOrchestrator');

        const payload = {
            type: 'post_call_transcription',
            event_timestamp: Math.floor(Date.now() / 1000),
            data: {
                conversation_id: 'scenario-visit-' + Date.now(),
                transcript: [
                    { role: 'agent', message: 'Hello! How can I assist you today?' },
                    { role: 'user', message: 'I want to schedule a site visit to see the villas in ECR' },
                    { role: 'agent', message: 'Great! When would you like to visit?' },
                    { role: 'user', message: 'This Saturday morning would be good' }
                ],
                analysis: {
                    evaluation_criteria_results: {
                        user_interested: 'success',
                        site_visit_requested: 'success'
                    },
                    data_collection_results: {
                        location: 'ECR',
                        property_type: 'villa',
                        preferred_date: 'Saturday'
                    },
                    transcript_summary: 'Customer wants to visit villas in ECR, Saturday morning preferred.'
                },
                conversation_initiation_client_data: {
                    dynamic_variables: {
                        lead_id: 'scenario-lead-2',
                        lead_name: 'Villa Seeker'
                    }
                },
                metadata: { call_duration_secs: 40 }
            }
        };

        const result = await PostCallOrchestrator.processPostCallWebhook(payload);

        // Verify intents were detected
        assert(result.analysis.intents.includes('book_site_visit'), 'Should detect site visit intent');
        
        // Verify qualification
        assert(result.analysis.qualification === 'hot', 'Should qualify as hot lead');
        
        // Verify booking action was planned
        assert(result.plannedActions.includes('send_booking_link'), 'Should plan booking link action');
    });

    // Scenario 3: Customer is not interested
    await runTest('Scenario: Customer is not interested', async () => {
        const { PostCallOrchestrator } = require('./src/services/postCallOrchestrator');

        const payload = {
            type: 'post_call_transcription',
            event_timestamp: Math.floor(Date.now() / 1000),
            data: {
                conversation_id: 'scenario-notinterested-' + Date.now(),
                transcript: [
                    { role: 'agent', message: 'Hello! Would you like to know about our new project?' },
                    { role: 'user', message: 'No thanks, I am not interested at the moment. Please remove my number.' }
                ],
                analysis: {
                    evaluation_criteria_results: {
                        not_interested: 'success'
                    },
                    transcript_summary: 'Customer not interested, requested to be removed from list.'
                },
                conversation_initiation_client_data: {
                    dynamic_variables: { lead_id: 'scenario-lead-3' }
                },
                metadata: { call_duration_secs: 15 }
            }
        };

        const result = await PostCallOrchestrator.processPostCallWebhook(payload);

        // Verify not interested intent
        assert(result.analysis.intents.includes('not_interested'), 'Should detect not interested intent');
        
        // Verify qualification
        assert(result.analysis.qualification === 'cold', 'Should qualify as cold lead');
    });
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAllTests() {
    console.log('\n' + '='.repeat(60));
    log('🧪 POST-CALL AUTOMATION TEST SUITE', 'info');
    console.log('='.repeat(60));
    console.log(`Test server: ${CONFIG.baseUrl}`);
    console.log(`Started at: ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    const startTime = Date.now();

    // Run all test suites
    await testWhatsAppService();
    await testIntentAnalyzerService();
    await testPostCallOrchestrator();
    
    // HTTP tests only if server is likely running
    try {
        await axios.get(`${CONFIG.baseUrl}/health`, { timeout: 2000 });
        await testWebhookEndpoints();
        await testIntegrationScenarios();
    } catch (error) {
        log('\n⚠️  Skipping HTTP tests - server not running', 'warn');
        skipTest('HTTP Webhook Tests', 'Server not running at ' + CONFIG.baseUrl);
        skipTest('Integration Scenarios', 'Server not running');
    }

    const totalTime = Date.now() - startTime;

    // Print summary
    console.log('\n' + '='.repeat(60));
    log('📊 TEST RESULTS SUMMARY', 'info');
    console.log('='.repeat(60));
    log(`  ✅ Passed:  ${results.passed}`, 'success');
    log(`  ❌ Failed:  ${results.failed}`, results.failed > 0 ? 'error' : 'info');
    log(`  ⏭️  Skipped: ${results.skipped}`, 'warn');
    console.log(`  ⏱️  Total time: ${totalTime}ms`);
    console.log('='.repeat(60));

    // Exit code based on failures
    if (results.failed > 0) {
        log('\n❌ SOME TESTS FAILED', 'error');
        process.exit(1);
    } else {
        log('\n✅ ALL TESTS PASSED', 'success');
        process.exit(0);
    }
}

// Run tests
runAllTests().catch(error => {
    log(`\n💥 Test suite crashed: ${error.message}`, 'error');
    console.error(error.stack);
    process.exit(1);
});
