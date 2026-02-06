import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useCallback } from 'react';
import { DataProvider, useData } from './context/DataContext';
import { NotificationProvider } from './context/NotificationContext';
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
import Broadcasts from './pages/Broadcasts';
import MainLayout from './components/MainLayout';
import { getStoredUser, User } from '../services/auth';

// Inner component that can use useData hook
function AppRoutes({ user, setUser, hasCompletedOnboarding, setHasCompletedOnboarding }: {
  user: User | null;
  setUser: (user: User | null) => void;
  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (value: boolean) => void;
}) {
  const { initializeData } = useData();
  const isAuthenticated = !!user;

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
        <Route path="properties" element={<Properties />} />
        <Route path="activities" element={<Activities />} />
        <Route path="calendar" element={<CalendarView />} />

        <Route path="analytics" element={<Analytics />} />
        <Route path="agents" element={<Agents />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/users" element={<UserManagement />} />
        <Route path="automation" element={<Automation />} />
        <Route path="broadcasts" element={<Broadcasts />} />
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
      <NotificationProvider>
        <BrowserRouter>
          <AppRoutes 
            user={user} 
            setUser={setUser} 
            hasCompletedOnboarding={hasCompletedOnboarding}
            setHasCompletedOnboarding={setHasCompletedOnboarding}
          />
        </BrowserRouter>
      </NotificationProvider>
    </DataProvider>
  );
}
