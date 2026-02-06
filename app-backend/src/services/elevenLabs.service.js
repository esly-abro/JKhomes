const axios = require('axios');
const Lead = require('../models/Lead');
const config = require('../config/env');

class ElevenLabsService {
    constructor() {
        // Static credentials from environment (fallback/default)
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
    }

    /**
     * Get ElevenLabs credentials for a specific user/organization
     * Falls back to environment config if no user-specific config found
     */
    async getCredentials(userId) {
        try {
            if (userId) {
                const Organization = require('../models/organization.model');
                const org = await Organization.findByUser(userId);
                
                if (org?.elevenLabs?.isConnected && org?.elevenLabs?.apiKey) {
                    console.log('📞 Using organization-specific ElevenLabs credentials');
                    return {
                        apiKey: org.elevenLabs.apiKey,
                        agentId: org.elevenLabs.agentId,
                        phoneNumberId: org.elevenLabs.phoneNumberId,
                        source: 'organization'
                    };
                }
            }
        } catch (error) {
            console.error('Error fetching organization ElevenLabs config:', error);
        }
        
        // Fallback to environment config
        console.log('📞 Using default ElevenLabs credentials from environment');
        return {
            apiKey: this.defaultApiKey,
            agentId: this.defaultAgentId,
            phoneNumberId: this.defaultPhoneNumberId,
            source: 'environment'
        };
    }

    /**
     * Make an outbound AI call to a phone number
     * @param {string} phoneNumber - Phone number to call
     * @param {object} options - Call options including userId for credential lookup
     */
    async makeCall(phoneNumber, options = {}) {
        console.log(`📞 Initiating AI call to ${phoneNumber}...`);
        
        // Get credentials - prioritize user-specific config
        const userId = options.userId || options.leadData?.assignedTo;
        const credentials = await this.getCredentials(userId);
        
        const { apiKey, agentId, phoneNumberId, source } = credentials;
        
        console.log(`   Credentials source: ${source}`);
        console.log(`   Agent ID: ${agentId}`);
        console.log(`   Phone Number ID: ${phoneNumberId}`);
        
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
            // Include automation metadata for webhook callback integration
            const requestBody = {
                agent_id: agentId,
                agent_phone_number_id: phoneNumberId,
                to_number: formattedPhone,
                // Custom data for the conversation - includes automation metadata
                conversation_initiation_client_data: {
                    dynamic_variables: {
                        lead_name: options.leadName || 'there',
                        lead_id: options.leadData?._id?.toString() || 'unknown',
                        // Pass automation metadata for webhook callback
                        automation_run_id: options.metadata?.automationRunId || '',
                        automation_id: options.metadata?.automationId || '',
                        node_id: options.metadata?.nodeId || ''
                    }
                },
                // Also include metadata at top level (some webhook formats use this)
                metadata: {
                    automationRunId: options.metadata?.automationRunId,
                    leadId: options.metadata?.leadId || options.leadData?._id?.toString(),
                    automationId: options.metadata?.automationId,
                    nodeId: options.metadata?.nodeId,
                    source: 'jk-construction-automation'
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
        
        // Get credentials for sync
        const credentials = await this.getCredentials(userId);
        const { apiKey } = credentials;
        
        if (!apiKey) {
            console.log('⚠️ ElevenLabs not configured - skipping sync');
            return { success: false, error: 'ElevenLabs not configured' };
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
            if (lead.status === 'New' || lead.status === 'No Response') {
                lead.status = 'Call Attended';
            }

            // Simple logic: if duration > 30s, consider Interested

            await lead.save();
            console.log(`Updated lead ${lead._id} with conversation ${conv.conversation_id}`);
        } catch (error) {
            console.error(`Failed to update lead ${lead._id}:`, error);
        }
    }

    /**
     * Get conversation summary for a phone number
     * @param {string} phoneNumber - Phone number to search for
     */
    async getConversationSummary(phoneNumber) {
        try {
            const credentials = await this.getCredentials();
            const { apiKey } = credentials;
            
            if (!apiKey) {
                return { summary: 'ElevenLabs not configured', conversations: [] };
            }
            
            // Normalize phone number
            let normalizedPhone = phoneNumber.replace(/\D/g, '');
            if (!normalizedPhone.startsWith('+')) {
                normalizedPhone = '+' + normalizedPhone;
            }
            
            // Fetch recent conversations
            const response = await axios.get(this.baseUrl, {
                headers: { 'xi-api-key': apiKey },
                params: { page_size: 50 }
            });
            
            const conversations = response.data.conversations || [];
            
            // Filter by phone number (check metadata or to_number)
            const relevantConvs = conversations.filter(conv => {
                const toNumber = conv.to_number || conv.metadata?.to_number || '';
                return toNumber.includes(normalizedPhone.slice(-10)) || 
                       normalizedPhone.includes(toNumber.slice(-10));
            });
            
            if (relevantConvs.length === 0) {
                return { 
                    summary: 'No AI calls found for this number yet',
                    conversations: [] 
                };
            }
            
            // Get the most recent conversation details
            const latestConv = relevantConvs[0];
            
            try {
                const detailsResponse = await axios.get(
                    `${this.baseUrl}/${latestConv.conversation_id}`,
                    { headers: { 'xi-api-key': apiKey } }
                );
                
                const details = detailsResponse.data;
                const analysis = details.analysis || {};
                
                return {
                    summary: analysis.transcript_summary || 'Call completed - no summary available',
                    transcript: details.transcript || [],
                    duration: latestConv.call_duration_secs,
                    status: latestConv.status,
                    conversationId: latestConv.conversation_id,
                    timestamp: latestConv.start_time_unix_secs 
                        ? new Date(latestConv.start_time_unix_secs * 1000).toISOString() 
                        : null,
                    evaluation: analysis.evaluation_criteria_results || {},
                    totalCalls: relevantConvs.length
                };
            } catch (detailError) {
                console.error('Error fetching conversation details:', detailError.message);
                return {
                    summary: `Last call: ${latestConv.status}`,
                    duration: latestConv.call_duration_secs,
                    status: latestConv.status,
                    conversationId: latestConv.conversation_id,
                    totalCalls: relevantConvs.length
                };
            }
        } catch (error) {
            console.error('Error fetching conversation summary:', error);
            throw new Error('Failed to fetch AI call summary');
        }
    }
}

module.exports = new ElevenLabsService();
