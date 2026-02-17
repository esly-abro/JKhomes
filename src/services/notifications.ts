/**
 * Notifications API Service
 * Frontend client for in-app notifications + SSE real-time stream
 */

import api from './api';

export interface NotificationData {
    id: string;
    type: 'lead' | 'visit' | 'status' | 'callback' | 'reminder' | 'deal';
    avatarFallback: string;
    iconType: 'flag' | 'user' | 'settings' | 'mail';
    title: string;
    description?: string;
    time: string;
    timestamp: string;
    isUnread: boolean;
    section: 'new' | 'earlier';
    data?: Record<string, unknown>;
}

interface NotificationsResponse {
    success: boolean;
    notifications: NotificationData[];
    total: number;
    page: number;
    pages: number;
}

interface UnreadCountResponse {
    success: boolean;
    count: number;
}

/**
 * Fetch paginated notifications
 */
export async function fetchNotifications(page = 1, limit = 30, unreadOnly = false): Promise<NotificationsResponse> {
    const { data } = await api.get('/api/notifications', {
        params: { page, limit, unreadOnly: unreadOnly ? 'true' : 'false' }
    });
    return data;
}

/**
 * Get unread notifications count
 */
export async function fetchUnreadCount(): Promise<number> {
    const { data } = await api.get<UnreadCountResponse>('/api/notifications/unread-count');
    return data.count;
}

/**
 * Mark a single notification as read
 */
export async function markNotificationRead(id: string): Promise<void> {
    await api.patch(`/api/notifications/${id}/read`);
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsRead(): Promise<void> {
    await api.patch('/api/notifications/read-all');
}

/**
 * Connect to SSE stream for real-time notifications
 * Returns a cleanup function to close the connection
 */
export function connectNotificationStream(
    onNotification: (notification: NotificationData) => void,
    onError?: (error: Event) => void
): () => void {
    const token = localStorage.getItem('accessToken');
    if (!token) {
        console.warn('No auth token for SSE connection');
        return () => {};
    }

    const baseUrl = import.meta.env.VITE_API_URL ?? '';
    const url = `${baseUrl}/api/notifications/stream`;

    // EventSource doesn't support custom headers, so we use fetch-based SSE
    const abortController = new AbortController();
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let isActive = true;

    async function connect() {
        if (!isActive) return;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'text/event-stream'
                },
                signal: abortController.signal
            });

            if (!response.ok) {
                throw new Error(`SSE connection failed: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) return;

            const decoder = new TextDecoder();
            let buffer = '';

            while (isActive) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Parse SSE events from buffer
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                let currentEvent = '';
                let currentData = '';

                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        currentEvent = line.substring(7).trim();
                    } else if (line.startsWith('data: ')) {
                        currentData = line.substring(6).trim();
                    } else if (line === '' && currentData) {
                        // End of event
                        if (currentEvent === 'notification' && currentData) {
                            try {
                                const notification = JSON.parse(currentData) as NotificationData;
                                onNotification(notification);
                            } catch (e) {
                                console.error('Failed to parse SSE notification:', e);
                            }
                        }
                        currentEvent = '';
                        currentData = '';
                    }
                }
            }
        } catch (err: unknown) {
            if (err instanceof DOMException && err.name === 'AbortError') return;
            console.error('SSE connection error:', err);
            onError?.(new Event('error'));

            // Auto-retry after 5s
            if (isActive) {
                retryTimeout = setTimeout(connect, 5000);
            }
        }
    }

    connect();

    // Return cleanup function
    return () => {
        isActive = false;
        abortController.abort();
        if (retryTimeout) clearTimeout(retryTimeout);
    };
}
