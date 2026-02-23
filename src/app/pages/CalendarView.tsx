import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ChevronLeft, ChevronRight, Plus, MapPin, Phone, Mail, Calendar, X, Loader2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { useTenantConfig } from '../context/TenantConfigContext';
import { parseApiError } from '../lib/parseApiError';
import { createCalendarEvent, type CreateEventPayload } from '../../services/calendar';

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  color: string;
  type: 'site_visit' | 'appointment' | 'call' | 'meeting' | 'email' | 'other';
  leadName?: string;
  leadId?: string;
}

export default function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'day' | 'week' | 'month'>('month');
  const { siteVisits = [], activities = [], leads = [] } = useData();
  const { appointmentFieldLabel } = useTenantConfig();
  const { addToast } = useToast();
  const navigate = useNavigate();

  // Add Event Dialog state
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [addingEvent, setAddingEvent] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: '',
    type: 'meeting' as CreateEventPayload['type'],
    startDate: new Date().toISOString().slice(0, 16),
    endDate: '',
    description: '',
    leadId: '',
    location: '',
  });

  // Event detail dialog
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const handleAddEvent = async () => {
    if (!eventForm.title || !eventForm.startDate) return;
    setAddingEvent(true);
    try {
      await createCalendarEvent({
        title: eventForm.title,
        type: eventForm.type,
        startDate: new Date(eventForm.startDate).toISOString(),
        endDate: eventForm.endDate ? new Date(eventForm.endDate).toISOString() : new Date(new Date(eventForm.startDate).getTime() + 3600000).toISOString(),
        description: eventForm.description,
        leadId: eventForm.leadId || undefined,
        location: eventForm.location || undefined,
      });
      addToast('Event created!', 'success');
      // Refresh data context
      window.location.reload();
    } catch (err) {
      addToast(parseApiError(err).message, 'error');
    } finally {
      setAddingEvent(false);
    }
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  // Combine site visits and activities into calendar events
  const events: CalendarEvent[] = useMemo(() => {
    const allEvents: CalendarEvent[] = [];

    // Add site visits as events (with null checks)
    if (Array.isArray(siteVisits)) {
      siteVisits.forEach((visit) => {
        if (!visit?.scheduledAt) return;
        const visitDate = new Date(visit.scheduledAt);
        allEvents.push({
          id: visit._id || String(Math.random()),
          title: `${appointmentFieldLabel}: ${visit.leadName || 'Client'}`,
          date: visitDate.toISOString().split('T')[0],
          time: visitDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          color: 'bg-orange-500',
          type: 'appointment',
          leadName: visit.leadName
        });
      });
    }

    // Add activities with scheduled dates as events (with null checks)
    if (Array.isArray(activities)) {
      activities.forEach((activity) => {
        // Use scheduledAt if available, otherwise createdAt, then timestamp
        const activityTime = activity?.scheduledAt || activity?.createdAt || activity?.timestamp;
        if (!activityTime) return;
        if (activity.type === 'site_visit' || activity.type === 'appointment' || activity.type === 'meeting' || activity.type === 'call') {
          const activityDate = new Date(activityTime);
          const colorMap: Record<string, string> = {
            'site_visit': 'bg-orange-500',
            'appointment': 'bg-orange-500',
            'meeting': 'bg-purple-500',
            'call': 'bg-green-500',
            'email': 'bg-blue-500'
          };
          allEvents.push({
            id: activity._id || activity.id,
            title: activity.title || activity.description,
            date: activityDate.toISOString().split('T')[0],
            time: activityDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            color: colorMap[activity.type] || 'bg-gray-500',
            type: activity.type as CalendarEvent['type'],
            leadName: activity.userName
          });
        }
      });
    }

    // Sort by date
    return allEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [siteVisits, activities]);

  // Get upcoming events (from today onwards)
  const upcomingEvents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return events.filter(event => new Date(event.date) >= today).slice(0, 10);
  }, [events]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  // Get events for a specific day
  const getEventsForDay = (day: number) => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter(event => event.date === dateStr);
  };

  // Get event icon based on type
  const getEventIcon = (type: string) => {
    switch (type) {
      case 'site_visit':
      case 'appointment': return <MapPin className="h-3 w-3" />;
      case 'call': return <Phone className="h-3 w-3" />;
      case 'email': return <Mail className="h-3 w-3" />;
      case 'meeting': return <Calendar className="h-3 w-3" />;
      default: return null;
    }
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Calendar</h1>
          <p className="text-gray-600">Manage your meetings and events</p>
        </div>
        <Button onClick={() => setShowAddEvent(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Event
        </Button>
      </div>

      <Card className="p-6">
        {/* Calendar Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={previousMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" onClick={() => setCurrentDate(new Date())}>
              Today
            </Button>
          </div>

          <div className="flex gap-2">
            {(['day', 'week', 'month'] as const).map((v) => (
              <Button
                key={v}
                variant={view === v ? 'default' : 'outline'}
                onClick={() => setView(v)}
                className="capitalize"
              >
                {v}
              </Button>
            ))}
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200">
          {/* Day headers */}
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="bg-gray-50 p-2 text-center font-semibold text-sm text-gray-600">
              {day}
            </div>
          ))}
          
          {/* Days */}
          {getDaysInMonth(currentDate).map((day, index) => {
            const dayEvents = day ? getEventsForDay(day) : [];
            const isToday = day === new Date().getDate() &&
              currentDate.getMonth() === new Date().getMonth() &&
              currentDate.getFullYear() === new Date().getFullYear();
            
            return (
              <div
                key={index}
                className={`bg-white min-h-[100px] p-2 ${
                  !day ? 'bg-gray-50' : ''
                } ${isToday ? 'bg-blue-50 ring-2 ring-blue-500 ring-inset' : ''}`}
              >
                {day && (
                  <>
                    <div className={`font-semibold text-sm mb-1 ${isToday ? 'text-blue-600' : ''}`}>
                      {day}
                    </div>
                    {/* Show events for this day */}
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((event) => (
                        <div
                          key={event.id}
                          className={`text-xs px-1 py-0.5 rounded truncate text-white flex items-center gap-1 ${event.color}`}
                          title={`${event.title} at ${event.time}`}
                        >
                          {getEventIcon(event.type)}
                          <span className="truncate">{event.title}</span>
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-xs text-gray-500 pl-1">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Upcoming Events */}
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-4">Upcoming Events</h3>
        {upcomingEvents.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-400" />
            <p>No upcoming events</p>
            <p className="text-sm">{appointmentFieldLabel}s and activities will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingEvents.map((event) => (
              <div key={event.id} className="flex items-center gap-4 p-3 border rounded-lg hover:bg-gray-50">
                <div className={`w-1 h-12 ${event.color} rounded-full`}></div>
                <div className={`p-2 rounded-full ${event.color} bg-opacity-20`}>
                  {getEventIcon(event.type)}
                </div>
                <div className="flex-1">
                  <div className="font-semibold">{event.title}</div>
                  <div className="text-sm text-gray-600">
                    {new Date(event.date).toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      month: 'short', 
                      day: 'numeric' 
                    })} at {event.time}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedEvent(event)}>View</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add Event Dialog */}
      {showAddEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddEvent(false)}>
          <Card className="w-full max-w-lg p-6 m-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Add New Event</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowAddEvent(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4">
              <div>
                <Label>Title *</Label>
                <Input
                  value={eventForm.title}
                  onChange={(e) => setEventForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Event title"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={eventForm.type}
                    onChange={(e) => setEventForm(f => ({ ...f, type: e.target.value as CreateEventPayload['type'] }))}
                  >
                    <option value="meeting">Meeting</option>
                    <option value="call">Call</option>
                    <option value="site_visit">Site Visit</option>
                    <option value="follow_up">Follow Up</option>
                  </select>
                </div>
                <div>
                  <Label>Lead (optional)</Label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={eventForm.leadId}
                    onChange={(e) => setEventForm(f => ({ ...f, leadId: e.target.value }))}
                  >
                    <option value="">None</option>
                    {leads.map(l => (
                      <option key={l.id || l._id} value={l.id || l._id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start *</Label>
                  <Input
                    type="datetime-local"
                    value={eventForm.startDate}
                    onChange={(e) => setEventForm(f => ({ ...f, startDate: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>End</Label>
                  <Input
                    type="datetime-local"
                    value={eventForm.endDate}
                    onChange={(e) => setEventForm(f => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label>Location</Label>
                <Input
                  value={eventForm.location}
                  onChange={(e) => setEventForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="Event location"
                />
              </div>
              <div>
                <Label>Description</Label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[80px]"
                  value={eventForm.description}
                  onChange={(e) => setEventForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Event description..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowAddEvent(false)}>Cancel</Button>
                <Button onClick={handleAddEvent} disabled={!eventForm.title || !eventForm.startDate || addingEvent}>
                  {addingEvent ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Create Event
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Event Detail Dialog */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedEvent(null)}>
          <Card className="w-full max-w-md p-6 m-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Event Details</h3>
              <Button variant="ghost" size="icon" onClick={() => setSelectedEvent(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${selectedEvent.color}`}></div>
                <span className="font-semibold text-lg">{selectedEvent.title}</span>
              </div>
              <div className="text-sm text-gray-600">
                <p><strong>Type:</strong> {selectedEvent.type.replace('_', ' ')}</p>
                <p><strong>Date:</strong> {new Date(selectedEvent.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                <p><strong>Time:</strong> {selectedEvent.time}</p>
                {selectedEvent.leadName && <p><strong>Lead:</strong> {selectedEvent.leadName}</p>}
              </div>
              {selectedEvent.leadId && (
                <Button variant="outline" className="w-full" onClick={() => { setSelectedEvent(null); navigate(`/leads/${selectedEvent.leadId}`); }}>
                  View Lead Profile
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
