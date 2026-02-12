/**
 * Tasks Page
 * Agent task management with automation sync
 * Shows tasks created by automations and manual tasks
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStoredUser } from '../../services/auth';
import { useNotifications } from '../context/NotificationContext';
import {
  Task,
  TaskStats,
  TaskStatus,
  TaskPriority,
  TaskType,
  getMyTasks,
  getAllTasks,
  getUnassignedTasks,
  getTaskStats,
  completeTask,
  startTask,
  assignTask,
  cancelTask,
  TASK_TYPE_LABELS,
  TASK_STATUS_CONFIG,
  TASK_PRIORITY_CONFIG
} from '../../services/tasks';
import { getUsers } from '../../services/agents';

// Icons
import {
  Phone,
  Calendar,
  ClipboardCheck,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Play,
  User,
  Filter,
  RefreshCw,
  ChevronRight,
  FileText,
  MessageSquare,
  UserPlus,
  Target,
  MoreVertical
} from 'lucide-react';

// Task type icons
const TASK_TYPE_ICONS: Record<TaskType, React.ReactNode> = {
  call_lead: <Phone className="w-4 h-4" />,
  confirm_site_visit: <Calendar className="w-4 h-4" />,    confirm_appointment: <Calendar className="w-4 h-4" />,  update_after_visit: <ClipboardCheck className="w-4 h-4" />,
  followup_call: <Phone className="w-4 h-4" />,
  negotiate_deal: <Target className="w-4 h-4" />,
  prepare_docs: <FileText className="w-4 h-4" />,
  manual_action: <ClipboardCheck className="w-4 h-4" />,
  schedule_visit: <Calendar className="w-4 h-4" />,
  send_quote: <MessageSquare className="w-4 h-4" />,
  other: <ClipboardCheck className="w-4 h-4" />
};

interface Agent {
  _id: string;
  name: string;
  email: string;
  role: string;
}

export default function Tasks() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const { showNotification } = useNotifications();
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [unassignedTasks, setUnassignedTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | ''>('');
  const [typeFilter, setTypeFilter] = useState<TaskType | ''>('');
  const [viewMode, setViewMode] = useState<'my' | 'all' | 'unassigned'>('my');
  
  // Modals
  const [completeModalTask, setCompleteModalTask] = useState<Task | null>(null);
  const [assignModalTask, setAssignModalTask] = useState<Task | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionResult, setCompletionResult] = useState<'success' | 'failed' | 'rescheduled' | 'no_answer'>('success');
  const [selectedAgentId, setSelectedAgentId] = useState('');

  const isAdminOrManager = user?.role === 'owner' || user?.role === 'admin' || user?.role === 'manager';

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      
      const filters = {
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        type: typeFilter || undefined
      };

      let fetchedTasks: Task[];
      
      if (viewMode === 'unassigned' && isAdminOrManager) {
        fetchedTasks = await getUnassignedTasks();
      } else if (viewMode === 'all' && isAdminOrManager) {
        fetchedTasks = await getAllTasks(filters);
      } else {
        fetchedTasks = await getMyTasks(filters);
      }

      setTasks(fetchedTasks);
      
      // Fetch stats
      const taskStats = await getTaskStats();
      setStats(taskStats);
      
      // Fetch unassigned count for admin badge
      if (isAdminOrManager) {
        const unassigned = await getUnassignedTasks();
        setUnassignedTasks(unassigned);
      }
      
    } catch (error) {
      console.error('Error fetching tasks:', error);
      showNotification('Failed to load tasks', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, typeFilter, viewMode, isAdminOrManager, showNotification]);

  // Fetch agents for assignment
  const fetchAgents = useCallback(async () => {
    if (!isAdminOrManager) return;
    try {
      const agentList = await getUsers();
      setAgents(agentList.filter((a) => ['agent', 'manager', 'admin'].includes(a.role)));
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  }, [isAdminOrManager]);

  useEffect(() => {
    fetchTasks();
    fetchAgents();
  }, [fetchTasks, fetchAgents]);

  // Refresh handler
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTasks();
    setRefreshing(false);
  };

  // Navigate to task target
  const handleTaskClick = (task: Task) => {
    if (task.redirectUrl) {
      navigate(task.redirectUrl);
    } else if (task.lead?._id) {
      navigate(`/leads/${task.lead._id}`);
    }
  };

  // Start task
  const handleStartTask = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await startTask(task._id);
      showNotification('Task started', 'success');
      fetchTasks();
    } catch (error) {
      showNotification('Failed to start task', 'error');
    }
  };

  // Complete task
  const handleCompleteTask = async () => {
    if (!completeModalTask) return;
    try {
      await completeTask(completeModalTask._id, completionNotes, completionResult);
      showNotification('Task completed', 'success');
      setCompleteModalTask(null);
      setCompletionNotes('');
      setCompletionResult('success');
      fetchTasks();
    } catch (error) {
      showNotification('Failed to complete task', 'error');
    }
  };

  // Assign task
  const handleAssignTask = async () => {
    if (!assignModalTask || !selectedAgentId) return;
    try {
      await assignTask(assignModalTask._id, selectedAgentId);
      showNotification('Task assigned', 'success');
      setAssignModalTask(null);
      setSelectedAgentId('');
      fetchTasks();
    } catch (error) {
      showNotification('Failed to assign task', 'error');
    }
  };

  // Cancel task
  const handleCancelTask = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Cancel this task?')) return;
    try {
      await cancelTask(task._id, 'Cancelled by user');
      showNotification('Task cancelled', 'success');
      fetchTasks();
    } catch (error) {
      showNotification('Failed to cancel task', 'error');
    }
  };

  // Format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  // Render task row
  const renderTask = (task: Task) => {
    const statusConfig = TASK_STATUS_CONFIG[task.status];
    const priorityConfig = TASK_PRIORITY_CONFIG[task.priority];
    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'completed';

    return (
      <div
        key={task._id}
        onClick={() => handleTaskClick(task)}
        className={`bg-white rounded-lg border ${isOverdue ? 'border-red-200' : 'border-gray-200'} 
                   hover:shadow-md transition-shadow cursor-pointer p-4`}
      >
        <div className="flex items-start justify-between">
          {/* Left: Task info */}
          <div className="flex items-start gap-3 flex-1">
            {/* Type icon */}
            <div className={`p-2 rounded-lg ${priorityConfig.bgColor}`}>
              {TASK_TYPE_ICONS[task.type]}
            </div>
            
            {/* Task details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-gray-900 truncate">{task.title}</h3>
                {task.automation && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                    Auto
                  </span>
                )}
              </div>
              
              {/* Lead info */}
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                <User className="w-3 h-3" />
                <span>{task.lead?.name || 'Unknown Lead'}</span>
                {task.lead?.phone && (
                  <>
                    <span className="text-gray-300">•</span>
                    <span>{task.lead.phone}</span>
                  </>
                )}
              </div>
              
              {/* Meta info */}
              <div className="flex items-center gap-3 mt-2">
                <span className={`text-xs px-2 py-0.5 rounded ${statusConfig.bgColor} ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded ${priorityConfig.bgColor} ${priorityConfig.color}`}>
                  {priorityConfig.label}
                </span>
                <span className="text-xs text-gray-500">
                  {TASK_TYPE_LABELS[task.type]}
                </span>
              </div>
            </div>
          </div>
          
          {/* Right: Due date & actions */}
          <div className="flex flex-col items-end gap-2">
            {/* Due date */}
            <div className={`flex items-center gap-1 text-sm ${isOverdue ? 'text-red-600' : 'text-gray-500'}`}>
              <Clock className="w-4 h-4" />
              <span>{formatDate(task.dueDate)}</span>
            </div>
            
            {/* Assignee */}
            {task.assignedTo ? (
              <span className="text-xs text-gray-500">
                {task.assignedTo.name}
              </span>
            ) : (
              <span className="text-xs text-orange-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Unassigned
              </span>
            )}
            
            {/* Actions */}
            <div className="flex items-center gap-1 mt-1">
              {task.status === 'pending' && (
                <button
                  onClick={(e) => handleStartTask(task, e)}
                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                  title="Start Task"
                >
                  <Play className="w-4 h-4" />
                </button>
              )}
              
              {(task.status === 'pending' || task.status === 'in_progress') && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCompleteModalTask(task);
                  }}
                  className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                  title="Complete Task"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              )}
              
              {isAdminOrManager && !task.assignedTo && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setAssignModalTask(task);
                  }}
                  className="p-1.5 text-purple-600 hover:bg-purple-50 rounded"
                  title="Assign Task"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              )}
              
              {task.status !== 'completed' && task.status !== 'cancelled' && (
                <button
                  onClick={(e) => handleCancelTask(task, e)}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                  title="Cancel Task"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
              
              <button className="p-1.5 text-gray-400 hover:bg-gray-50 rounded">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-gray-500 mt-1">
            {isAdminOrManager ? 'Manage team tasks and assignments' : 'Your assigned tasks'}
          </p>
        </div>
        
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
      
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-yellow-700">{stats.pending}</div>
            <div className="text-sm text-yellow-600">Pending</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-700">{stats.in_progress}</div>
            <div className="text-sm text-blue-600">In Progress</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-700">{stats.overdue}</div>
            <div className="text-sm text-red-600">Overdue</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-700">{stats.completed}</div>
            <div className="text-sm text-green-600">Completed</div>
          </div>
          {isAdminOrManager && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="text-2xl font-bold text-orange-700">{stats.unassigned}</div>
              <div className="text-sm text-orange-600">Unassigned</div>
            </div>
          )}
        </div>
      )}
      
      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Filters:</span>
          </div>
          
          {/* View mode (admin only) */}
          {isAdminOrManager && (
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setViewMode('my')}
                className={`px-3 py-1.5 text-sm ${viewMode === 'my' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                My Tasks
              </button>
              <button
                onClick={() => setViewMode('all')}
                className={`px-3 py-1.5 text-sm border-x border-gray-200 ${viewMode === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                All Tasks
              </button>
              <button
                onClick={() => setViewMode('unassigned')}
                className={`px-3 py-1.5 text-sm relative ${viewMode === 'unassigned' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                Unassigned
                {unassignedTasks.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {unassignedTasks.length}
                  </span>
                )}
              </button>
            </div>
          )}
          
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TaskStatus | '')}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="overdue">Overdue</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          
          {/* Priority filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | '')}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">All Priority</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          
          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TaskType | '')}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">All Types</option>
            {Object.entries(TASK_TYPE_LABELS).map(([type, label]) => (
              <option key={type} value={type}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Task List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto" />
            <p className="text-gray-500 mt-2">Loading tasks...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto" />
            <p className="text-gray-500 mt-2">No tasks found</p>
            <p className="text-sm text-gray-400">
              {viewMode === 'unassigned' 
                ? 'All tasks have been assigned' 
                : 'Tasks will appear here when created by automations or manually'}
            </p>
          </div>
        ) : (
          tasks.map(task => renderTask(task))
        )}
      </div>
      
      {/* Complete Task Modal */}
      {completeModalTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md m-4">
            <h2 className="text-lg font-semibold mb-4">Complete Task</h2>
            <p className="text-gray-600 mb-4">{completeModalTask.title}</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Result</label>
                <select
                  value={completionResult}
                  onChange={(e) => setCompletionResult(e.target.value as typeof completionResult)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                >
                  <option value="success">Success</option>
                  <option value="failed">Failed</option>
                  <option value="rescheduled">Rescheduled</option>
                  <option value="no_answer">No Answer</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  rows={3}
                  placeholder="Add any notes about the task completion..."
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setCompleteModalTask(null);
                  setCompletionNotes('');
                  setCompletionResult('success');
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCompleteTask}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Complete Task
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Assign Task Modal */}
      {assignModalTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md m-4">
            <h2 className="text-lg font-semibold mb-4">Assign Task</h2>
            <p className="text-gray-600 mb-4">{assignModalTask.title}</p>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Agent</label>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg"
              >
                <option value="">Choose an agent...</option>
                {agents.map(agent => (
                  <option key={agent._id} value={agent._id}>
                    {agent.name} ({agent.role})
                  </option>
                ))}
              </select>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setAssignModalTask(null);
                  setSelectedAgentId('');
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignTask}
                disabled={!selectedAgentId}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
