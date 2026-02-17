import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
    connectNotificationStream,
    fetchNotifications,
    fetchUnreadCount,
    markAllNotificationsRead,
    markNotificationRead,
    type NotificationData
} from '../../services/notifications';

export interface Notification {
  id: string;
  type: 'lead' | 'visit' | 'status' | 'callback' | 'reminder' | 'deal';
  avatarFallback: string;
  iconType: 'flag' | 'user' | 'settings' | 'mail';
  title: string;
  description?: string;
  time: string;
  timestamp: Date;
  isUnread: boolean;
  section: 'new' | 'earlier';
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'time' | 'timestamp' | 'section'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  unreadCount: number;
  showNotification: (message: string, type: 'success' | 'error' | 'info') => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return `${diffWeeks}w`;
}

function getSection(date: Date): 'new' | 'earlier' {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  return diffDays < 7 ? 'new' : 'earlier';
}

/** Convert API notification shape to the client Notification interface */
function apiToNotification(n: NotificationData): Notification {
  const ts = new Date(n.timestamp);
  return {
    id: n.id,
    type: n.type,
    avatarFallback: n.avatarFallback,
    iconType: n.iconType,
    title: n.title,
    description: n.description,
    time: getRelativeTime(ts),
    timestamp: ts,
    isUnread: n.isUnread,
    section: getSection(ts),
  };
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem('accessToken'));
  const sseCleanupRef = useRef<(() => void) | null>(null);

  // ─── Detect login/logout by polling localStorage token ───
  useEffect(() => {
    const checkAuth = () => {
      const hasToken = !!localStorage.getItem('accessToken');
      setIsAuthenticated(prev => {
        if (prev !== hasToken) return hasToken;
        return prev;
      });
    };
    // Check every 2 seconds for token appearance (login) or removal (logout)
    const interval = setInterval(checkAuth, 2000);
    // Also listen for storage events (cross-tab)
    window.addEventListener('storage', checkAuth);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', checkAuth);
    };
  }, []);

  // ─── Load notifications from API ───
  const loadNotifications = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      const [notifRes, countRes] = await Promise.all([
        fetchNotifications(1, 50),
        fetchUnreadCount()
      ]);
      setNotifications(notifRes.notifications.map(apiToNotification));
      setUnreadCount(countRes);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  }, []);

  // ─── Connect SSE stream ───
  const connectSSE = useCallback(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    // Clean up old connection
    if (sseCleanupRef.current) {
      sseCleanupRef.current();
    }

    sseCleanupRef.current = connectNotificationStream(
      (incoming: NotificationData) => {
        const notif = apiToNotification(incoming);
        setNotifications(prev => [notif, ...prev]);
        setUnreadCount(prev => prev + 1);
      },
      () => {
        console.warn('SSE notification stream error, will auto-retry');
      }
    );
  }, []);

  // ─── When auth state changes, load notifications + connect SSE ───
  useEffect(() => {
    if (!isAuthenticated) {
      // User logged out — clear state and disconnect SSE
      setNotifications([]);
      setUnreadCount(0);
      if (sseCleanupRef.current) {
        sseCleanupRef.current();
        sseCleanupRef.current = null;
      }
      return;
    }

    // User just logged in — load notifications and connect SSE
    loadNotifications();
    connectSSE();

    // Refresh relative times every 60s
    const timer = setInterval(() => {
      setNotifications(prev =>
        prev.map(n => ({
          ...n,
          time: getRelativeTime(n.timestamp),
          section: getSection(n.timestamp),
        }))
      );
    }, 60000);

    return () => {
      clearInterval(timer);
      if (sseCleanupRef.current) {
        sseCleanupRef.current();
        sseCleanupRef.current = null;
      }
    };
  }, [isAuthenticated, loadNotifications, connectSSE]);

  // ─── addNotification (local-only, for showNotification compatibility) ───
  const addNotification = (notification: Omit<Notification, 'id' | 'time' | 'timestamp' | 'section'>) => {
    const now = new Date();
    const newNotification: Notification = {
      ...notification,
      id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      time: getRelativeTime(now),
      timestamp: now,
      section: 'new',
    };
    setNotifications(prev => [newNotification, ...prev]);
    setUnreadCount(prev => prev + 1);
  };

  // ─── markAsRead ───
  const markAsRead = useCallback(async (id: string) => {
    // Optimistic update
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, isUnread: false } : n))
    );
    setUnreadCount(prev => Math.max(0, prev - 1));

    try {
      if (!id.startsWith('local-')) {
        await markNotificationRead(id);
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  }, []);

  // ─── markAllAsRead ───
  const markAllAsRead = useCallback(async () => {
    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, isUnread: false })));
    setUnreadCount(0);

    try {
      await markAllNotificationsRead();
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  }, []);

  const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
    if (type === 'success') {
      console.log('[Notification]', message);
    } else if (type === 'error') {
      console.error('[Notification]', message);
    } else {
      console.info('[Notification]', message);
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        addNotification,
        markAsRead,
        markAllAsRead,
        unreadCount,
        showNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
