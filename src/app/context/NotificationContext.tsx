import { createContext, useContext, useState, ReactNode } from 'react';

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

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (notification: Omit<Notification, 'id' | 'time' | 'timestamp' | 'section'>) => {
    const now = new Date();
    const newNotification: Notification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      time: getRelativeTime(now),
      timestamp: now,
      section: 'new',
    };
    setNotifications(prev => [newNotification, ...prev]);
  };

  const markAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, isUnread: false } : n))
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isUnread: false })));
  };

  const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
    // Simple console-based notification for now
    if (type === 'success') {
      console.log('✅', message);
    } else if (type === 'error') {
      console.error('❌', message);
    } else {
      console.info('ℹ️', message);
    }
    
    // You could also show a browser notification or add to the notifications array
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(message);
    }
  };

  const unreadCount = notifications.filter(n => n.isUnread).length;

  // Update relative times periodically
  const getUpdatedNotifications = () => {
    return notifications.map(n => ({
      ...n,
      time: getRelativeTime(n.timestamp),
      section: getSection(n.timestamp),
    }));
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications: getUpdatedNotifications(),
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
