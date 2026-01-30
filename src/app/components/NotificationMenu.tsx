import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, MoreHorizontal, Flag, UserPlus, Settings, Mail, Check } from 'lucide-react';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from './ui/dropdown-menu';
import { useNotifications, Notification } from '../context/NotificationContext';

const IconBadge = ({ type }: { type: Notification['iconType'] }) => {
  const iconClasses = "h-3 w-3 text-white";
  const bgColor = type === 'flag' ? 'bg-blue-500' : type === 'user' ? 'bg-gray-600' : 'bg-blue-500';
  
  return (
    <div className={`absolute -bottom-0.5 -right-0.5 ${bgColor} rounded-full p-1 border-2 border-white`}>
      {type === 'flag' && <Flag className={iconClasses} />}
      {type === 'user' && <UserPlus className={iconClasses} />}
      {type === 'settings' && <Settings className={iconClasses} />}
      {type === 'mail' && <Mail className={iconClasses} />}
    </div>
  );
};

const NotificationItem = ({ notification, onClick }: { notification: Notification; onClick: () => void }) => {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
    >
      {/* Avatar with Icon Badge */}
      <div className="relative flex-shrink-0">
        <Avatar className="h-12 w-12">
          <AvatarFallback className="bg-blue-100 text-blue-700 text-sm font-medium">
            {notification.avatarFallback}
          </AvatarFallback>
        </Avatar>
        <IconBadge type={notification.iconType} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p 
          className="text-sm text-gray-900 leading-snug"
          dangerouslySetInnerHTML={{ __html: notification.title }}
        />
        {notification.description && (
          <p className="text-sm text-gray-600 mt-0.5">{notification.description}</p>
        )}
        <p className="text-xs text-gray-500 mt-1">{notification.time}</p>
      </div>

      {/* Unread Indicator */}
      {notification.isUnread && (
        <div className="flex-shrink-0 mt-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full" />
        </div>
      )}
    </button>
  );
};

export default function NotificationMenu() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  
  const { notifications, markAsRead, markAllAsRead, unreadCount } = useNotifications();

  const filteredNotifications = activeTab === 'unread' 
    ? notifications.filter(n => n.isUnread)
    : notifications;

  const newNotifications = filteredNotifications.filter(n => n.section === 'new');
  const earlierNotifications = filteredNotifications.filter(n => n.section === 'earlier');

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    setIsOpen(false);
  };

  const handleSeeAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    navigate('/leads');
  };

  const handleMarkAllAsRead = () => {
    markAllAsRead();
    setOptionsOpen(false);
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
          )}
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent 
        align="end" 
        className="w-96 p-0 max-h-[500px] overflow-hidden"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">Notifications</h2>
          
          {/* Options Dropdown */}
          <DropdownMenu open={optionsOpen} onOpenChange={setOptionsOpen}>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
              >
                <MoreHorizontal className="h-5 w-5 text-gray-600" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={handleMarkAllAsRead}>
                <Check className="h-4 w-4 mr-2" />
                Mark all as read
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveTab('all');
            }}
            className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
              activeTab === 'all'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            All
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveTab('unread');
            }}
            className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
              activeTab === 'unread'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Unread
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto max-h-[350px]">
          {/* New Section */}
          {newNotifications.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-sm font-semibold text-gray-900">New</span>
                <button
                  onClick={handleSeeAll}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  See all
                </button>
              </div>
              <div>
                {newNotifications.map(notification => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onClick={() => handleNotificationClick(notification)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Earlier Section */}
          {earlierNotifications.length > 0 && (
            <div>
              <div className="px-4 py-2">
                <span className="text-sm font-semibold text-gray-900">Earlier</span>
              </div>
              <div>
                {earlierNotifications.map(notification => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onClick={() => handleNotificationClick(notification)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {filteredNotifications.length === 0 && (
            <div className="px-4 py-8 text-center">
              <Bell className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                {activeTab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
              </p>
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
