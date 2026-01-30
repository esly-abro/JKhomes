import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Clock, Calendar, Plus, Trash2, AlertCircle, Loader2, CheckCircle2, Ban, Settings } from 'lucide-react';
import { 
    getPropertyAvailability, 
    updatePropertyAvailability, 
    blockDates, 
    unblockDates,
    type AvailabilitySettings as AvailabilitySettingsType,
    type TimeSlot,
    type Weekdays 
} from '../../services/availability';

interface AvailabilitySettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    propertyId: string;
    propertyName: string;
}

export default function AvailabilitySettingsDialog({ 
    open, 
    onOpenChange, 
    propertyId, 
    propertyName 
}: AvailabilitySettingsDialogProps) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    
    const [settings, setSettings] = useState<AvailabilitySettingsType>({
        enabled: true,
        weekdays: {
            monday: true,
            tuesday: true,
            wednesday: true,
            thursday: true,
            friday: true,
            saturday: true,
            sunday: false
        },
        timeSlots: [
            { startTime: '09:00', endTime: '10:00' },
            { startTime: '10:00', endTime: '11:00' },
            { startTime: '11:00', endTime: '12:00' },
            { startTime: '14:00', endTime: '15:00' },
            { startTime: '15:00', endTime: '16:00' },
            { startTime: '16:00', endTime: '17:00' }
        ],
        slotDuration: 60,
        bufferTime: 30,
        blockedDates: [],
        maxVisitsPerDay: 8,
        specialHours: [],
        advanceBookingDays: 30,
        minAdvanceHours: 2
    });
    
    const [newBlockedDate, setNewBlockedDate] = useState('');
    const [newSlot, setNewSlot] = useState({ startTime: '', endTime: '' });

    useEffect(() => {
        if (open && propertyId) {
            fetchSettings();
        }
    }, [open, propertyId]);

    const fetchSettings = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getPropertyAvailability(propertyId);
            setSettings(result.availability);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load availability settings');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            await updatePropertyAvailability(propertyId, settings);
            setSuccess('Availability settings saved successfully!');
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handleWeekdayToggle = (day: keyof Weekdays) => {
        setSettings(prev => ({
            ...prev,
            weekdays: {
                ...prev.weekdays,
                [day]: !prev.weekdays[day]
            }
        }));
    };

    const handleAddTimeSlot = () => {
        if (!newSlot.startTime || !newSlot.endTime) {
            setError('Please enter both start and end time');
            return;
        }
        if (newSlot.startTime >= newSlot.endTime) {
            setError('Start time must be before end time');
            return;
        }
        
        // Check for duplicate
        const exists = settings.timeSlots.some(
            s => s.startTime === newSlot.startTime && s.endTime === newSlot.endTime
        );
        if (exists) {
            setError('This time slot already exists');
            return;
        }
        
        setSettings(prev => ({
            ...prev,
            timeSlots: [...prev.timeSlots, { ...newSlot }].sort((a, b) => 
                a.startTime.localeCompare(b.startTime)
            )
        }));
        setNewSlot({ startTime: '', endTime: '' });
        setError(null);
    };

    const handleRemoveTimeSlot = (index: number) => {
        setSettings(prev => ({
            ...prev,
            timeSlots: prev.timeSlots.filter((_, i) => i !== index)
        }));
    };

    const handleAddBlockedDate = async () => {
        if (!newBlockedDate) {
            setError('Please select a date to block');
            return;
        }
        
        try {
            await blockDates(propertyId, [newBlockedDate]);
            setSettings(prev => ({
                ...prev,
                blockedDates: [...prev.blockedDates, newBlockedDate]
            }));
            setNewBlockedDate('');
            setError(null);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to block date');
        }
    };

    const handleUnblockDate = async (date: string) => {
        try {
            const dateStr = typeof date === 'string' ? date : new Date(date).toISOString().split('T')[0];
            await unblockDates(propertyId, [dateStr]);
            setSettings(prev => ({
                ...prev,
                blockedDates: prev.blockedDates.filter(d => {
                    const dStr = typeof d === 'string' ? d : new Date(d).toISOString().split('T')[0];
                    return dStr !== dateStr;
                })
            }));
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to unblock date');
        }
    };

    const formatTime = (time: string) => {
        const [hours, minutes] = time.split(':').map(Number);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const hour12 = hours % 12 || 12;
        return `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
    };

    const formatBlockedDate = (date: Date | string) => {
        const d = typeof date === 'string' ? new Date(date) : date;
        return d.toLocaleDateString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
    };

    const weekdayLabels: { key: keyof Weekdays; label: string }[] = [
        { key: 'monday', label: 'Mon' },
        { key: 'tuesday', label: 'Tue' },
        { key: 'wednesday', label: 'Wed' },
        { key: 'thursday', label: 'Thu' },
        { key: 'friday', label: 'Fri' },
        { key: 'saturday', label: 'Sat' },
        { key: 'sunday', label: 'Sun' }
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5 text-blue-600" />
                        Availability Settings - {propertyName}
                    </DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                        <span className="ml-2 text-gray-600">Loading settings...</span>
                    </div>
                ) : (
                    <div className="space-y-6 py-4">
                        {/* Error/Success Messages */}
                        {error && (
                            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                                <AlertCircle className="h-4 w-4 text-red-600" />
                                <span className="text-sm text-red-600">{error}</span>
                            </div>
                        )}
                        {success && (
                            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                                <span className="text-sm text-green-600">{success}</span>
                            </div>
                        )}

                        {/* Enable/Disable Toggle */}
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div>
                                <h4 className="font-medium text-gray-900">Site Visits Enabled</h4>
                                <p className="text-sm text-gray-500">Allow scheduling site visits for this property</p>
                            </div>
                            <button
                                onClick={() => setSettings(prev => ({ ...prev, enabled: !prev.enabled }))}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                    settings.enabled ? 'bg-green-500' : 'bg-gray-300'
                                }`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                    settings.enabled ? 'translate-x-6' : 'translate-x-1'
                                }`} />
                            </button>
                        </div>

                        {settings.enabled && (
                            <>
                                {/* Weekday Availability */}
                                <div>
                                    <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                                        <Calendar className="h-4 w-4" />
                                        Available Days
                                    </h4>
                                    <div className="flex gap-2">
                                        {weekdayLabels.map(({ key, label }) => (
                                            <button
                                                key={key}
                                                onClick={() => handleWeekdayToggle(key)}
                                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                                    settings.weekdays[key]
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                                }`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Time Slots */}
                                <div>
                                    <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                                        <Clock className="h-4 w-4" />
                                        Time Slots
                                    </h4>
                                    <div className="space-y-2">
                                        {settings.timeSlots.map((slot, index) => (
                                            <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                                                <span className="flex-1 text-sm">
                                                    {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                                                </span>
                                                <button
                                                    onClick={() => handleRemoveTimeSlot(index)}
                                                    className="text-red-500 hover:text-red-700 p-1"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}
                                        
                                        {/* Add New Slot */}
                                        <div className="flex items-end gap-2 mt-3">
                                            <div>
                                                <Label className="text-xs">Start Time</Label>
                                                <Input
                                                    type="time"
                                                    value={newSlot.startTime}
                                                    onChange={(e) => setNewSlot(prev => ({ ...prev, startTime: e.target.value }))}
                                                    className="w-28"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-xs">End Time</Label>
                                                <Input
                                                    type="time"
                                                    value={newSlot.endTime}
                                                    onChange={(e) => setNewSlot(prev => ({ ...prev, endTime: e.target.value }))}
                                                    className="w-28"
                                                />
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={handleAddTimeSlot}
                                            >
                                                <Plus className="h-4 w-4 mr-1" />
                                                Add
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {/* Settings Grid */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="slotDuration">Slot Duration (minutes)</Label>
                                        <Input
                                            id="slotDuration"
                                            type="number"
                                            min="15"
                                            max="180"
                                            value={settings.slotDuration}
                                            onChange={(e) => setSettings(prev => ({ 
                                                ...prev, 
                                                slotDuration: parseInt(e.target.value) || 60 
                                            }))}
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="bufferTime">Buffer Time (minutes)</Label>
                                        <Input
                                            id="bufferTime"
                                            type="number"
                                            min="0"
                                            max="60"
                                            value={settings.bufferTime}
                                            onChange={(e) => setSettings(prev => ({ 
                                                ...prev, 
                                                bufferTime: parseInt(e.target.value) || 0 
                                            }))}
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="maxVisits">Max Visits Per Day</Label>
                                        <Input
                                            id="maxVisits"
                                            type="number"
                                            min="1"
                                            max="50"
                                            value={settings.maxVisitsPerDay}
                                            onChange={(e) => setSettings(prev => ({ 
                                                ...prev, 
                                                maxVisitsPerDay: parseInt(e.target.value) || 8 
                                            }))}
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="advanceBooking">Advance Booking Days</Label>
                                        <Input
                                            id="advanceBooking"
                                            type="number"
                                            min="1"
                                            max="365"
                                            value={settings.advanceBookingDays}
                                            onChange={(e) => setSettings(prev => ({ 
                                                ...prev, 
                                                advanceBookingDays: parseInt(e.target.value) || 30 
                                            }))}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <Label htmlFor="minAdvance">Minimum Advance Hours</Label>
                                        <Input
                                            id="minAdvance"
                                            type="number"
                                            min="0"
                                            max="48"
                                            value={settings.minAdvanceHours}
                                            onChange={(e) => setSettings(prev => ({ 
                                                ...prev, 
                                                minAdvanceHours: parseInt(e.target.value) || 2 
                                            }))}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            How many hours in advance must bookings be made
                                        </p>
                                    </div>
                                </div>

                                {/* Blocked Dates */}
                                <div>
                                    <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                                        <Ban className="h-4 w-4" />
                                        Blocked Dates
                                    </h4>
                                    <div className="space-y-2">
                                        {settings.blockedDates.length > 0 ? (
                                            settings.blockedDates.map((date, index) => {
                                                const dateStr = typeof date === 'string' ? date : new Date(date).toISOString().split('T')[0];
                                                return (
                                                    <div key={index} className="flex items-center gap-2 p-2 bg-red-50 rounded-lg">
                                                        <Ban className="h-4 w-4 text-red-500" />
                                                        <span className="flex-1 text-sm">{formatBlockedDate(date)}</span>
                                                        <button
                                                            onClick={() => handleUnblockDate(dateStr)}
                                                            className="text-red-500 hover:text-red-700 p-1 text-xs"
                                                        >
                                                            Unblock
                                                        </button>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <p className="text-sm text-gray-500">No dates blocked</p>
                                        )}
                                        
                                        {/* Add Blocked Date */}
                                        <div className="flex items-end gap-2 mt-3">
                                            <div className="flex-1">
                                                <Label className="text-xs">Block a Date</Label>
                                                <Input
                                                    type="date"
                                                    value={newBlockedDate}
                                                    onChange={(e) => setNewBlockedDate(e.target.value)}
                                                    min={new Date().toISOString().split('T')[0]}
                                                />
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={handleAddBlockedDate}
                                            >
                                                <Plus className="h-4 w-4 mr-1" />
                                                Block
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={saving || loading}>
                        {saving ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Save Settings
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
