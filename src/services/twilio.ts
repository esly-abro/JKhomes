/**
 * Voice Calling Service
 * Makes phone calls via Twilio (direct integration)
 */

import axios from 'axios';
import api from './api';

// App backend endpoint — uses relative URL so Nginx proxies to port 4000
const TWILIO_API_URL = '';

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
 * Make a human phone call via Twilio (direct integration)
 * This initiates an outbound call directly through Twilio
 */
export async function makeHumanCall(
  phoneNumber: string,
  leadId?: string,
  leadName?: string
): Promise<CallResult> {
  try {
    // Get token from localStorage for authentication
    const token = localStorage.getItem('accessToken');
    
    // Use the Twilio endpoint directly via the app-backend
    const response = await axios.post<any>(
      `${TWILIO_API_URL}/api/twilio/call`,
      {
        phoneNumber,
        leadId,
        leadName,
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.data && (response.data.success || response.data.status === 'initiated' || response.data.status === 'queued')) {
      return {
        success: true,
        callSid: response.data.callSid,
        callLogId: response.data.callLogId,
        status: response.data.status || 'initiated',
        to: response.data.to || phoneNumber,
        from: response.data.from,
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
