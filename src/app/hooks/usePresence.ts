/**
 * usePresence Hook
 * 
 * For agents/BPO: sends heartbeat every 2 min, auto-logs out after 15 min of inactivity.
 * For owners/admins/managers: does nothing (they stay logged in forever).
 * 
 * "Inactivity" = no mouse move, click, keypress, scroll, or touch event.
 */

import { useEffect, useRef, useCallback } from 'react';
import { getStoredUser, logout } from '../../services/auth';
import api from '../../services/api';

const HEARTBEAT_INTERVAL = 2 * 60 * 1000;  // 2 minutes
const INACTIVITY_TIMEOUT = 15 * 60 * 1000;  // 15 minutes

// Roles that are NEVER auto-logged out
const EXEMPT_ROLES = ['owner', 'admin', 'manager'];

export function usePresence() {
    const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastActivity = useRef(Date.now());

    const user = getStoredUser();
    const isExempt = !user || EXEMPT_ROLES.includes(user.role);

    // Reset inactivity timer on any user interaction
    const resetInactivity = useCallback(() => {
        lastActivity.current = Date.now();

        if (isExempt) return;

        if (inactivityTimer.current) {
            clearTimeout(inactivityTimer.current);
        }
        inactivityTimer.current = setTimeout(async () => {
            console.log('⏰ Agent inactive for 15 minutes — auto logging out');
            try {
                await api.post('/api/attendance/check-out');
            } catch (_e) { /* server will auto-logout anyway */ }
            await logout();
            window.location.href = '/login?reason=inactive';
        }, INACTIVITY_TIMEOUT);
    }, [isExempt]);

    // Send heartbeat to server
    const sendHeartbeat = useCallback(async () => {
        if (!getStoredUser()) return; // logged out

        try {
            await api.post('/api/attendance/heartbeat');
        } catch (err: any) {
            // If 401 — token expired, let the axios interceptor handle it
            if (err?.response?.status === 401) return;
            console.warn('Heartbeat failed:', err?.message);
        }
    }, []);

    useEffect(() => {
        if (!user) return; // Not logged in

        // On mount: check-in and first heartbeat
        const init = async () => {
            try {
                await api.post('/api/attendance/check-in');
                await sendHeartbeat();
            } catch (_e) { /* non-critical */ }
        };
        init();

        // Start heartbeat interval (all roles — so server knows they're connected)
        heartbeatTimer.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

        // Only set up inactivity tracking for agents, not owners
        if (!isExempt) {
            const events = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart', 'click'];
            events.forEach(evt => window.addEventListener(evt, resetInactivity, { passive: true }));

            // Start the initial inactivity countdown
            resetInactivity();

            return () => {
                if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
                if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
                events.forEach(evt => window.removeEventListener(evt, resetInactivity));
            };
        }

        return () => {
            if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
        };
    }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}
