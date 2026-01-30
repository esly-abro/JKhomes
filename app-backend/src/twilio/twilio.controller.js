const twilioService = require('./twilio.service');

async function twilioRoutes(fastify, options) {
  // Make a call
  fastify.post('/call', {
    preHandler: fastify.auth,
    handler: async (request, reply) => {
      const { phoneNumber, leadId, leadName } = request.body;
      const userId = request.user._id;

      if (!phoneNumber) {
        return reply.status(400).send({ error: 'Phone number is required' });
      }

      const result = await twilioService.makeCall(
        phoneNumber,
        twilioService.TWILIO_PHONE_NUMBER,
        userId,
        leadId,
        leadName
      );

      if (result.success) {
        console.log(`Call initiated by user ${userId} to ${phoneNumber} for lead ${leadName || leadId}`);
      }

      return reply.send(result);
    },
  });

  // Get call status
  fastify.get('/call/:callSid', {
    preHandler: fastify.auth,
    handler: async (request, reply) => {
      const { callSid } = request.params;
      const result = await twilioService.getCallStatus(callSid);
      return reply.send(result);
    },
  });

  // Get call history
  fastify.get('/calls', {
    preHandler: fastify.auth,
    handler: async (request, reply) => {
      const { limit } = request.query;
      const result = await twilioService.getCallHistory(limit ? parseInt(limit) : 20);
      return reply.send(result);
    },
  });

  // TwiML webhook for call handling
  fastify.post('/voice', {
    handler: async (request, reply) => {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Connecting your call. Please hold.</Say>
  <Dial callerId="${twilioService.TWILIO_PHONE_NUMBER}">
    <Number>${request.body.To || request.body.to}</Number>
  </Dial>
</Response>`;
      
      reply.header('Content-Type', 'text/xml');
      return reply.send(twiml);
    },
  });

  // Call status webhook - receives updates from Twilio
  fastify.post('/status', {
    handler: async (request, reply) => {
      const { CallSid, CallStatus, CallDuration, EndTime } = request.body;
      
      console.log(`Call status update: ${CallSid} -> ${CallStatus}`);
      
      // Update call log in MongoDB
      await twilioService.updateCallStatus(
        CallSid,
        CallStatus,
        CallDuration,
        EndTime
      );
      
      return reply.send({ success: true });
    },
  });
}

module.exports = twilioRoutes;
