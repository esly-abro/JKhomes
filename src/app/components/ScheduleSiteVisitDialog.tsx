import { AlertCircle, Calendar as CalendarIcon, CheckCircle2, Clock, Home, Loader2, Phone, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { checkConflict, getAvailableSlots, type AvailableSlotsResponse } from '../../services/availability';
import { getUsers } from '../../services/leads';
import { getProperties, Property } from '../../services/properties';
import type { Lead } from '../context/DataContext';
import { useData } from '../context/DataContext';
import { useTenantConfig } from '../context/TenantConfigContext';
import { useOrganization } from '../hooks/useOrganization';
import { Button } from './ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';

interface ScheduleSiteVisitDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    lead: Lead;
    onConfirm?: (details: { visitDate: string; timeSlot: string; agent: string; instructions: string; propertyId?: string; inventoryItemId?: string }) => void;
}

export default function ScheduleSiteVisitDialog({ open, onOpenChange, lead, onConfirm }: ScheduleSiteVisitDialogProps) {
    const { confirmSiteVisit } = useData();
    const { appointmentTypes, appointmentFieldLabel } = useTenantConfig();
    const { catalogModuleLabel, isModuleEnabled, industry } = useOrganization();
    const hasCatalog = isModuleEnabled('catalog');
    const isRealEstate = industry === 'real_estate';
    const [selectedDate, setSelectedDate] = useState<number | null>(null);
    const [visitDate, setVisitDate] = useState('');
    const [timeSlot, setTimeSlot] = useState('');
    const [agent, setAgent] = useState('');
    const [instructions, setInstructions] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedAppointmentType, setSelectedAppointmentType] = useState<string>(appointmentTypes[0]?.key || 'site_visit');
    const [users, setUsers] = useState<any[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [selectedProperty, setSelectedProperty] = useState<string>('');
    
    // New state for availability
    const [availableSlots, setAvailableSlots] = useState<AvailableSlotsResponse | null>(null);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [slotError, setSlotError] = useState<string | null>(null);
    const [conflictWarning, setConflictWarning] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            fetchUsers();
            // Only fetch properties if organization has catalog enabled
            if (hasCatalog) {
                fetchProperties();
                // Pre-select property if lead already has one
                if (lead.propertyId) {
                    setSelectedProperty(lead.propertyId);
                }
            }
            // Pre-select agent if lead already has one assigned
            if ((lead as any).assignedTo) {
                setAgent((lead as any).assignedTo);
            }
        }
    }, [open, lead.propertyId, hasCatalog]);
    
    // Fetch available slots when property (if required) and date are selected
    useEffect(() => {
        // If property is selected, fetch slots; if not required (no catalog), fetch generic slots
        if (visitDate && (selectedProperty || !hasCatalog)) {
            fetchAvailableSlots();
        } else {
            setAvailableSlots(null);
            setTimeSlot('');
        }
    }, [selectedProperty, visitDate, hasCatalog]);
    
    // Check for conflicts when time slot is selected (only if property-based)
    useEffect(() => {
        if (selectedProperty && visitDate && timeSlot) {
            checkForConflicts();
        } else {
            setConflictWarning(null);
        }
    }, [selectedProperty, visitDate, timeSlot]);

    const fetchUsers = async () => {
        try {
            const response = await getUsers();
            setUsers(response);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        }
    };

    const fetchProperties = async () => {
        try {
            // Fetch all properties and filter available ones on client side
            const response = await getProperties();
            const availableProps = response.filter((p: Property) => p.status === 'Available');
            console.log('Fetched properties:', response.length, 'Available:', availableProps.length);
            setProperties(availableProps);
        } catch (error) {
            console.error('Failed to fetch properties:', error);
        }
    };
    
    const fetchAvailableSlots = async () => {
        setLoadingSlots(true);
        setSlotError(null);
        setTimeSlot(''); // Reset time slot when date/property changes
        
        try {
            const slots = await getAvailableSlots(selectedProperty, visitDate);
            setAvailableSlots(slots);
            
            if (!slots.available) {
                setSlotError(slots.reason || 'No slots available for this date');
            }
        } catch (error: any) {
            console.error('Failed to fetch available slots:', error);
            setSlotError(error.response?.data?.error || 'Failed to load available slots');
            setAvailableSlots(null);
        } finally {
            setLoadingSlots(false);
        }
    };
    
    const checkForConflicts = async () => {
        try {
            const result = await checkConflict(selectedProperty, visitDate, timeSlot);
            if (result.hasConflict) {
                const messages = [];
                if (result.propertyConflict) {
                    messages.push(result.propertyConflict.message);
                }
                if (result.agentConflict) {
                    messages.push(result.agentConflict.message);
                }
                setConflictWarning(messages.join('. '));
            } else {
                setConflictWarning(null);
            }
        } catch (error) {
            console.error('Failed to check conflicts:', error);
        }
    };

    const selectedPropertyData = properties.find(p => p._id === selectedProperty);
    
    // Helper function to format time (24h to 12h)
    const formatTime = (time: string) => {
        const [hours, minutes] = time.split(':').map(Number);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const hour12 = hours % 12 || 12;
        return `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
    };

    // Generate calendar days for current month with proper alignment
    const generateCalendarDays = () => {
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        // Get first day of month (0 = Sunday, 1 = Monday, etc.)
        const firstDayOfMonth = new Date(year, month, 1).getDay();

        // Get number of days in month
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const days = [];

        // Add empty cells for days before the first day of month
        for (let i = 0; i < firstDayOfMonth; i++) {
            days.push(null);
        }

        // Add actual days of the month
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(i);
        }

        return days;
    };

    const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const calendarDays = generateCalendarDays();
    const today = new Date().getDate();

    const handleConfirm = async () => {
        if (!visitDate || !timeSlot) {
            alert('Please select a date and time slot');
            return;
        }
        
        // Property is only required if organization has catalog enabled
        if (hasCatalog && !selectedProperty) {
            alert(`Please select a ${catalogModuleLabel.toLowerCase()} for the ${appointmentFieldLabel.toLowerCase()}`);
            return;
        }
        
        if (conflictWarning && selectedProperty) {
            alert('Cannot book: ' + conflictWarning);
            return;
        }
        
        setIsSubmitting(true);
        try {
            // Combine date and time into a single timestamp
            const scheduledAt = new Date(`${visitDate}T${timeSlot}:00`).toISOString();
            
            // Save to database and create activity
            // Pass organizationId, propertyId (optional), inventoryItemId (optional), and appointmentType
            await confirmSiteVisit(
                lead.id, 
                scheduledAt, 
                lead.name, 
                selectedProperty || undefined, 
                selectedAppointmentType
            );
            
            // Call optional callback
            if (onConfirm) {
                onConfirm({ 
                    visitDate, 
                    timeSlot, 
                    agent, 
                    instructions, 
                    propertyId: selectedProperty || undefined
                });
            }
            
            onOpenChange(false);
        } catch (error: any) {
            console.error(`Failed to confirm ${appointmentFieldLabel.toLowerCase()}:`, error);
            const message = error.response?.data?.error || error.message || `Failed to confirm ${appointmentFieldLabel.toLowerCase()}. Please try again.`;
            alert(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold text-blue-900 text-center">
                        Schedule {appointmentFieldLabel}
                    </DialogTitle>
                    <p className="text-center text-gray-600 text-sm">Coordinate {appointmentFieldLabel.toLowerCase()} with client</p>
                </DialogHeader>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                    {/* Left Column - Visit Details */}
                    <div className="space-y-6">
                        <h3 className="text-lg font-semibold text-gray-800">Visit Details</h3>

                        {/* Client Name */}
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-2 block">Client Name</label>
                            <div className="flex items-center gap-3 bg-blue-50 p-3 rounded-lg border border-blue-100">
                                <User className="h-5 w-5 text-blue-600" />
                                <span className="font-medium text-gray-900">{lead.name}</span>
                            </div>
                        </div>

                        {/* Phone Number */}
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-2 block">Phone Number</label>
                            <div className="flex items-center gap-3 bg-blue-50 p-3 rounded-lg border border-blue-100">
                                <Phone className="h-5 w-5 text-green-600" />
                                <span className="font-medium text-gray-900">{lead.phone}</span>
                            </div>
                        </div>

                        {/* Property - Only show if organization has catalog */}
                        {hasCatalog && (
                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-2 block">
                                    {catalogModuleLabel}
                                </label>
                                <Select value={selectedProperty} onValueChange={setSelectedProperty}>
                                    <SelectTrigger className="w-full">
                                        <div className="flex items-center gap-2">
                                            <Home className="h-4 w-4 text-purple-600" />
                                            <SelectValue placeholder={`Select ${catalogModuleLabel.toLowerCase()} for ${appointmentFieldLabel.toLowerCase()}`} />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {properties.map(property => (
                                            <SelectItem key={property._id} value={property._id!}>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{property.name}</span>
                                                    <span className="text-xs text-gray-500">{property.location} • {property.category || property.propertyType}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                        {properties.length === 0 && (
                                            <SelectItem value="none" disabled>No available {catalogModuleLabel.toLowerCase()}</SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* Appointment Type */}
                        {appointmentTypes.length > 1 && (
                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-2 block">{appointmentFieldLabel} Type</label>
                                <Select value={selectedAppointmentType} onValueChange={setSelectedAppointmentType}>
                                    <SelectTrigger className="w-full">
                                        <div className="flex items-center gap-2">
                                            <CalendarIcon className="h-4 w-4 text-green-600" />
                                            <SelectValue placeholder={`Select ${appointmentFieldLabel.toLowerCase()} type`} />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {appointmentTypes.map(apt => (
                                            <SelectItem key={apt.key} value={apt.key}>{apt.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* Visit Date */}
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-2 block">Visit Date</label>
                            <div className="relative">
                                <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-blue-600" />
                                <Input
                                    type="date"
                                    value={visitDate}
                                    onChange={(e) => setVisitDate(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </div>

                        {/* Visit Time */}
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-2 block">Visit Time</label>
                            {loadingSlots ? (
                                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                                    <span className="text-sm text-gray-600">Loading available slots...</span>
                                </div>
                            ) : slotError ? (
                                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                                    <AlertCircle className="h-4 w-4 text-red-600" />
                                    <span className="text-sm text-red-600">{slotError}</span>
                                </div>
                            ) : !visitDate ? (
                                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                    <Clock className="h-4 w-4 text-gray-400" />
                                    <span className="text-sm text-gray-500">Select date first</span>
                                </div>
                            ) : (hasCatalog && !selectedProperty) ? (
                                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                    <Clock className="h-4 w-4 text-gray-400" />
                                    <span className="text-sm text-gray-500">Select {catalogModuleLabel.toLowerCase()} first</span>
                                </div>
                            ) : availableSlots && availableSlots.available ? (
                                <Select value={timeSlot} onValueChange={setTimeSlot}>
                                    <SelectTrigger className="w-full">
                                        <div className="flex items-center gap-2">
                                            <Clock className="h-4 w-4 text-blue-600" />
                                            <SelectValue placeholder="Select available time slot" />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableSlots.slots.map((slot) => (
                                            <SelectItem 
                                                key={slot.startTime} 
                                                value={slot.startTime}
                                                disabled={!slot.available}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className={slot.available ? 'text-gray-900' : 'text-gray-400'}>
                                                        {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                                                    </span>
                                                    {!slot.available && (
                                                        <span className="text-xs text-red-500 ml-2">
                                                            ({slot.reason || 'Unavailable'})
                                                        </span>
                                                    )}
                                                </div>
                                            </SelectItem>
                                        ))}
                                        {availableSlots.slots.filter(s => s.available).length === 0 && (
                                            <SelectItem value="none" disabled>No available slots</SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                                    <span className="text-sm text-yellow-700">No slots available</span>
                                </div>
                            )}
                            
                            {/* Conflict Warning */}
                            {conflictWarning && (
                                <div className="mt-2 flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                                    <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                                    <span className="text-sm text-red-600">{conflictWarning}</span>
                                </div>
                            )}
                            
                            {/* Available slots count */}
                            {availableSlots && availableSlots.available && (
                                <p className="text-xs text-gray-500 mt-1">
                                    {availableSlots.remainingSlots} of {availableSlots.maxVisits} slots remaining for this day
                                </p>
                            )}
                        </div>

                        {/* Assigned Agent */}
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-2 block">Assigned Agent</label>
                            <Select value={agent} onValueChange={setAgent}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select agent" />
                                </SelectTrigger>
                                <SelectContent>
                                    {users.map(user => (
                                        <SelectItem key={user._id || user.email} value={user._id || user.email}>
                                            {user.name || user.email.split('@')[0]} ({user.role})
                                        </SelectItem>
                                    ))}
                                    {users.length === 0 && (
                                        <SelectItem value="unassigned" disabled>Loading agents...</SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Special Instructions */}
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-2 block">Special Instructions</label>
                            <Textarea
                                placeholder="Any specific requirements or notes..."
                                value={instructions}
                                onChange={(e) => setInstructions(e.target.value)}
                                rows={3}
                                className="resize-none"
                            />
                        </div>

                        {/* Confirm Button */}
                        <Button
                            onClick={handleConfirm}
                            disabled={isSubmitting || !visitDate || !timeSlot || !selectedProperty || !!conflictWarning}
                            className="w-full bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-400"
                        >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            {isSubmitting ? 'Confirming...' : conflictWarning ? 'Cannot Book - Conflict' : `Confirm ${appointmentFieldLabel}`}
                        </Button>
                    </div>

                    {/* Right Column - Available Slots & Info */}
                    <div className="space-y-6">
                        {/* Available Slots Calendar */}
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Available Slots</h3>

                            {/* Week Days Header */}
                            <div className="grid grid-cols-7 gap-1 mb-2">
                                {weekDays.map((day, index) => (
                                    <div key={index} className="text-center text-sm font-semibold text-blue-600 py-2">
                                        {day}
                                    </div>
                                ))}
                            </div>

                            {/* Calendar Days */}
                            <div className="grid grid-cols-7 gap-1">
                                {calendarDays.map((day, index) => {
                                    // Empty cell for days before month starts
                                    if (day === null) {
                                        return <div key={`empty-${index}`} className="aspect-square"></div>;
                                    }

                                    const isToday = day === today;
                                    const isSelected = day === selectedDate;
                                    const isAvailable = day >= today && day <= today + 10;

                                    return (
                                        <button
                                            key={day}
                                            type="button"
                                            onClick={() => {
                                                if (isAvailable) {
                                                    setSelectedDate(day);
                                                    // Auto-fill visit date from calendar click
                                                    const now = new Date();
                                                    const year = now.getFullYear();
                                                    const month = now.getMonth();
                                                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                                    setVisitDate(dateStr);
                                                }
                                            }}
                                            disabled={!isAvailable}
                                            className={`
                                                aspect-square w-full flex items-center justify-center
                                                rounded-lg text-sm font-medium transition-all
                                                ${isToday ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}
                                                ${isSelected && !isToday ? 'bg-green-100 text-green-700 ring-2 ring-green-500' : ''}
                                                ${!isToday && !isSelected && isAvailable ? 'hover:bg-gray-100 text-gray-700 bg-white border border-gray-200' : ''}
                                                ${!isAvailable && !isToday ? 'text-gray-300 cursor-not-allowed bg-gray-50' : ''}
                                                ${isAvailable ? 'cursor-pointer' : ''}
                                            `}
                                        >
                                            {day}
                                        </button>
                                    );
                                })}
                            </div>

                            {today && (
                                <div className="flex items-center gap-2 mt-3">
                                    <div className="w-3 h-3 bg-blue-600 rounded"></div>
                                    <span className="text-xs text-gray-600">Today</span>
                                </div>
                            )}
                        </div>

                        {/* {appointmentFieldLabel} Information */}
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">{appointmentFieldLabel} Information</h3>

                            {selectedPropertyData ? (
                                <div className="space-y-3">
                                    <div className="bg-blue-50 p-3 rounded-lg">
                                        <div className="text-xs font-medium text-blue-900 mb-1">{catalogModuleLabel} Name</div>
                                        <div className="text-sm text-gray-800 font-medium">{selectedPropertyData.name}</div>
                                    </div>

                                    <div className="bg-blue-50 p-3 rounded-lg">
                                        <div className="text-xs font-medium text-blue-900 mb-1">{catalogModuleLabel} Address</div>
                                        <div className="text-sm text-gray-800">{selectedPropertyData.location}</div>
                                    </div>

                                    <div className="bg-blue-50 p-3 rounded-lg">
                                        <div className="text-xs font-medium text-blue-900 mb-1">Category</div>
                                        <div className="text-sm text-gray-800">{selectedPropertyData.category || selectedPropertyData.propertyType}</div>
                                    </div>

                                    <div className="bg-blue-50 p-3 rounded-lg">
                                        <div className="text-xs font-medium text-blue-900 mb-1">Price Range</div>
                                        <div className="text-sm text-gray-800">
                                            {selectedPropertyData.price.currency} {selectedPropertyData.price.min.toLocaleString()} - {selectedPropertyData.price.max.toLocaleString()}
                                        </div>
                                    </div>

                                    <div className="bg-blue-50 p-3 rounded-lg">
                                        <div className="text-xs font-medium text-blue-900 mb-1">Size</div>
                                        <div className="text-sm text-gray-800">
                                            {selectedPropertyData.size.value} {selectedPropertyData.size.unit}
                                            {isRealEstate && selectedPropertyData.bedrooms && ` • ${selectedPropertyData.bedrooms} BHK`}
                                            {isRealEstate && selectedPropertyData.bathrooms && `, ${selectedPropertyData.bathrooms} Bath`}
                                        </div>
                                    </div>

                                    <div className="bg-blue-50 p-3 rounded-lg">
                                        <div className="text-xs font-medium text-blue-900 mb-1">Duration</div>
                                        <div className="text-sm text-gray-800">Approximately 60 minutes</div>
                                    </div>

                                    <div className="bg-blue-50 p-3 rounded-lg">
                                        <div className="text-xs font-medium text-blue-900 mb-1">What to Bring</div>
                                        <div className="text-sm text-gray-800">Valid ID proof for registration</div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-6 text-gray-500">
                                    <Home className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                                    <p>Select a {catalogModuleLabel.toLowerCase()} to view details</p>
                                </div>
                            )}
                        </div>

                        {/* Note */}
                        <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                            <p className="text-sm text-green-800">
                                <strong>Note:</strong> SMS and WhatsApp confirmation will be sent automatically to the client after scheduling.
                            </p>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
