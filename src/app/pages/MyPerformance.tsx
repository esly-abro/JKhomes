import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  Users, TrendingUp, DollarSign, Target, Phone, Mail,
  CheckCircle2, Clock, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Loader2, AlertCircle, PhoneOutgoing, PhoneIncoming, Timer, Activity
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  getMyPerformance,
  type AgentPerformanceData
} from '../../services/analytics';
import { useTenantConfig } from '../context/TenantConfigContext';
import { useToast } from '../context/ToastContext';
import { parseApiError } from '../lib/parseApiError';

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#f97316', '#84cc16'];

const ACTIVITY_COLORS: Record<string, string> = {
  call: '#3b82f6',
  email: '#8b5cf6',
  meeting: '#ec4899',
  site_visit: '#f59e0b',
  appointment: '#10b981',
  whatsapp: '#22c55e',
  sms: '#06b6d4',
  note: '#94a3b8',
  task: '#f97316',
  task_created: '#f97316',
  status_change: '#a855f7',
  assignment: '#64748b',
  automation: '#0ea5e9'
};

export default function MyPerformance() {
  const [dateRange, setDateRange] = useState('30days');
  const [data, setData] = useState<AgentPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getStatusLabel, getStatusColor } = useTenantConfig();
  const { addToast } = useToast();

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getMyPerformance(dateRange);
      setData(result);
    } catch (err: any) {
      addToast(parseApiError(err).message, 'error');
      setError(err.message || 'Failed to load performance data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-500">Loading your performance data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-gray-600">{error}</p>
        <Button onClick={fetchData} variant="outline">Retry</Button>
      </div>
    );
  }

  if (!data) return null;

  const { kpis, activityBreakdown, leadPipeline, taskStats, callStats, dailyActivity, recentActivity } = data;

  const changeColor = (val: string) => {
    const num = parseFloat(val);
    if (num > 0) return 'text-green-600';
    if (num < 0) return 'text-red-600';
    return 'text-gray-500';
  };

  const ChangeIcon = ({ value }: { value: string }) => {
    const num = parseFloat(value);
    if (num > 0) return <ArrowUpRight className="h-3 w-3" />;
    if (num < 0) return <ArrowDownRight className="h-3 w-3" />;
    return null;
  };

  // Format pipeline data with tenant status labels
  const pipelineData = leadPipeline.map(p => ({
    ...p,
    label: getStatusLabel ? getStatusLabel(p.status) : p.status,
    fill: getStatusColor ? getStatusColor(p.status) : '#3b82f6'
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Performance</h1>
          <p className="text-sm text-gray-500 mt-1">Track your personal metrics, activities, and progress</p>
        </div>
        <div className="flex items-center gap-2">
          {['7days', '30days', '90days'].map(r => (
            <Button
              key={r}
              variant={dateRange === r ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateRange(r)}
            >
              {r === '7days' ? '7 Days' : r === '30days' ? '30 Days' : '90 Days'}
            </Button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">My Leads</p>
                <p className="text-2xl font-bold mt-1">{kpis.totalLeads}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <p className={`text-xs mt-2 flex items-center gap-1 ${changeColor(kpis.totalLeadsChange)}`}>
              <ChangeIcon value={kpis.totalLeadsChange} /> {kpis.totalLeadsChange} vs previous
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Deals Won</p>
                <p className="text-2xl font-bold mt-1">{kpis.dealsWon}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-50 flex items-center justify-center">
                <Target className="h-5 w-5 text-green-600" />
              </div>
            </div>
            <p className={`text-xs mt-2 flex items-center gap-1 ${changeColor(kpis.dealsWonChange)}`}>
              <ChangeIcon value={kpis.dealsWonChange} /> {kpis.dealsWonChange} vs previous
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Conversion</p>
                <p className="text-2xl font-bold mt-1">{kpis.conversionRate}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-purple-50 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
            </div>
            <p className="text-xs mt-2 text-gray-500">Overall conversion rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Revenue</p>
                <p className="text-2xl font-bold mt-1">
                  {kpis.revenue > 0
                    ? kpis.revenue >= 100000
                      ? `₹${(kpis.revenue / 100000).toFixed(1)}L`
                      : `₹${kpis.revenue.toLocaleString()}`
                    : '₹0'}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-amber-50 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-amber-600" />
              </div>
            </div>
            <p className="text-xs mt-2 text-gray-500">From closed deals</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Avg Response</p>
                <p className="text-2xl font-bold mt-1">{kpis.avgResponseTime}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-cyan-50 flex items-center justify-center">
                <Timer className="h-5 w-5 text-cyan-600" />
              </div>
            </div>
            <p className="text-xs mt-2 text-gray-500">First response time</p>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Activity Trend + Activity Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Activity Trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Activity Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyActivity.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dailyActivity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(val) => {
                      const d = new Date(val);
                      return `${d.getDate()}/${d.getMonth() + 1}`;
                    }}
                  />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    labelFormatter={(val) => new Date(val).toLocaleDateString()}
                    formatter={(value: number) => [value, 'Activities']}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-60 text-gray-400">
                No activity data for this period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Breakdown Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Activity Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {activityBreakdown.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={activityBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      dataKey="count"
                      nameKey="label"
                      paddingAngle={2}
                    >
                      {activityBreakdown.map((entry, idx) => (
                        <Cell key={idx} fill={ACTIVITY_COLORS[entry.type] || COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number, name: string) => [value, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                  {activityBreakdown.slice(0, 6).map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-xs">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: ACTIVITY_COLORS[item.type] || COLORS[idx % COLORS.length] }}
                      />
                      <span className="text-gray-600">{item.label}</span>
                      <span className="font-medium">{item.count}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-60 text-gray-400">
                No activities yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Lead Pipeline + Task Stats + Call Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead Pipeline */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">My Lead Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineData.length > 0 ? (
              <div className="space-y-3">
                {pipelineData.map((item, idx) => {
                  const maxCount = Math.max(...pipelineData.map(p => p.count));
                  const pct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                  return (
                    <div key={idx}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-gray-600 truncate">{item.label}</span>
                        <span className="text-xs font-semibold">{item.count}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: item.fill || COLORS[idx % COLORS.length]
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                No leads assigned yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Task Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Task Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-600" />
                <div>
                  <p className="text-lg font-bold">{taskStats.pending}</p>
                  <p className="text-xs text-gray-500">Pending</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <Activity className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-lg font-bold">{taskStats.inProgress}</p>
                  <p className="text-xs text-gray-500">In Progress</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-lg font-bold">{taskStats.completed}</p>
                  <p className="text-xs text-gray-500">Completed</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <div>
                  <p className="text-lg font-bold">{taskStats.overdue}</p>
                  <p className="text-xs text-gray-500">Overdue</p>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t flex items-center justify-between">
              <span className="text-xs text-gray-500">Completion Rate</span>
              <span className="text-sm font-bold text-green-600">{taskStats.completionRate}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-gray-500">Completed This Period</span>
              <span className="text-sm font-semibold">{taskStats.recentCompleted}</span>
            </div>
          </CardContent>
        </Card>

        {/* Call Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Call Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center mb-4">
              <p className="text-3xl font-bold text-blue-600">{callStats.totalCalls}</p>
              <p className="text-xs text-gray-500">Total Calls</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg">
                <PhoneOutgoing className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-sm font-semibold">{callStats.outbound}</p>
                  <p className="text-[10px] text-gray-500">Outbound</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg">
                <PhoneIncoming className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-sm font-semibold">{callStats.inbound}</p>
                  <p className="text-[10px] text-gray-500">Inbound</p>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Total Duration</span>
                <span className="text-sm font-semibold">{callStats.totalDuration}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Avg Duration</span>
                <span className="text-sm font-semibold">{callStats.avgDuration}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Recent Activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length > 0 ? (
            <div className="divide-y">
              {recentActivity.map((item) => (
                <div key={item.id} className="flex items-start gap-3 py-3">
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: (ACTIVITY_COLORS[item.type] || '#94a3b8') + '20' }}
                  >
                    {item.type === 'call' ? (
                      <Phone className="h-4 w-4" style={{ color: ACTIVITY_COLORS[item.type] }} />
                    ) : item.type === 'email' ? (
                      <Mail className="h-4 w-4" style={{ color: ACTIVITY_COLORS[item.type] }} />
                    ) : (
                      <Activity className="h-4 w-4" style={{ color: ACTIVITY_COLORS[item.type] || '#94a3b8' }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                    {item.description && (
                      <p className="text-xs text-gray-500 truncate">{item.description}</p>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                    {formatRelativeTime(item.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
              No recent activity
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
