/**
 * WhatsApp Webhook Routes for Fastify
 * Public endpoints for Meta WhatsApp webhook callbacks
 * These endpoints must be accessible without authentication
 */

const whatsappWebhookService = require('../services/whatsapp.webhook.service');

async function whatsappWebhookRoutes(fastify, options) {
  
  /**
   * GET /webhook/whatsapp
   * Webhook verification endpoint for Meta
   * Called by Meta when setting up the webhook to verify ownership
   */
  fastify.get('/', {
    schema: {
      description: 'Meta WhatsApp webhook verification',
      querystring: {
        type: 'object',
        properties: {
          'hub.mode': { type: 'string' },
          'hub.verify_token': { type: 'string' },
          'hub.challenge': { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    console.log('📥 WhatsApp webhook verification request received');
    console.log('Query params:', request.query);
    
    const { valid, challenge } = whatsappWebhookService.verifyWebhookChallenge(request.query);
    
    if (valid) {
      // Must return the challenge as plain text, not JSON
      reply.type('text/plain');
      return reply.send(challenge);
    }
    
    return reply.code(403).send({ error: 'Verification failed' });
  });

  /**
   * POST /webhook/whatsapp
   * Main webhook endpoint for receiving messages and status updates
   * Called by Meta when messages are received or status changes occur
   */
  fastify.post('/', {
    schema: {
      description: 'Meta WhatsApp webhook for incoming messages and status updates'
    },
    // Don't parse body yet - we need raw body for signature verification
    config: {
      rawBody: true
    }
  }, async (request, reply) => {
    console.log('📥 WhatsApp webhook POST received');
    
    try {
      // Get signature from header
      const signature = request.headers['x-hub-signature-256'];
      
      // Get raw body for signature verification
      // Fastify with rawBody config should provide this
      const rawBody = request.rawBody || JSON.stringify(request.body);
      
      // Process the webhook
      const result = await whatsappWebhookService.handleWebhook(
        request.body,
        signature,
        rawBody
      );
      
      if (!result.success) {
        console.error('❌ Webhook processing failed:', result.error);
        // Still return 200 to Meta to acknowledge receipt
        // Returning non-200 will cause Meta to retry
      }
      
      // Meta expects a 200 response to acknowledge receipt
      return reply.send({ success: true });
      
    } catch (error) {
      console.error('❌ Webhook handler error:', error);
      // Still return 200 to prevent Meta retries
      return reply.send({ success: true, error: 'Internal processing error' });
    }
  });

  /**
   * GET /webhook/whatsapp/status
   * Debug endpoint to check webhook configuration status
   */
  fastify.get('/status', async (request, reply) => {
    const verifyToken = whatsappWebhookService.getVerifyToken();
    
    return reply.send({
      status: 'active',
      endpoints: {
        verification: 'GET /webhook/whatsapp',
        messages: 'POST /webhook/whatsapp',
        twilioMessages: 'POST /webhook/whatsapp/twilio'
      },
      configuration: {
        verifyTokenConfigured: !!verifyToken,
        appSecretConfigured: !!process.env.WHATSAPP_APP_SECRET || !!process.env.META_APP_SECRET
      },
      timestamp: new Date().toISOString()
    });
  });

  /**
   * POST /webhook/whatsapp/twilio
   * Twilio WhatsApp webhook endpoint
   * Twilio sends x-www-form-urlencoded data when a WhatsApp message is received
   * Configure this URL in Twilio Console → Phone Numbers → WhatsApp → Webhook
   */
  fastify.post('/twilio', async (request, reply) => {
    console.log('📥 Twilio WhatsApp webhook received');
    
    try {
      const result = await whatsappWebhookService.handleTwilioWebhook(request.body);
      
      if (!result.success) {
        console.error('❌ Twilio webhook processing failed:', result.error);
      }
      
      // Twilio expects a TwiML response (empty is fine to acknowledge)
      reply.type('text/xml');
      return reply.send('<Response></Response>');
    } catch (error) {
      console.error('❌ Twilio webhook handler error:', error);
      reply.type('text/xml');
      return reply.send('<Response></Response>');
    }
  });

  /**
   * POST /webhook/whatsapp/test
   * Test endpoint to simulate incoming messages (development only)
   */
  if (process.env.NODE_ENV !== 'production') {
    fastify.post('/test', async (request, reply) => {
      console.log('🧪 Test webhook payload received');
      
      const { phoneNumber, message, buttonPayload } = request.body;
      
      if (!phoneNumber) {
        return reply.code(400).send({ error: 'phoneNumber is required' });
      }
      
      // Create a simulated Meta webhook payload
      const simulatedPayload = {
        object: 'whatsapp_business_account',
        entry: [{
          id: 'test_entry_id',
          changes: [{
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550000000',
                phone_number_id: 'test_phone_id'
              },
              contacts: [{
                profile: { name: 'Test User' },
                wa_id: phoneNumber.replace(/\D/g, '')
              }],
              messages: [{
                id: `test_msg_${Date.now()}`,
                from: phoneNumber.replace(/\D/g, ''),
                timestamp: Math.floor(Date.now() / 1000).toString(),
                type: buttonPayload ? 'interactive' : 'text',
                ...(buttonPayload ? {
                  interactive: {
                    type: 'button_reply',
                    button_reply: {
                      id: buttonPayload,
                      title: buttonPayload
                    }
                  }
                } : {
                  text: { body: message || 'Test message' }
                })
              }]
            }
          }]
        }]
      };
      
      // Process without signature verification
      const result = await whatsappWebhookService.handleWebhook(
        simulatedPayload,
        null, // No signature
        JSON.stringify(simulatedPayload)
      );
      
      return reply.send({
        test: true,
        simulatedPayload,
        result
      });
    });
  }
}

module.exports = whatsappWebhookRoutes;
