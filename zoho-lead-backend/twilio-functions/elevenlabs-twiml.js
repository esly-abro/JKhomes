// Twilio Function: elevenlabs-twiml
// Path: /elevenlabs-twiml
// 
// This function calls ElevenLabs register-call API and returns TwiML
// Deploy this to Twilio Functions

const axios = require('axios');

exports.handler = async function (context, event, callback) {
    const response = new Twilio.Response();
    response.appendHeader('Content-Type', 'text/xml');

    try {
        // Get parameters from query string
        const { CallSid, leadId, leadName, toNumber } = event;

        console.log('Generating TwiML for call:', { CallSid, leadId, toNumber });

        // ElevenLabs configuration
        const ELEVENLABS_API_KEY = context.ELEVENLABS_API_KEY;
        const ELEVENLABS_AGENT_ID = context.ELEVENLABS_AGENT_ID;
        const TWILIO_PHONE_NUMBER = context.TWILIO_PHONE_NUMBER;

        // Call ElevenLabs register-call endpoint
        const elevenLabsResponse = await axios.post(
            'https://api.elevenlabs.io/v1/convai/register-call',
            {
                agent_id: ELEVENLABS_AGENT_ID,
                from_number: TWILIO_PHONE_NUMBER,
                to_number: toNumber || '',
                direction: 'outbound'
            },
            {
                headers: {
                    'xi-api-key': ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('ElevenLabs register-call successful');

        // Return the TwiML from ElevenLabs
        response.setBody(elevenLabsResponse.data);
        callback(null, response);

    } catch (error) {
        console.error('ElevenLabs register-call failed:', error.message);

        // Fallback TwiML
        const twiml = new Twilio.twiml.VoiceResponse();
        twiml.say('Sorry, there was an error connecting to the agent. Please try again later.');
        twiml.hangup();

        response.setBody(twiml.toString());
        callback(null, response);
    }
};
