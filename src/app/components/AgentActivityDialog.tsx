import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { 
    User, 
    Phone, 
    Mail, 
    Clock, 
    Calendar,
    PhoneCall, 
    CheckCircle, 
    XCircle, 
    MapPin,
    Activity,
    TrendingUp,
    Users,
    FileText,
    Loader2,
    LogIn,
    LogOut,
    Timer,
    Target,
    BarChart3
} from 'lucide-react';

interface AgentActivityData {
    agent: {
        _id: string;
        name: string;
        email: string;
        phone?: string;
        role: string;
        isActive: boolean;
        approvalStatus: string;
        lastLogin?: string;
        createdAt: string;
    };
    leadStats: {
        total: number;
        byStatus: { [key: string]: number };
    };
    activityStats: {
        total: number;
        today: number;
        thisWeek: number;
        thisMonth: number;
        byType: { [key: string]: number };
    };
    callStats: {
        total: number;
        today: number;
        thisWeek: number;
        thisMonth: number;
        totalDuration: number;
        completed: number;
        byStatus: { [key: string]: number };
    };
    siteVisitStats: {
        total: number;
        scheduled: number;
        completed: number;
        cancelled: number;
        noShow: number;
        upcoming: number;
        today: number;
    };
    /** Alias for siteVisitStats */
    appointmentStats?: {
        total: number;
        scheduled: number;
        completed: number;
        cancelled: number;
        noShow: number;
        upcoming: number;
        today: number;
    };
    performance: {
        conversionRate: number;
        avgCallDuration: number;
        callCompletionRate: number;
    };
    loginHistory: Array<{
        loginAt: string;
        logoutAt?: string;
        duration?: number;
        ipAddress?: string;
    }>;
    recentActivities: Array<{
        _id: string;
        type: string;
        title: string;
        description?: string;
        outcome?: string;
        createdAt: string;
        leadId: string;
    }>;
    recentCalls: Array<{
        _id: string;
        leadName?: string;
        to: string;
        status: string;
        duration?: number;
        createdAt: string;
    }>;
    upcomingSiteVisits: Array<{
        _id: string;
        leadName?: string;
        scheduledAt: string;
        propertyId?: string;
    }>;
    /** Alias for upcomingSiteVisits */
    upcomingAppointments?: Array<{
        _id: string;
        leadName?: string;
        scheduledAt: string;
        propertyId?: string;
    }>;
}

interface AgentActivityDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    agentId: string;
    agentName: string;
}

export default function AgentActivityDialog({
    open,
    onOpenChange,
    agentId,
    agentName
}: AgentActivityDialogProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<AgentActivityData | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'activities' | 'calls' | 'visits' | 'logins'>('overview');

    useEffect(() => {
        if (open && agentId) {
            fetchAgentActivity();
        }
    }, [open, agentId]);

    const fetchAgentActivity = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('accessToken');
            const response = await fetch(`http://localhost:4000/api/agents/${agentId}/activity`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch agent activity');
            }

            const result = await response.json();
            setData(result.data);
        } catch (err: any) {
            console.error('Error fetching agent activity:', err);
            setError(err.message || 'Failed to load agent activity');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const formatDateTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    const formatDuration = (seconds: number) => {
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    };

    const formatMinutes = (minutes: number) => {
        if (minutes < 60) return `${minutes} min`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    };

    const getActivityIcon = (type: string) => {
        switch (type) {
            case 'call': return <PhoneCall className="h-4 w-4 text-blue-500" />;
            case 'email': return <Mail className="h-4 w-4 text-purple-500" />;
            case 'meeting': return <Users className="h-4 w-4 text-green-500" />;
            case 'site_visit':
            case 'appointment': return <MapPin className="h-4 w-4 text-orange-500" />;
            case 'note': return <FileText className="h-4 w-4 text-gray-500" />;
            case 'status_change': return <Activity className="h-4 w-4 text-yellow-500" />;
            default: return <Activity className="h-4 w-4 text-gray-400" />;
        }
    };

    const getCallStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'bg-green-100 text-green-700';
            case 'busy': return 'bg-yellow-100 text-yellow-700';
            case 'no-answer': return 'bg-orange-100 text-orange-700';
            case 'failed': return 'bg-red-100 text-red-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    const tabs = [
        { id: 'overview', label: 'Overview', icon: BarChart3 },
        { id: 'activities', label: 'Activities', icon: Activity },
        { id: 'calls', label: 'Calls', icon: PhoneCall },
        { id: 'visits', label: 'Appointments', icon: MapPin },
        { id: 'logins', label: 'Login History', icon: LogIn }
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <User className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                            <div className="text-lg font-semibold">{agentName}</div>
                            <div className="text-sm font-normal text-gray-500">Agent Activity Dashboard</div>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                        <span className="ml-3 text-gray-600">Loading activity data...</span>
                    </div>
                ) : error ? (
                    <div className="flex items-center justify-center py-16">
                        <XCircle className="h-8 w-8 text-red-500 mr-3" />
                        <span className="text-red-600">{error}</span>
                    </div>
                ) : data ? (
                    <div className="flex-1 overflow-hidden flex flex-col">
                        {/* Tabs */}
                        <div className="flex gap-1 border-b border-gray-200 mb-4">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                        activeTab === tab.id
                                            ? 'border-blue-600 text-blue-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    <tab.icon className="h-4 w-4" />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-y-auto">
                            {activeTab === 'overview' && (
                                <div className="space-y-6">
                                    {/* Agent Info */}
                                    <div className="bg-gray-50 rounded-lg p-4">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div className="flex items-center gap-2">
                                                <Mail className="h-4 w-4 text-gray-400" />
                                                <span className="text-sm">{data.agent.email}</span>
                                            </div>
                                            {data.agent.phone && (
                                                <div className="flex items-center gap-2">
                                                    <Phone className="h-4 w-4 text-gray-400" />
                                                    <span className="text-sm">{data.agent.phone}</span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2">
                                                <Clock className="h-4 w-4 text-gray-400" />
                                                <span className="text-sm">
                                                    Last login: {data.agent.lastLogin ? formatDateTime(data.agent.lastLogin) : 'Never'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-4 w-4 text-gray-400" />
                                                <span className="text-sm">Joined: {formatDate(data.agent.createdAt)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Performance Stats */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Target className="h-5 w-5 text-green-600" />
                                                <span className="text-sm text-gray-500">Conversion Rate</span>
                                            </div>
                                            <div className="text-2xl font-bold text-green-600">
                                                {data.performance.conversionRate}%
                                            </div>
                                        </div>
                                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Timer className="h-5 w-5 text-blue-600" />
                                                <span className="text-sm text-gray-500">Avg Call Duration</span>
                                            </div>
                                            <div className="text-2xl font-bold text-blue-600">
                                                {formatDuration(data.performance.avgCallDuration)}
                                            </div>
                                        </div>
                                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <PhoneCall className="h-5 w-5 text-purple-600" />
                                                <span className="text-sm text-gray-500">Call Completion</span>
                                            </div>
                                            <div className="text-2xl font-bold text-purple-600">
                                                {data.performance.callCompletionRate}%
                                            </div>
                                        </div>
                                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Users className="h-5 w-5 text-orange-600" />
                                                <span className="text-sm text-gray-500">Total Leads</span>
                                            </div>
                                            <div className="text-2xl font-bold text-orange-600">
                                                {data.leadStats.total}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Activity Summary */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Calls Summary */}
                                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                                            <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                                <PhoneCall className="h-4 w-4 text-blue-600" />
                                                Calls
                                            </h4>
                                            <div className="space-y-2 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500">Today</span>
                                                    <span className="font-medium">{data.callStats.today}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500">This Week</span>
                                                    <span className="font-medium">{data.callStats.thisWeek}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500">This Month</span>
                                                    <span className="font-medium">{data.callStats.thisMonth}</span>
                                                </div>
                                                <div className="flex justify-between border-t pt-2">
                                                    <span className="text-gray-500">Total</span>
                                                    <span className="font-bold">{data.callStats.total}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Activities Summary */}
                                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                                            <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                                <Activity className="h-4 w-4 text-green-600" />
                                                Activities
                                            </h4>
                                            <div className="space-y-2 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500">Today</span>
                                                    <span className="font-medium">{data.activityStats.today}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500">This Week</span>
                                                    <span className="font-medium">{data.activityStats.thisWeek}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500">This Month</span>
                                                    <span className="font-medium">{data.activityStats.thisMonth}</span>
                                                </div>
                                                <div className="flex justify-between border-t pt-2">
                                                    <span className="text-gray-500">Total</span>
                                                    <span className="font-bold">{data.activityStats.total}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Appointments Summary */}
                                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                                            <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                                <MapPin className="h-4 w-4 text-orange-600" />
                                                Appointments
                                            </h4>
                                            <div className="space-y-2 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500">Today</span>
                                                    <span className="font-medium">{data.siteVisitStats.today}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500">Upcoming</span>
                                                    <span className="font-medium text-blue-600">{data.siteVisitStats.upcoming}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500">Completed</span>
                                                    <span className="font-medium text-green-600">{data.siteVisitStats.completed}</span>
                                                </div>
                                                <div className="flex justify-between border-t pt-2">
                                                    <span className="text-gray-500">Total</span>
                                                    <span className="font-bold">{data.siteVisitStats.total}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Lead Status Breakdown */}
                                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                                        <h4 className="font-semibold text-gray-900 mb-3">Lead Status Breakdown</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {Object.entries(data.leadStats.byStatus).map(([status, count]) => (
                                                <span 
                                                    key={status}
                                                    className="px-3 py-1 bg-gray-100 rounded-full text-sm"
                                                >
                                                    {status}: <span className="font-semibold">{count}</span>
                                                </span>
                                            ))}
                                            {Object.keys(data.leadStats.byStatus).length === 0 && (
                                                <span className="text-gray-500 text-sm">No leads assigned</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'activities' && (
                                <div className="space-y-3">
                                    <h4 className="font-semibold text-gray-900">Recent Activities</h4>
                                    {data.recentActivities.length > 0 ? (
                                        data.recentActivities.map(activity => (
                                            <div key={activity._id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-start gap-3">
                                                {getActivityIcon(activity.type)}
                                                <div className="flex-1">
                                                    <div className="font-medium text-sm">{activity.title}</div>
                                                    {activity.description && (
                                                        <div className="text-xs text-gray-500 mt-1">{activity.description}</div>
                                                    )}
                                                    <div className="text-xs text-gray-400 mt-1">
                                                        {formatDateTime(activity.createdAt)}
                                                    </div>
                                                </div>
                                                {activity.outcome && (
                                                    <span className={`text-xs px-2 py-1 rounded ${
                                                        activity.outcome === 'positive' ? 'bg-green-100 text-green-700' :
                                                        activity.outcome === 'negative' ? 'bg-red-100 text-red-700' :
                                                        'bg-gray-100 text-gray-700'
                                                    }`}>
                                                        {activity.outcome}
                                                    </span>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-gray-500">
                                            <Activity className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                                            No activities recorded
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'calls' && (
                                <div className="space-y-3">
                                    <h4 className="font-semibold text-gray-900">Recent Calls</h4>
                                    {data.recentCalls.length > 0 ? (
                                        data.recentCalls.map(call => (
                                            <div key={call._id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3">
                                                <PhoneCall className="h-5 w-5 text-blue-500" />
                                                <div className="flex-1">
                                                    <div className="font-medium text-sm">{call.leadName || call.to}</div>
                                                    <div className="text-xs text-gray-500">
                                                        {formatDateTime(call.createdAt)}
                                                        {call.duration && call.duration > 0 && (
                                                            <span className="ml-2">• {formatDuration(call.duration)}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className={`text-xs px-2 py-1 rounded ${getCallStatusColor(call.status)}`}>
                                                    {call.status}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-gray-500">
                                            <PhoneCall className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                                            No calls recorded
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'visits' && (
                                <div className="space-y-4">
                                    <div>
                                        <h4 className="font-semibold text-gray-900 mb-3">Upcoming Appointments</h4>
                                        {(data.upcomingSiteVisits || data.upcomingAppointments || []).length > 0 ? (
                                            <div className="space-y-2">
                                                {(data.upcomingSiteVisits || data.upcomingAppointments || []).map(visit => (
                                                    <div key={visit._id} className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
                                                        <Calendar className="h-5 w-5 text-blue-500" />
                                                        <div className="flex-1">
                                                            <div className="font-medium text-sm">{visit.leadName || 'Lead'}</div>
                                                            <div className="text-xs text-blue-600">
                                                                {formatDateTime(visit.scheduledAt)}
                                                            </div>
                                                        </div>
                                                        <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">
                                                            Scheduled
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-4 text-gray-500 bg-gray-50 rounded-lg">
                                                No upcoming visits
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-4 gap-4">
                                        <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                                            <div className="text-2xl font-bold text-gray-900">{data.siteVisitStats.total}</div>
                                            <div className="text-xs text-gray-500">Total</div>
                                        </div>
                                        <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                                            <div className="text-2xl font-bold text-green-600">{data.siteVisitStats.completed}</div>
                                            <div className="text-xs text-gray-500">Completed</div>
                                        </div>
                                        <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                                            <div className="text-2xl font-bold text-red-600">{data.siteVisitStats.cancelled}</div>
                                            <div className="text-xs text-gray-500">Cancelled</div>
                                        </div>
                                        <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                                            <div className="text-2xl font-bold text-orange-600">{data.siteVisitStats.noShow}</div>
                                            <div className="text-xs text-gray-500">No Show</div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'logins' && (
                                <div className="space-y-3">
                                    <h4 className="font-semibold text-gray-900">Login History</h4>
                                    {data.loginHistory.length > 0 ? (
                                        data.loginHistory.map((login, index) => (
                                            <div key={index} className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3">
                                                <LogIn className="h-5 w-5 text-green-500" />
                                                <div className="flex-1">
                                                    <div className="font-medium text-sm">
                                                        Logged in: {formatDateTime(login.loginAt)}
                                                    </div>
                                                    {login.logoutAt ? (
                                                        <div className="text-xs text-gray-500 flex items-center gap-2">
                                                            <LogOut className="h-3 w-3" />
                                                            Logged out: {formatDateTime(login.logoutAt)}
                                                            {login.duration && (
                                                                <span className="ml-2 text-blue-600">
                                                                    • Session: {formatMinutes(login.duration)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-green-600 flex items-center gap-1">
                                                            <CheckCircle className="h-3 w-3" />
                                                            Currently active
                                                        </div>
                                                    )}
                                                    {login.ipAddress && login.ipAddress !== 'unknown' && (
                                                        <div className="text-xs text-gray-400 mt-1">
                                                            IP: {login.ipAddress}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-gray-500">
                                            <LogIn className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                                            No login history available
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
