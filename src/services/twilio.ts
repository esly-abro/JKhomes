/**
 * Voice Calling Service
 * Makes phone calls via ElevenLabs (which uses Twilio integration)
 */

import axios from 'axios';
import api from './api';

// ElevenLabs backend endpoint (zoho-lead-backend on port 3000)
const ELEVENLABS_API_URL = 'http://localhost:3000';

export interface CallResult {
  success: boolean;
  callSid?: string;
  callLogId?: string;
  status?: string;
  to?: string;
  from?: string;
  conversationId?: string;
  error?: string;
}

export interface CallStatusResult {
  success: boolean;
  status?: string;
  duration?: number;
  startTime?: string;
  endTime?: string;
  error?: string;
}

export interface CallHistoryItem {
  sid: string;
  to: string;
  from: string;
  status: string;
  duration: number;
  startTime: string;
  direction: string;
}

export interface CallHistoryResult {
  success: boolean;
  calls?: CallHistoryItem[];
  error?: string;
}

/**
 * Make a human phone call via ElevenLabs (Twilio integration)
 * This initiates an outbound call through ElevenLabs which uses Twilio
 */
export async function makeHumanCall(
  phoneNumber: string,
  leadId?: string,
  leadName?: string
): Promise<CallResult> {
  try {
    // Use the same endpoint as AI calls - ElevenLabs handles Twilio integration
    const response = await axios.post<any>(`${ELEVENLABS_API_URL}/elevenlabs/call`, {
      phoneNumber,
      leadId,
      leadName,
      metadata: {
        source: 'human_call_button',
        callType: 'human'
      }
    });
    
    if (response.data && (response.data.success || response.data.status === 'initiated')) {
      return {
        success: true,
        callSid: response.data.callSid || response.data.conversationId,
        status: response.data.status || 'initiated',
        to: phoneNumber,
        conversationId: response.data.conversationId,
      };
    }
    
    return {
      success: false,
      error: response.data?.error || 'Failed to initiate call',
    };
  } catch (error: any) {
    console.error('Error making human call:', error);
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to make call',
    };
  }
}

/**
 * Get the status of a call by its SID (if available)
 */
export async function getCallStatus(callSid: string): Promise<CallStatusResult> {
  try {
    // Try the app-backend endpoint if available
    const response = await api.get<CallStatusResult>(`/api/twilio/call/${callSid}`);
    return response.data;
  } catch (error: any) {
    // If call status endpoint fails, return a generic "in-progress" status
    // since ElevenLabs handles the call lifecycle
    return {
      success: true,
      status: 'in-progress',
    };
  }
}

/**
 * Get call history
 */
export async function getCallHistory(limit: number = 20): Promise<CallHistoryResult> {
  try {
    const response = await api.get<CallHistoryResult>(`/api/twilio/calls?limit=${limit}`);
    return response.data;
  } catch (error: any) {
    console.error('Error getting call history:', error);
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to get call history',
    };
  }
}

/**
 * Get Twilio access token for browser-based calling (if needed)
 */
export async function getTwilioToken(): Promise<{ token: string; identity: string } | null> {
  try {
    const response = await api.get<{ token: string; identity: string }>('/api/twilio/token');
    return response.data;
  } catch (error: any) {
    console.error('Error getting Twilio token:', error);
    return null;
  }
}

export default {
  makeHumanCall,
  getCallStatus,
  getCallHistory,
  getTwilioToken,
};
