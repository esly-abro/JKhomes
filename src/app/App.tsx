import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useCallback, useEffect } from 'react';
import { DataProvider, useData } from './context/DataContext';
import { NotificationProvider } from './context/NotificationContext';
import { TenantConfigProvider } from './context/TenantConfigContext';
import { ToastProvider, useToast } from './context/ToastContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import Activities from './pages/Activities';
import CalendarView from './pages/CalendarView';
import Tasks from './pages/Tasks';
import Analytics from './pages/Analytics';
import Properties from './pages/Properties';
import Settings from './pages/Settings';
import Help from './pages/Help';
import UserManagement from './pages/UserManagement';
import Agents from './pages/Agents';
import Automation from './pages/Automation';
import AutomationMonitor from './pages/AutomationMonitor';
import Broadcasts from './pages/Broadcasts';
import AIAgents from './pages/AIAgents';
import MyPerformance from './pages/MyPerformance';
import MainLayout from './components/MainLayout';
import ModuleGuard from './components/ModuleGuard';
import { getStoredUser, User } from '../services/auth';

// Inner component that can use useData hook
function AppRoutes({ user, setUser, hasCompletedOnboarding, setHasCompletedOnboarding }: {
  user: User | null;
  setUser: (user: User | null) => void;
  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (value: boolean) => void;
}) {
  const { initializeData } = useData();
  const { addToast } = useToast();
  const isAuthenticated = !!user;

  // Listen for global API errors (403 / 5xx) and show toasts
  useEffect(() => {
    const handler = (e: Event) => {
      const { status, message } = (e as CustomEvent).detail;
      if (status === 403) {
        addToast(message || 'You do not have permission to perform this action.', 'error');
      } else if (status >= 500) {
        addToast(message || 'Something went wrong. Please try again later.', 'error');
      }
    };
    window.addEventListener('api-error', handler);
    return () => window.removeEventListener('api-error', handler);
  }, [addToast]);

  const handleLogin = useCallback(async (loggedInUser: User) => {
    setUser(loggedInUser);
    // Immediately load all data after login
    await initializeData();
  }, [setUser, initializeData]);

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={
        isAuthenticated ? <Navigate to="/dashboard" /> : <Login onLogin={handleLogin} />
      } />
      <Route path="/signup" element={
        isAuthenticated ? <Navigate to="/onboarding" /> : <Signup onSignup={(user) => {
          setUser(user);
          setHasCompletedOnboarding(false);
        }} />
      } />

      {/* Onboarding */}
      <Route path="/onboarding" element={
        !isAuthenticated ? <Navigate to="/login" /> :
          hasCompletedOnboarding ? <Navigate to="/dashboard" /> :
            <Onboarding onComplete={() => setHasCompletedOnboarding(true)} />
      } />

      {/* Protected Routes */}
      <Route path="/" element={
        !isAuthenticated ? <Navigate to="/login" /> :
          !hasCompletedOnboarding ? <Navigate to="/onboarding" /> :
            <MainLayout />
      }>
        <Route index element={<Navigate to="/dashboard" />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="leads" element={<Leads />} />
        <Route path="leads/:id" element={<LeadDetail />} />
        <Route path="tasks" element={<Tasks />} />
        
        {/* Module-Gated Routes: Properties (Catalog) */}
        <Route path="properties" element={
          <ModuleGuard module="catalog">
            <Properties />
          </ModuleGuard>
        } />
        
        <Route path="activities" element={<Activities />} />
        
        {/* Module-Gated Routes: Calendar (Appointments) */}
        <Route path="calendar" element={
          <ModuleGuard module="appointments">
            <CalendarView />
          </ModuleGuard>
        } />

        <Route path="my-performance" element={<MyPerformance />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="agents" element={<Agents />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/users" element={<UserManagement />} />
        <Route path="automation" element={<Automation />} />
        <Route path="automation/:automationId/monitor" element={<AutomationMonitor />} />
        <Route path="ai-agents" element={<AIAgents />} />
        
        {/* Module-Gated Routes: Broadcasts */}
        <Route path="broadcasts" element={
          <ModuleGuard module="broadcasts">
            <Broadcasts />
          </ModuleGuard>
        } />
        
        <Route path="help" element={<Help />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(true); // Skip onboarding for now

  return (
    <DataProvider>
      <TenantConfigProvider>
        <NotificationProvider>
          <ToastProvider>
            <BrowserRouter>
              <AppRoutes 
                user={user} 
                setUser={setUser} 
                hasCompletedOnboarding={hasCompletedOnboarding}
                setHasCompletedOnboarding={setHasCompletedOnboarding}
              />
            </BrowserRouter>
          </ToastProvider>
        </NotificationProvider>
      </TenantConfigProvider>
    </DataProvider>
  );
}
