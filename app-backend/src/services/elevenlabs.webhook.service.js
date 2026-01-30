/**
 * ElevenLabs Webhook Service
 * Handles incoming webhooks from ElevenLabs for call completion events
 * This enables automation workflows to branch based on AI call results
 */

const AutomationRun = require('../models/AutomationRun');
const Lead = require('../models/Lead');
const config = require('../config/env');
const axios = require('axios');

class ElevenLabsWebhookService {
  constructor() {
    // ElevenLabs webhook doesn't use HMAC signature like Meta
    // But we can validate the payload structure and optionally use a secret
    this.webhookSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;
    this.baseUrl = 'https://api.elevenlabs.io/v1/convai/conversations';
    this.apiKey = config.elevenLabs?.apiKey;
  }

  /**
   * Verify webhook request (optional secret-based auth)
   * ElevenLabs webhooks can include a custom header for verification
   */
  verifyWebhook(request) {
    // If webhook secret is configured, verify it
    if (this.webhookSecret) {
      const headerSecret = request.headers['x-elevenlabs-secret'] || 
                          request.headers['x-webhook-secret'];
      if (headerSecret !== this.webhookSecret) {
        console.log('❌ ElevenLabs webhook secret mismatch');
        return false;
      }
    }
    return true;
  }

  /**
   * Parse and validate webhook payload from ElevenLabs
   * ElevenLabs sends call status updates with conversation data
   */
  parseWebhookPayload(payload) {
    // ElevenLabs webhook typically includes:
    // - conversation_id: unique ID for the call
    // - call_sid: Twilio call SID
    // - status: call status (initiated, ringing, in-progress, completed, failed)
    // - duration: call duration in seconds
    // - metadata: custom data passed during call initiation

    if (!payload) {
      return { valid: false, error: 'Empty payload' };
    }

    // Extract key fields
    const parsed = {
      conversationId: payload.conversation_id || payload.conversationId,
      callSid: payload.call_sid || payload.callSid || payload.CallSid,
      status: payload.status || payload.Status,
      duration: payload.duration || payload.call_duration_secs || payload.CallDuration,
      metadata: payload.metadata || {},
      // ElevenLabs analysis data (if available)
      analysis: payload.analysis || {},
      transcript: payload.transcript || payload.transcription,
      transcriptSummary: payload.analysis?.transcript_summary,
      evaluationResults: payload.analysis?.evaluation_criteria_results,
      // Extract custom metadata we passed during call initiation
      automationRunId: payload.metadata?.automationRunId || 
                       payload.conversation_initiation_client_data?.dynamic_variables?.automation_run_id,
      leadId: payload.metadata?.leadId ||
              payload.conversation_initiation_client_data?.dynamic_variables?.lead_id,
      valid: true
    };

    // Determine call outcome
    parsed.outcome = this.determineCallOutcome(payload);

    return parsed;
  }

  /**
   * Determine the call outcome based on status and analysis
   */
  determineCallOutcome(payload) {
    const status = payload.status?.toLowerCase() || '';
    const evaluation = payload.analysis?.evaluation_criteria_results || {};
    
    // Check call status first
    if (status === 'no-answer' || status === 'no_answer') return 'no_answer';
    if (status === 'busy') return 'busy';
    if (status === 'failed' || status === 'error') return 'failed';
    if (status === 'voicemail') return 'voicemail';
    
    // If completed, analyze the result
    if (status === 'completed' || status === 'done') {
      // Check ElevenLabs evaluation criteria for interest
      // These are custom criteria set up in ElevenLabs agent config
      if (evaluation.interested === 'true' || evaluation.interested === true) {
        return 'interested';
      }
      if (evaluation.not_interested === 'true' || evaluation.not_interested === true) {
        return 'not_interested';
      }
      if (evaluation.callback_requested === 'true' || evaluation.callback_requested === true) {
        return 'callback_requested';
      }
      
      // Default to 'answered' if we don't have detailed analysis
      return 'answered';
    }
    
    // Still in progress
    if (status === 'in-progress' || status === 'ringing' || status === 'initiated') {
      return 'in_progress';
    }
    
    return 'unknown';
  }

  /**
   * Process incoming webhook and resume automation if needed
   */
  async handleWebhook(payload) {
    console.log('📞 ElevenLabs webhook received:', JSON.stringify(payload, null, 2));
    
    const parsed = this.parseWebhookPayload(payload);
    if (!parsed.valid) {
      console.log('❌ Invalid webhook payload:', parsed.error);
      return { success: false, error: parsed.error };
    }

    // Skip non-terminal states (we only care about completed/failed calls)
    if (parsed.outcome === 'in_progress') {
      console.log('📞 Call still in progress, waiting for completion...');
      return { success: true, message: 'Call in progress' };
    }

    // Find the automation run waiting for this call
    let run = null;

    // Try to find by callSid first (most reliable)
    if (parsed.callSid) {
      run = await AutomationRun.findByCallId(parsed.callSid);
    }

    // Fallback to conversation ID
    if (!run && parsed.conversationId) {
      run = await AutomationRun.findByConversationId(parsed.conversationId);
    }

    // Last resort: try automationRunId from metadata
    if (!run && parsed.automationRunId) {
      try {
        run = await AutomationRun.findById(parsed.automationRunId)
          .populate('lead')
          .populate('automation');
        
        // Verify it's actually waiting for a call
        if (run && !run.waitingForCall?.isWaiting) {
          console.log('⚠️ Found run by ID but not waiting for call');
          run = null;
        }
      } catch (e) {
        // Invalid ID format
      }
    }

    if (!run) {
      console.log('⚠️ No automation run found waiting for this call');
      // Still try to update the lead if we have leadId
      if (parsed.leadId) {
        await this.updateLeadFromCall(parsed.leadId, parsed);
      }
      return { success: true, message: 'No matching automation run', processed: false };
    }

    console.log(`✅ Found automation run ${run._id} waiting for call result`);
    
    // Resume the workflow with call result
    const workflowEngine = require('./workflow.engine');
    await workflowEngine.resumeFromCallResult(run, parsed);

    return {
      success: true,
      message: 'Automation resumed from call result',
      runId: run._id.toString(),
      outcome: parsed.outcome
    };
  }

  /**
   * Update lead record with call results
   */
  async updateLeadFromCall(leadId, callData) {
    try {
      const lead = await Lead.findById(leadId);
      if (!lead) return;

      const noteDate = new Date().toLocaleString();
      let note = `\n\n--- AI Call Result (${noteDate}) ---\n`;
      note += `Outcome: ${callData.outcome}\n`;
      note += `Status: ${callData.status}\n`;
      if (callData.duration) note += `Duration: ${callData.duration}s\n`;
      if (callData.transcriptSummary) note += `Summary: ${callData.transcriptSummary}\n`;
      if (callData.evaluationResults && Object.keys(callData.evaluationResults).length > 0) {
        note += `Analysis: ${JSON.stringify(callData.evaluationResults)}\n`;
      }
      if (callData.conversationId) note += `Ref: ${callData.conversationId}`;

      lead.notes = (lead.notes || '') + note;
      lead.lastContactedAt = new Date();

      // Update status based on outcome
      if (callData.outcome === 'interested') {
        lead.status = 'Qualified';
      } else if (callData.outcome === 'answered' && 
                (lead.status === 'New' || lead.status === 'Unassigned')) {
        lead.status = 'Contacted';
      }

      await lead.save();
      console.log(`✅ Updated lead ${leadId} with call result`);
    } catch (error) {
      console.error(`❌ Failed to update lead ${leadId}:`, error);
    }
  }

  /**
   * Fetch conversation details from ElevenLabs API
   * Used to get full analysis when webhook payload is incomplete
   */
  async fetchConversationDetails(conversationId) {
    if (!this.apiKey || !conversationId) return null;

    try {
      const response = await axios.get(`${this.baseUrl}/${conversationId}`, {
        headers: { 'xi-api-key': this.apiKey }
      });
      return response.data;
    } catch (error) {
      console.error('❌ Failed to fetch conversation details:', error.message);
      return null;
    }
  }

  /**
   * Poll for call completion (fallback when webhooks aren't available)
   * This can be used by a cron job to check pending calls
   */
  async pollPendingCalls() {
    if (!this.apiKey) return;

    // Find all runs waiting for call results
    const pendingRuns = await AutomationRun.find({
      status: 'waiting_for_response',
      'waitingForCall.isWaiting': true
    }).populate('lead').populate('automation');

    console.log(`📞 Polling ${pendingRuns.length} pending AI calls...`);

    for (const run of pendingRuns) {
      try {
        const conversationId = run.waitingForCall?.conversationId;
        if (!conversationId) continue;

        const details = await this.fetchConversationDetails(conversationId);
        if (!details) continue;

        // Check if call is complete
        const status = details.status?.toLowerCase();
        if (status === 'completed' || status === 'done' || status === 'failed') {
          console.log(`📞 Call ${conversationId} completed, processing...`);
          
          // Create payload from fetched data
          const payload = {
            conversation_id: conversationId,
            call_sid: run.waitingForCall.callId,
            status: details.status,
            duration: details.call_duration_secs,
            analysis: details.analysis,
            metadata: { automationRunId: run._id.toString() }
          };

          await this.handleWebhook(payload);
        }
      } catch (error) {
        console.error(`❌ Error polling call for run ${run._id}:`, error);
      }
    }
  }

  /**
   * Check for timed out calls and handle them
   */
  async processCallTimeouts() {
    const timedOut = await AutomationRun.findTimedOutCalls();
    
    if (timedOut.length > 0) {
      console.log(`⏰ Processing ${timedOut.length} timed out AI calls...`);
    }

    for (const run of timedOut) {
      try {
        // Try one last time to fetch the call result
        const conversationId = run.waitingForCall?.conversationId;
        if (conversationId && this.apiKey) {
          const details = await this.fetchConversationDetails(conversationId);
          if (details?.status && details.status !== 'in-progress') {
            // We got a result, process it
            const payload = {
              conversation_id: conversationId,
              call_sid: run.waitingForCall.callId,
              status: details.status,
              duration: details.call_duration_secs,
              analysis: details.analysis
            };
            await this.handleWebhook(payload);
            continue;
          }
        }

        // No result available, use timeout path
        console.log(`⏰ Call timeout for run ${run._id}, using timeout path`);
        const workflowEngine = require('./workflow.engine');
        await workflowEngine.resumeFromCallTimeout(run);
      } catch (error) {
        console.error(`❌ Error processing call timeout for run ${run._id}:`, error);
      }
    }
  }
}

module.exports = new ElevenLabsWebhookService();
