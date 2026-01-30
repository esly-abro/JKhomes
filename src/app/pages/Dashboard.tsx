import { useMemo, useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Users, TrendingUp, DollarSign, Target, ArrowUpRight, ArrowDownRight, Phone, Mail, Calendar, Clock, CheckCircle2, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getUsers } from '../../services/leads';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, FunnelChart, Funnel, LabelList, Legend } from 'recharts';

export default function Dashboard() {
  const { leads, activities, siteVisits } = useData();

  const stats = [
    {
      title: 'Total Leads',
      value: leads.length,
      change: '+12%',
      trend: 'up',
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      title: 'Active Leads',
      value: leads.filter(l => ['New', 'Call Attended', 'Interested', 'Site Visit Scheduled'].includes(l.status)).length,
      change: '+8%',
      trend: 'up',
      icon: TrendingUp,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      title: 'Conversion Rate',
      value: useMemo(() => {
        const closedStatuses = ['Deal Closed', 'Closed', 'Won'];
        const closed = leads.filter(l => closedStatuses.includes(l.status)).length;
        return leads.length > 0 ? `${((closed / leads.length) * 100).toFixed(1)}%` : '0.0%';
      }, [leads]),
      change: '+0%', // TODO: Calculate from historical data
      trend: 'up',
      icon: Target,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50'
    },
    {
      title: 'Pipeline Value',
      value: `$${(leads.reduce((sum, lead) => sum + lead.value, 0) / 1000).toFixed(0)}K`,
      change: '+15%',
      trend: 'up',
      icon: DollarSign,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50'
    },
  ];

  const funnelData = [
    { name: 'New', value: leads.filter(l => l.status === 'New').length, fill: '#3b82f6' },
    { name: 'Attended', value: leads.filter(l => l.status === 'Call Attended').length, fill: '#8b5cf6' },
    { name: 'Interested', value: leads.filter(l => l.status === 'Interested').length, fill: '#10b981' },
    { name: 'Visit Scheduled', value: leads.filter(l => l.status === 'Site Visit Scheduled').length, fill: '#f59e0b' },
    { name: 'Visit Booked', value: leads.filter(l => l.status === 'Site Visit Booked').length, fill: '#ec4899' },
    { name: 'No Response', value: leads.filter(l => l.status === 'No Response').length, fill: '#6b7280' },
    { name: 'Not Interested', value: leads.filter(l => l.status === 'Not Interested').length, fill: '#ef4444' },
  ];

  const sourceData = [
    { name: 'Website', value: leads.filter(l => l.source === 'Website').length, color: '#3b82f6' },
    { name: 'LinkedIn', value: leads.filter(l => l.source === 'LinkedIn Ads').length, color: '#8b5cf6' },
    { name: 'Referral', value: leads.filter(l => l.source === 'Referral').length, color: '#ec4899' },
    { name: 'Google Ads', value: leads.filter(l => l.source === 'Google Ads').length, color: '#f59e0b' },
    { name: 'Conference', value: leads.filter(l => l.source === 'Conference').length, color: '#10b981' },
  ];

  // Leads needing attention - smarter criteria
  const leadsNeedingAttention = useMemo(() => {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    return leads
      .map(lead => {
        const leadData = lead as any;
        const hasAssignment = !!leadData.assignedToName ||
          (typeof lead.owner === 'object' && lead.owner?.name);
        const lastActivityDate = lead.lastActivity ? new Date(lead.lastActivity) : null;
        const createdDate = lead.createdAt ? new Date(lead.createdAt) : null;

        let reason = '';
        let priority = 'medium';

        // New lead with status "New" 
        if (lead.status === 'New') {
          reason = 'New lead - needs first contact';
          priority = 'high';
        }
        // Unassigned lead
        else if (!hasAssignment) {
          reason = 'Unassigned - needs agent';
          priority = 'high';
        }
        // No recent activity (stale)
        else if (lastActivityDate && lastActivityDate < threeDaysAgo) {
          reason = 'No activity in 3+ days';
          priority = 'medium';
        }
        // Interested but no site visit scheduled
        else if (lead.status === 'Interested' || lead.status === 'Call Attended') {
          reason = 'Hot lead - schedule follow-up';
          priority = 'high';
        }

        return reason ? { ...lead, reason, attentionPriority: priority } : null;
      })
      .filter(Boolean)
      .sort((a, b) => {
        // Sort by priority (high first)
        if (a!.attentionPriority === 'high' && b!.attentionPriority !== 'high') return -1;
        if (b!.attentionPriority === 'high' && a!.attentionPriority !== 'high') return 1;
        return 0;
      })
      .slice(0, 5) as (typeof leads[0] & { reason: string; attentionPriority: string })[];
  }, [leads]);

  // State for agents from database
  const [agents, setAgents] = useState<Array<{ _id: string; name: string; email: string; role: string }>>([]);

  // Fetch agents from database
  useEffect(() => {
    async function fetchAgents() {
      try {
        const data = await getUsers();
        // Filter to only show agents and BPOs
        const agentUsers = data.filter((u: any) => u.role === 'agent' || u.role === 'bpo');
        setAgents(agentUsers);
      } catch (error) {
        console.error('Failed to fetch agents:', error);
      }
    }
    fetchAgents();
  }, []);

  // Calculate team performance from database agents
  const teamPerformance = useMemo(() => {
    const closedStatuses = ['Deal Closed', 'Closed', 'Won'];
    const activeStatuses = ['New', 'Call Attended', 'Interested', 'Site Visit Scheduled', 'Site Visit Booked'];

    return agents.map(agent => {
      const agentLeads = leads.filter(lead => {
        const owner = lead.owner as any;
        const ownerId = typeof owner === 'string' ? owner : owner?._id || owner?.id;
        return ownerId === agent._id;
      });

      const active = agentLeads.filter(l => activeStatuses.includes(l.status)).length;
      const closed = agentLeads.filter(l => closedStatuses.includes(l.status)).length;
      const total = agentLeads.length;

      return {
        id: agent._id,
        name: agent.name || agent.email,
        email: agent.email,
        role: agent.role,
        active,
        closed,
        total
      };
    });
  }, [agents, leads]);

  // Filter activities for today
  const todaysActivities = useMemo(() => {
    const today = new Date();
    const todayStr = today.toDateString();

    return activities.filter(activity => {
      const activityTime = activity.scheduledAt || activity.createdAt || activity.timestamp;
      if (!activityTime) return false;
      const activityDate = new Date(activityTime);
      const isToday = activityDate.toDateString() === todayStr;
      const isStatusUpdate = activity.description?.startsWith('Status Updated') || activity.type === 'note' || activity.type === 'status'; // generic/status types
      const isRelevant = activity.type === 'meeting' || activity.description?.toLowerCase().includes('site visit');

      return isToday && !isStatusUpdate && isRelevant;
    });
  }, [activities]);

  // Upcoming meetings from site visits - next 7 days
  const upcomingMeetings = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    return siteVisits
      .filter(visit => {
        const visitDate = new Date(visit.scheduledAt);
        return visitDate >= today && visitDate <= nextWeek;
      })
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
      .slice(0, 10); // Limit to 10 upcoming meetings
  }, [siteVisits]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Welcome back! Here's what's happening with your leads today.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Main Content Area - Spans 3 columns on large screens */}
        <div className="xl:col-span-3 space-y-6">

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card key={stat.title}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">{stat.title}</p>
                        <h3 className="text-3xl font-bold text-gray-900">{stat.value}</h3>
                        <div className="flex items-center gap-1 mt-2">
                          {stat.trend === 'up' ? (
                            <ArrowUpRight className="h-4 w-4 text-green-600" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4 text-red-600" />
                          )}
                          <span className={`text-sm ${stat.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                            {stat.change}
                          </span>
                          <span className="text-sm text-gray-500">from last month</span>
                        </div>
                      </div>
                      <div className={`${stat.bgColor} ${stat.color} p-3 rounded-lg`}>
                        <Icon className="h-6 w-6" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Funnel Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Sales Funnel</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={funnelData} margin={{ bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      angle={-45}
                      textAnchor="end"
                      interval={0}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value">
                      {funnelData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Lead Sources Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Lead Sources</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={sourceData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label
                    >
                      {sourceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Tables Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Leads Needing Attention */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Leads Needing Attention</CardTitle>
                <Button variant="ghost" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" />
                  Filter
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {leadsNeedingAttention.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-300" />
                      <p className="font-medium">All caught up!</p>
                      <p className="text-sm">No leads need immediate attention</p>
                    </div>
                  ) : (
                    leadsNeedingAttention.map((lead) => (
                      <Link key={lead.id} to={`/leads/${lead.id}`} className="block">
                        <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 hover:border-blue-300 transition-colors cursor-pointer">
                          <div>
                            <div className="font-semibold">{lead.name}</div>
                            <div className="text-sm text-gray-600">{lead.phone || lead.email}</div>
                            <div className="flex gap-2 mt-2 flex-wrap">
                              <span className={`px-2 py-1 text-xs rounded-full ${lead.attentionPriority === 'high'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-yellow-100 text-yellow-700'
                                }`}>
                                {lead.reason}
                              </span>
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                                {lead.status}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-gray-500">
                              {lead.lastActivity
                                ? new Date(lead.lastActivity).toLocaleDateString()
                                : 'No activity'}
                            </div>
                            <div className="flex gap-1 mt-2 justify-end">
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Phone className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Calendar className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Team Performance */}
            <Card>
              <CardHeader>
                <CardTitle>Team Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {teamPerformance.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">No agents found</div>
                  ) : (
                    teamPerformance.map((member) => (
                      <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-semibold text-blue-600">
                            {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold">{member.name}</div>
                            <div className="text-sm text-gray-600 capitalize">{member.role}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-blue-600">Total: {member.total}</div>
                          <div className="text-sm text-gray-600">Active: {member.active}</div>
                          <div className="text-sm text-green-600">Closed: {member.closed}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right Sidebar - Upcoming Meetings */}
        <div className="xl:col-span-1">
          <Card className="h-full border-l-4 border-l-blue-600 shadow-md flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2 shrink-0">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-xl">Upcoming Meetings</CardTitle>
              </div>
              <Link to="/calendar">
                <Button variant="ghost" size="sm">View All</Button>
              </Link>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto custom-scrollbar">
              {upcomingMeetings.length > 0 ? (
                <div className="space-y-4">
                  {upcomingMeetings.map((meeting) => (
                    <Link
                      key={meeting._id}
                      to={`/leads/${meeting.leadId}`}
                      className="gap-3 flex flex-col p-3 hover:bg-slate-50 rounded-md transition-colors border border-gray-100 hover:border-blue-300 shadow-sm cursor-pointer block"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-wide">
                            Site Visit
                          </span>
                        </div>
                        <span className="text-xs text-gray-500 font-medium">
                          {new Date(meeting.scheduledAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 leading-tight mb-1">{meeting.leadName}</p>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="h-3 w-3" />
                          <span>{new Date(meeting.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-gray-50 mt-1">
                        <div className="flex items-center gap-1 text-[10px] text-gray-400">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>{meeting.status}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500 flex flex-col items-center justify-center h-full">
                  <Calendar className="h-12 w-12 mb-3 text-gray-300" />
                  <p>No upcoming meetings in the next 7 days.</p>
                  <Link to="/calendar">
                    <Button variant="link" className="mt-2 text-blue-600">Schedule a meeting</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
