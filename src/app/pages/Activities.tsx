import { useState, useEffect, useMemo } from 'react';
import { useTenantConfig } from '../context/TenantConfigContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Phone, Mail, FileText, Calendar as CalendarIcon, MessageSquare,
  MapPin, RefreshCw, Zap, UserPlus, BarChart3, CheckSquare,
  ArrowUpDown, Bot, Clock
} from 'lucide-react';
import api from '../../services/api';

interface ActivityItem {
  _id: string;
  leadId?: string;
  type: string;
  title?: string;
  description?: string;
  userName?: string;
  userId?: { name?: string; email?: string } | string;
  createdAt: string;
  scheduledAt?: string;
  outcome?: string;
  metadata?: Record<string, any>;
}

interface TaskItem {
  _id: string;
  title: string;
  type: string;
  priority: string;
  dueDate: string;
  status: string;
  leadId?: string;
  leadName?: string;
}

export default function Activities() {
  const { appointmentFieldLabel } = useTenantConfig();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskLoading, setTaskLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const fetchActivities = async () => {
    try {
      const { data } = await api.get('/api/activities/all?limit=200');
      const list = Array.isArray(data) ? data : (data.data || data.activities || []);
      setActivities(list);
    } catch (err) {
      console.error('Failed to fetch activities:', err);
      setActivities([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTasks = async () => {
    try {
      const { data } = await api.get('/api/tasks');
      const list = Array.isArray(data) ? data : (data.data || data.tasks || []);
      setTasks(list);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
      setTasks([]);
    } finally {
      setTaskLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
    fetchTasks();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchActivities(), fetchTasks()]);
    setRefreshing(false);
  };

  const filteredActivities = useMemo(() => {
    if (typeFilter === 'all') return activities;
    if (typeFilter === 'automation') {
      return activities.filter(a =>
        a.metadata?.automated || a.userName === 'Automation' ||
        ['status_change', 'assignment', 'task_created', 'analytics'].includes(a.type)
      );
    }
    return activities.filter(a => a.type === typeFilter);
  }, [activities, typeFilter]);

  const taskCategories = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const overdue: TaskItem[] = [];
    const today: TaskItem[] = [];
    const upcoming: TaskItem[] = [];

    tasks
      .filter(t => t.status !== 'completed' && t.status !== 'cancelled')
      .forEach(task => {
        if (!task.dueDate) { upcoming.push(task); return; }
        const due = new Date(task.dueDate);
        due.setHours(0, 0, 0, 0);
        if (due < now) overdue.push(task);
        else if (due.getTime() === now.getTime()) today.push(task);
        else upcoming.push(task);
      });

    return { overdue, today, upcoming };
  }, [tasks]);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'call': return Phone;
      case 'email': return Mail;
      case 'note': return FileText;
      case 'meeting': return CalendarIcon;
      case 'whatsapp': case 'sms': return MessageSquare;
      case 'site_visit': case 'appointment': return MapPin;
      case 'status_change': return ArrowUpDown;
      case 'assignment': return UserPlus;
      case 'task': case 'task_created': return CheckSquare;
      case 'analytics': return BarChart3;
      case 'automation': return Zap;
      default: return FileText;
    }
  };

  const getActivityColor = (type: string, isAutomated?: boolean) => {
    if (isAutomated) return 'bg-violet-100 text-violet-600';
    switch (type) {
      case 'call': return 'bg-green-100 text-green-600';
      case 'email': return 'bg-blue-100 text-blue-600';
      case 'whatsapp': return 'bg-emerald-100 text-emerald-600';
      case 'sms': return 'bg-teal-100 text-teal-600';
      case 'site_visit': case 'appointment': return 'bg-purple-100 text-purple-600';
      case 'meeting': return 'bg-orange-100 text-orange-600';
      case 'status_change': return 'bg-amber-100 text-amber-600';
      case 'assignment': return 'bg-indigo-100 text-indigo-600';
      case 'task': case 'task_created': return 'bg-cyan-100 text-cyan-600';
      case 'analytics': return 'bg-pink-100 text-pink-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'site_visit': return appointmentFieldLabel || 'Site Visit';
      case 'appointment': return appointmentFieldLabel || 'Appointment';
      case 'status_change': return 'Status Change';
      case 'task_created': return 'Task Created';
      default: return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
  };

  const getUserName = (activity: ActivityItem) => {
    if (activity.userName) return activity.userName;
    if (activity.userId && typeof activity.userId === 'object') return activity.userId.name || 'Unknown';
    return 'System';
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  };

  const uniqueTypes = useMemo(() => {
    const types = new Set(activities.map(a => a.type));
    return Array.from(types).sort();
  }, [activities]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Activities</h1>
          <p className="text-gray-600">Track all interactions, automations, and tasks</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-gray-900">{activities.length}</div>
            <p className="text-sm text-gray-500">Total Activities</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-violet-600">
              {activities.filter(a => a.metadata?.automated || a.userName === 'Automation').length}
            </div>
            <p className="text-sm text-gray-500">Automation Actions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-red-600">{taskCategories.overdue.length}</div>
            <p className="text-sm text-gray-500">Overdue Tasks</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-blue-600">{taskCategories.today.length}</div>
            <p className="text-sm text-gray-500">Today's Tasks</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Feed */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg">Activity Feed</CardTitle>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Activities</SelectItem>
                  <SelectItem value="automation">Automation Only</SelectItem>
                  {uniqueTypes.map(t => (
                    <SelectItem key={t} value={t}>{getTypeLabel(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {loading ? (
                  <div className="text-center py-8 text-gray-500">
                    <RefreshCw className="h-8 w-8 mx-auto mb-3 text-gray-300 animate-spin" />
                    <p>Loading activities...</p>
                  </div>
                ) : filteredActivities.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p>No activities yet</p>
                    <p className="text-sm mt-1">Activities from leads, automations, and manual actions will appear here</p>
                  </div>
                ) : (
                  filteredActivities.map((activity) => {
                    const isAutomated = !!(activity.metadata?.automated || activity.userName === 'Automation');
                    const Icon = getActivityIcon(activity.type);
                    const colorClass = getActivityColor(activity.type, isAutomated);

                    return (
                      <div key={activity._id} className="flex gap-4 items-start py-3 border-b border-gray-50 last:border-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              {getTypeLabel(activity.type)}
                            </Badge>
                            {isAutomated && (
                              <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-xs">
                                <Bot className="h-3 w-3 mr-1" /> Automation
                              </Badge>
                            )}
                            {activity.outcome && activity.outcome !== 'neutral' && (
                              <Badge className={`text-xs ${
                                activity.outcome === 'positive' ? 'bg-green-100 text-green-700' :
                                activity.outcome === 'negative' ? 'bg-red-100 text-red-700' :
                                'bg-yellow-100 text-yellow-700'
                              }`}>
                                {activity.outcome}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium text-gray-900">
                            {activity.title || activity.description || 'Activity'}
                          </p>
                          {activity.description && activity.title && activity.description !== activity.title && (
                            <p className="text-sm text-gray-600 truncate">{activity.description}</p>
                          )}
                          <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                            <span>{getUserName(activity)}</span>
                            <span>·</span>
                            <span title={new Date(activity.createdAt).toLocaleString()}>
                              {formatTime(activity.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tasks & Reminders */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tasks & Reminders</CardTitle>
            </CardHeader>
            <CardContent>
              {taskLoading ? (
                <div className="text-center py-4 text-sm text-gray-400">Loading tasks...</div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <h3 className="font-semibold text-red-600 mb-2 text-sm">Overdue</h3>
                    {taskCategories.overdue.length === 0 ? (
                      <p className="text-sm text-gray-400">No overdue tasks</p>
                    ) : (
                      taskCategories.overdue.map(task => (
                        <div key={task._id} className="p-3 border border-red-200 bg-red-50 rounded-lg mb-2">
                          <div className="flex items-start gap-2 mb-1">
                            <Clock className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                            <span className="font-medium text-sm">{task.title}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs ml-6">
                            <span className="text-red-600">{new Date(task.dueDate).toLocaleDateString()}</span>
                            <Badge variant="outline" className="text-xs bg-red-100 text-red-700">{task.priority}</Badge>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2 text-sm">Today's Tasks</h3>
                    {taskCategories.today.length === 0 ? (
                      <p className="text-sm text-gray-400">No tasks for today</p>
                    ) : (
                      taskCategories.today.map(task => (
                        <div key={task._id} className="p-3 border border-blue-200 bg-blue-50 rounded-lg mb-2">
                          <div className="flex items-start gap-2 mb-1">
                            <CheckSquare className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                            <span className="font-medium text-sm">{task.title}</span>
                          </div>
                          <Badge variant="outline" className="text-xs ml-6">{task.priority}</Badge>
                        </div>
                      ))
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2 text-sm">Upcoming</h3>
                    {taskCategories.upcoming.length === 0 ? (
                      <p className="text-sm text-gray-400">No upcoming tasks</p>
                    ) : (
                      taskCategories.upcoming.slice(0, 5).map(task => (
                        <div key={task._id} className="p-3 border rounded-lg mb-2">
                          <div className="flex items-start gap-2 mb-1">
                            <CalendarIcon className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                            <span className="font-medium text-sm">{task.title}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500 ml-6">
                            <span>{new Date(task.dueDate).toLocaleDateString()}</span>
                            <Badge variant="outline" className="text-xs">{task.priority}</Badge>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
