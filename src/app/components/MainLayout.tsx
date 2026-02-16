import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Activity,
  Calendar,
  MessageSquare,
  BarChart3,
  Settings,
  Search,
  Bell,
  HelpCircle,
  ChevronDown,
  Plus,
  Upload,
  CalendarPlus,
  Building2,
  Home,
  Menu,
  X,
  LogOut,
  Check,
  UserCheck,
  Zap,
  Megaphone,
  ClipboardList,
  Bot
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { logout, getStoredUser } from '../../services/auth';
import NotificationMenu from './NotificationMenu';
import { useTenantConfig } from '../context/TenantConfigContext';
import { useOrganization } from '../hooks/useOrganization';

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);

  // Get current user role for permissions
  const currentUser = getStoredUser();
  const isAdminOrManager = currentUser?.role === 'admin' || currentUser?.role === 'manager' || currentUser?.role === 'owner';
  const isAgent = currentUser?.role === 'agent' || currentUser?.role === 'bpo';

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const { isModuleEnabled } = useTenantConfig();
  const { catalogModuleLabel } = useOrganization();

  // Navigation items - some are hidden for agents
  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, showFor: 'all' },
    { name: isAgent ? 'My Leads' : 'Leads', href: '/leads', icon: Users, showFor: 'all' },
    { name: 'Tasks', href: '/tasks', icon: ClipboardList, showFor: 'all' },
    { name: 'Agents', href: '/agents', icon: UserCheck, showFor: 'admin' },
    { name: catalogModuleLabel, href: '/properties', icon: Home, showFor: 'admin', module: 'catalog' },
    { name: 'Broadcasts', href: '/broadcasts', icon: Megaphone, showFor: 'admin', module: 'broadcasts' },
    { name: 'Activities', href: '/activities', icon: Activity, showFor: 'all' },
    { name: 'Calendar', href: '/calendar', icon: Calendar, showFor: 'all', module: 'appointments' },
    { name: 'Analytics', href: '/analytics', icon: BarChart3, showFor: 'admin' },
    { name: 'Settings', href: '/settings', icon: Settings, showFor: 'admin' },
    { name: 'Automation', href: '/automation', icon: Zap, showFor: 'admin' },
    { name: 'AI Agents', href: '/ai-agents', icon: Bot, showFor: 'admin' },
  ].filter(item => {
    // Check module enablement
    if (item.module && !isModuleEnabled(item.module)) return false;
    // Check role permissions
    return item.showFor === 'all' || (item.showFor === 'admin' && isAdminOrManager);
  });

  const isActive = (href: string) => location.pathname === href;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 z-40">
        <div className="h-full px-4 flex items-center justify-between gap-4">
          {/* Left Section */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 hover:bg-gray-100 rounded-md"
            >
              {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>

            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6 text-blue-600" />
              <span className="font-bold text-lg hidden sm:block">Pulsar</span>
            </div>


          </div>

          {/* Center - Search */}
          <div className="flex-1 max-w-md hidden md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="search"
                placeholder="Search leads, deals, people..."
                className="pl-10"
              />
            </div>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="hidden sm:flex">
                  <Plus className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate('/leads?action=add')}>
                  <Users className="h-4 w-4 mr-2" />
                  Add Lead
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/leads?action=import')}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/calendar')}>
                  <CalendarPlus className="h-4 w-4 mr-2" />
                  Schedule
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <NotificationMenu />

            <Button
              variant="ghost"
              size="icon"
              className="hidden sm:flex"
              onClick={() => navigate('/help')}
              title="Help & Support"
            >
              <HelpCircle className="h-5 w-5" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 hover:bg-gray-100 rounded-md p-1">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>JD</AvatarFallback>
                  </Avatar>
                  <ChevronDown className="h-4 w-4 hidden sm:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate('/settings?tab=profile')}>
                  <Users className="h-4 w-4 mr-2" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-16 bottom-0 w-64 bg-white border-r border-gray-200 z-30 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
      >
        <nav className="h-full p-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${active
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-700 hover:bg-gray-100'
                  }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 pt-16">
        <div className="p-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
