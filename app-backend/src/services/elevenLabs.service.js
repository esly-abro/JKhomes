const axios = require('axios');
const Lead = require('../models/Lead');
const config = require('../config/env');
const Organization = require('../models/organization.model');

class ElevenLabsService {
    constructor() {
        // Default credentials from .env (fallback for backwards compatibility)
        this.defaultApiKey = config.elevenLabs.apiKey;
        this.defaultAgentId = config.elevenLabs.agentId;
        this.defaultPhoneNumberId = config.elevenLabs.phoneNumberId;
        this.baseUrl = 'https://api.elevenlabs.io/v1/convai/conversations';
        // Correct endpoint for Twilio-based outbound phone calls
        this.callUrl = 'https://api.elevenlabs.io/v1/convai/twilio/outbound_call';
        
        // Debug log at startup
        console.log('📞 ElevenLabs Service initialized:');
        console.log(`   Default API Key: ${this.defaultApiKey ? this.defaultApiKey.substring(0,10) + '...' : 'NOT SET'}`);
        console.log(`   Default Agent ID: ${this.defaultAgentId || 'NOT SET'}`);
        console.log(`   Default Phone Number ID: ${this.defaultPhoneNumberId || 'NOT SET'}`);
        console.log(`   Multi-tenant mode: Enabled (per-user credentials supported)`);
    }

    /**
     * Get credentials for a specific user (or fallback to defaults)
     */
    async getCredentialsForUser(userId) {
        if (userId) {
            try {
                const org = await Organization.findByUser(userId);
                if (org && org.elevenLabs?.isConnected) {
                    return {
                        apiKey: org.elevenLabs.apiKey,
                        agentId: org.elevenLabs.agentId,
                        phoneNumberId: org.elevenLabs.phoneNumberId
                    };
                }
            } catch (error) {
                console.warn('Could not fetch user ElevenLabs credentials:', error.message);
            }
        }
        
        // Fallback to default credentials from .env
        return {
            apiKey: this.defaultApiKey,
            agentId: this.defaultAgentId,
            phoneNumberId: this.defaultPhoneNumberId
        };
    }

    /**
     * Make an outbound AI call to a phone number
     * @param {string} phoneNumber - Phone number to call
     * @param {object} options - Optional settings including userId for per-user credentials
     */
    async makeCall(phoneNumber, options = {}) {
        // Get credentials (per-user if userId provided, else defaults)
        const credentials = await this.getCredentialsForUser(options.userId);
        const { apiKey, agentId, phoneNumberId } = credentials;
        
        console.log(`📞 Initiating AI call to ${phoneNumber}...`);
        console.log(`   Agent ID: ${agentId}`);
        console.log(`   Phone Number ID: ${phoneNumberId}`);
        console.log(`   Using ${options.userId ? 'user-specific' : 'default'} credentials`);
        
        if (!apiKey) {
            console.log('⚠️ ElevenLabs API key not configured - simulating call');
            return {
                success: true,
                callId: `simulated-${Date.now()}`,
                status: 'simulated',
                message: `Would call ${phoneNumber} (ElevenLabs not configured)`
            };
        }
        
        if (!agentId || !phoneNumberId) {
            console.log('⚠️ ElevenLabs Agent/Phone not configured - simulating call');
            return {
                success: true,
                callId: `simulated-${Date.now()}`,
                status: 'simulated',
                message: `Would call ${phoneNumber} (Agent/Phone ID not configured)`
            };
        }

        try {
            // Format phone number (ensure it has country code with +)
            let formattedPhone = phoneNumber.replace(/\D/g, '');
            if (!formattedPhone.startsWith('+')) {
                // Add country code if missing (default to India +91)
                if (formattedPhone.length === 10) {
                    formattedPhone = `+91${formattedPhone}`;
                } else {
                    formattedPhone = `+${formattedPhone}`;
                }
            } else {
                formattedPhone = `+${formattedPhone}`;
            }
            
            console.log(`   Formatted phone: ${formattedPhone}`);
            
            // Correct request body for Twilio outbound call endpoint
            const requestBody = {
                agent_id: agentId,
                agent_phone_number_id: phoneNumberId,
                to_number: formattedPhone,
                // Optional: custom data for the conversation
                conversation_initiation_client_data: {
                    dynamic_variables: {
                        lead_name: options.leadName || 'there',
                        lead_id: options.leadData?._id?.toString() || 'unknown'
                    }
                }
            };
            
            console.log(`   Request URL: ${this.callUrl}`);
            console.log(`   Request body:`, JSON.stringify(requestBody, null, 2));
            
            const response = await axios.post(
                this.callUrl,
                requestBody,
                {
                    headers: {
                        'xi-api-key': apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log(`✅ AI call response:`, response.data);
            
            // Check if call was successful
            if (response.data.success === false) {
                console.error('❌ Call failed:', response.data.message);
                return {
                    success: false,
                    error: response.data.message,
                    data: response.data
                };
            }
            
            return {
                success: true,
                callId: response.data.callSid || response.data.conversation_id || response.data.id,
                conversationId: response.data.conversation_id,
                status: 'initiated',
                data: response.data
            };
        } catch (error) {
            console.error('❌ ElevenLabs call error:', error.response?.data || error.message);
            console.error('   Status:', error.response?.status);
            console.error('   URL:', this.callUrl);
            
            const errorDetail = error.response?.data?.detail;
            const errorMessage = typeof errorDetail === 'object' ? errorDetail.message : errorDetail;
            
            throw new Error(errorMessage || error.message || 'Failed to initiate AI call');
        }
    }

    async syncConversations(userId = null) {
        console.log('Syncing ElevenLabs conversations...');
        
        // Get credentials (per-user if provided)
        const credentials = await this.getCredentialsForUser(userId);
        const { apiKey } = credentials;
        
        if (!apiKey) {
            console.log('⚠️ No ElevenLabs API key available for sync');
            return { updatedCount: 0 };
        }
        
        try {
            const response = await axios.get(this.baseUrl, {
                headers: { 'xi-api-key': apiKey },
                params: { page_size: 100 } // Fetch last 100
            });

            const conversations = response.data.conversations;
            console.log(`Found ${conversations.length} conversations.`);

            let updatedCount = 0;

            for (const conv of conversations) {
                const conversationId = conv.conversation_id;

                // 1. Check if already processed (check if ID is in notes)
                // Using regex is expensive but works for this scale.
                const existingLead = await Lead.findOne({ notes: { $regex: conversationId } });
                if (existingLead) {
                    continue; // Already processed
                }

                // 2. Try to find the Lead
                let lead = null;

                // Strategy A: Metadata (lead_id) - passed by our updated backend
                const metaLeadId = conv.metadata?.dynamic_variables?.lead_id || conv.conversation_initiation_client_data?.dynamic_variables?.lead_id;

                if (metaLeadId && metaLeadId !== 'unknown') {
                    try {
                        lead = await Lead.findById(metaLeadId);
                    } catch (e) {
                        // Invalid ID
                    }
                }

                // Strategy B: Phone number (metadata.to_number or dynamic_variables.phone)
                // Note: system__called_number might be present in some calls
                if (!lead) {
                    /* 
                       Note: The 'system__called_number' or 'to_number' is often null in ElevenLabs history 
                       unless explicitly passed in a specific way or using a configured number.
                       We check if it exists in dynamic_variables or metadata.
                    */
                    // Not implementing phone match yet as data shows it's null.
                }

                if (lead) {
                    await this.updateLeadFromConversation(lead, conv);
                    updatedCount++;
                }
            }

            return { success: true, matched: updatedCount, total: conversations.length };
        } catch (error) {
            console.error('ElevenLabs sync error:', error);
            throw error;
        }
    }

    async updateLeadFromConversation(lead, conv) {
        try {
            // Fetch full details for analysis
            const details = await axios.get(`${this.baseUrl}/${conv.conversation_id}`, {
                headers: { 'xi-api-key': this.apiKey }
            });

            const analysis = details.data.analysis;
            const summary = analysis.transcript_summary || 'No summary available.';
            const evaluation = analysis.evaluation_criteria_results || {};

            // Construct Note
            const noteDate = new Date(conv.start_time_unix_secs * 1000).toLocaleString();
            let note = `\n\n--- ElevenLabs Call (${noteDate}) ---\n`;
            note += `Status: ${conv.status}\n`;
            note += `Duration: ${conv.call_duration_secs}s\n`;
            note += `Summary: ${summary}\n`;

            // Add evaluation/sentiment if available
            // e.g. "Interested": "true"
            if (Object.keys(evaluation).length > 0) {
                note += `Analysis: ${JSON.stringify(evaluation)}\n`;
            }

            note += `Ref: ${conv.conversation_id}`; // Used for deduplication

            // Append to notes
            lead.notes = (lead.notes || '') + note;
            lead.lastContactedAt = new Date(conv.start_time_unix_secs * 1000);

            // Update Status Logic
            if (lead.status === 'New' || lead.status === 'Unassigned') {
                lead.status = 'Contacted';
            }

            // Simple logic: if duration > 30s, maybe "Qualified"? (Conservative approach: just Contacted)

            await lead.save();
            console.log(`Updated lead ${lead._id} with conversation ${conv.conversation_id}`);
        } catch (error) {
            console.error(`Failed to update lead ${lead._id}:`, error);
        }
    }
}

module.exports = new ElevenLabsService();
