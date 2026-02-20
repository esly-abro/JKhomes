/**
 * usePresence Hook (SSE-based)
 * 
 * Presence tracking is now handled by the SSE notification stream:
 *   - SSE connects → server marks user online + attendance check-in
 *   - SSE disconnects (all tabs) → 30s grace → server marks offline + check-out
 *   - No HTTP polling needed — zero extra requests
 * 
 * This hook only handles:
 *   - Agent inactivity auto-logout (15 min no interaction → force logout)
 *   - Owners/admins/managers are exempt (never auto-logged out)
 */

import { useEffect, useRef, useCallback } from 'react';
import { getStoredUser, logout } from '../../services/auth';
import api from '../../services/api';

const INACTIVITY_TIMEOUT = 15 * 60 * 1000;  // 15 minutes

// Roles that are NEVER auto-logged out
const EXEMPT_ROLES = ['owner', 'admin', 'manager'];

export function usePresence() {
    const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const user = getStoredUser();
    const isExempt = !user || EXEMPT_ROLES.includes(user.role);

    // Reset inactivity timer on any user interaction
    const resetInactivity = useCallback(() => {
        if (isExempt) return;

        if (inactivityTimer.current) {
            clearTimeout(inactivityTimer.current);
        }
        inactivityTimer.current = setTimeout(async () => {
            console.log('⏰ Agent inactive for 15 minutes — auto logging out');
            try {
                await api.post('/api/attendance/check-out');
            } catch (_e) { /* server SSE disconnect will handle it anyway */ }
            await logout();
            window.location.href = '/login?reason=inactive';
        }, INACTIVITY_TIMEOUT);
    }, [isExempt]);

    useEffect(() => {
        if (!user) return; // Not logged in

        // Only set up inactivity tracking for agents, not owners
        if (!isExempt) {
            const events = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart', 'click'];
            events.forEach(evt => window.addEventListener(evt, resetInactivity, { passive: true }));

            // Start the initial inactivity countdown
            resetInactivity();

            return () => {
                if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
                events.forEach(evt => window.removeEventListener(evt, resetInactivity));
            };
        }

        return undefined;
    }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}
