import { useState, useCallback } from 'react';
import api from '../../services/api';

interface UseAIVoiceCallOptions {
    onCallStarted?: () => void;
    onCallEnded?: () => void;
    onError?: (error: string) => void;
}

export function useAIVoiceCall(options: UseAIVoiceCallOptions = {}) {
    const [isConnecting, setIsConnecting] = useState(false);
    const [isOnCall, setIsOnCall] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Make a call via ElevenLabs (Server-side)
    const makeCall = useCallback(async (phoneNumber: string, leadId?: string, leadName?: string) => {
        try {
            setIsConnecting(true);
            setError(null);

            console.log('Initiating AI call via ElevenLabs...', { phoneNumber, leadId });

            const response = await api.post('/api/elevenlabs/call', {
                phoneNumber,
                leadId,
                leadName,
                metadata: {
                    source: 'web_dashboard'
                }
            });

            if (response.data && (response.data.success || response.data.status === 'initiated')) {
                console.log('ElevenLabs call initiated:', response.data);
                setIsConnecting(false);
                setIsOnCall(true); // Technically "initiated", not "connected" yet, but good enough for UI feedback

                options.onCallStarted?.();

                // Since we don't have real-time websocket events for ElevenLabs yet in the frontend,
                // we'll auto-reset the "On Call" state after a few seconds or rely on webhooks (which update CRM, not UI)
                // For a better UX, we'll pretend we're on call until the user refreshes or we implement polling.
                // But for now, let's just leave it as "Call Initiated"

                return true;
            } else {
                throw new Error(response.data.error || 'Failed to initiate call');
            }

        } catch (err: any) {
            console.error('Failed to make call:', err);
            const errorMessage = err.response?.data?.error || err.message || 'Call failed';
            setError(errorMessage);
            setIsConnecting(false);
            options.onError?.(errorMessage);
            return false;
        }
    }, [options]);

    // Hang up / Close call UI
    const hangUp = useCallback(() => {
        console.log('Hanging up call / Closing call UI');
        setIsOnCall(false);
        setIsConnecting(false);
        setError(null);
        options.onCallEnded?.();
    }, [options]);

    return {
        makeCall,
        hangUp,
        isConnecting,
        isOnCall,
        error,
        // Mock properties to maintain interface compatibility with LeadDetail.tsx if needed
        isReady: true,
        isMuted: false,
        toggleMute: () => { },
        formattedDuration: '00:00', // We don't track duration on client side for this yet
        transcript: []
    };
}
