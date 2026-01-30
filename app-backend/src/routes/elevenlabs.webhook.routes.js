/**
 * ElevenLabs Webhook Routes
 * Public endpoints for ElevenLabs to send call completion webhooks
 * 
 * These routes should NOT require authentication as ElevenLabs calls them directly
 */

const elevenLabsWebhookService = require('../services/elevenlabs.webhook.service');

async function elevenLabsWebhookRoutes(fastify, options) {
  /**
   * POST /webhook/elevenlabs
   * Main webhook endpoint for ElevenLabs call events
   * 
   * ElevenLabs sends call status updates to this endpoint including:
   * - Call initiated
   * - Call ringing
   * - Call answered
   * - Call completed (with analysis)
   * - Call failed
   */
  fastify.post('/', async (request, reply) => {
    try {
      // Verify webhook (if secret is configured)
      if (!elevenLabsWebhookService.verifyWebhook(request)) {
        return reply.code(401).send({
          success: false,
          error: 'Webhook verification failed'
        });
      }

      // Process the webhook
      const result = await elevenLabsWebhookService.handleWebhook(request.body);
      
      // Always return 200 to acknowledge receipt (prevents retries)
      return reply.send({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('❌ ElevenLabs webhook error:', error);
      // Still return 200 to prevent retries, but include error info
      return reply.send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /webhook/elevenlabs/call-status
   * Alternative endpoint for call status updates
   * Some ElevenLabs integrations send to different endpoints based on event type
   */
  fastify.post('/call-status', async (request, reply) => {
    try {
      if (!elevenLabsWebhookService.verifyWebhook(request)) {
        return reply.code(401).send({
          success: false,
          error: 'Webhook verification failed'
        });
      }

      const result = await elevenLabsWebhookService.handleWebhook(request.body);
      
      return reply.send({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('❌ ElevenLabs call-status webhook error:', error);
      return reply.send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /webhook/elevenlabs/twilio-status
   * Webhook for Twilio status callbacks (when using ElevenLabs with Twilio)
   * Twilio sends different payload format
   */
  fastify.post('/twilio-status', async (request, reply) => {
    try {
      const body = request.body;
      
      // Map Twilio status callback to our format
      const mappedPayload = {
        call_sid: body.CallSid,
        status: mapTwilioStatus(body.CallStatus),
        duration: body.CallDuration ? parseInt(body.CallDuration) : undefined,
        metadata: {
          // Try to extract from URL parameters or custom attributes
          automationRunId: body.AutomationRunId || request.query.automationRunId
        }
      };

      const result = await elevenLabsWebhookService.handleWebhook(mappedPayload);
      
      // Twilio expects empty 200 response
      return reply.code(200).send('');
    } catch (error) {
      console.error('❌ Twilio status webhook error:', error);
      return reply.code(200).send('');
    }
  });

  /**
   * GET /webhook/elevenlabs/status
   * Status check endpoint for monitoring
   */
  fastify.get('/status', async (request, reply) => {
    const AutomationRun = require('../models/AutomationRun');
    
    try {
      // Get count of calls waiting for results
      const waitingCount = await AutomationRun.countDocuments({
        status: 'waiting_for_response',
        'waitingForCall.isWaiting': true
      });

      // Get count of timed out calls
      const timedOutCount = await AutomationRun.countDocuments({
        status: 'waiting_for_response',
        'waitingForCall.isWaiting': true,
        'waitingForCall.timeoutAt': { $lt: new Date() }
      });

      return reply.send({
        success: true,
        status: 'active',
        pendingCalls: waitingCount,
        timedOutCalls: timedOutCount,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /webhook/elevenlabs/poll
   * Manually trigger polling of pending calls
   * Useful when webhooks aren't configured or for recovery
   * This endpoint should be protected in production
   */
  fastify.post('/poll', async (request, reply) => {
    try {
      // Only allow in development or with secret
      const secret = request.headers['x-poll-secret'] || request.query.secret;
      if (process.env.NODE_ENV === 'production' && 
          secret !== process.env.ELEVENLABS_WEBHOOK_SECRET) {
        return reply.code(401).send({
          success: false,
          error: 'Unauthorized'
        });
      }

      await elevenLabsWebhookService.pollPendingCalls();
      await elevenLabsWebhookService.processCallTimeouts();
      
      return reply.send({
        success: true,
        message: 'Polling completed'
      });
    } catch (error) {
      console.error('❌ Manual poll error:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /webhook/elevenlabs/test
   * Test endpoint for development
   * Simulates a call completion webhook
   */
  if (process.env.NODE_ENV !== 'production') {
    fastify.post('/test', async (request, reply) => {
      const { automationRunId, outcome = 'answered', duration = 45 } = request.body;
      
      // Find the run to get call details
      const AutomationRun = require('../models/AutomationRun');
      const run = await AutomationRun.findById(automationRunId);
      
      if (!run) {
        return reply.code(404).send({
          success: false,
          error: 'Automation run not found'
        });
      }

      // Simulate webhook payload
      const testPayload = {
        conversation_id: run.waitingForCall?.conversationId || `test-conv-${Date.now()}`,
        call_sid: run.waitingForCall?.callId || `test-call-${Date.now()}`,
        status: outcome === 'failed' ? 'failed' : 'completed',
        duration: duration,
        analysis: {
          transcript_summary: 'This is a test call summary.',
          evaluation_criteria_results: {
            interested: outcome === 'interested' ? 'true' : 'false',
            callback_requested: outcome === 'callback_requested' ? 'true' : 'false'
          }
        },
        metadata: {
          automationRunId: automationRunId
        }
      };

      const result = await elevenLabsWebhookService.handleWebhook(testPayload);
      
      return reply.send({
        success: true,
        message: 'Test webhook processed',
        testPayload,
        result
      });
    });
  }
}

/**
 * Map Twilio call status to our standard status
 */
function mapTwilioStatus(twilioStatus) {
  const statusMap = {
    'queued': 'initiated',
    'ringing': 'ringing',
    'in-progress': 'in-progress',
    'completed': 'completed',
    'busy': 'busy',
    'failed': 'failed',
    'no-answer': 'no_answer',
    'canceled': 'failed'
  };
  return statusMap[twilioStatus?.toLowerCase()] || twilioStatus;
}

module.exports = elevenLabsWebhookRoutes;
