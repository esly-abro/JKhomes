/**
 * Availability Service
 * Handles property availability and slot management
 */

const Property = require('../properties/properties.model');
const SiteVisit = require('../models/SiteVisit');

/**
 * Get available time slots for a property on a specific date
 * @param {string} propertyId - Property ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Array} Available time slots
 */
async function getAvailableSlots(propertyId, date) {
    // Get property with availability settings
    const property = await Property.findById(propertyId);
    if (!property) {
        throw new Error('Property not found');
    }

    const availability = property.availability || {};
    
    // Check if availability is enabled
    if (availability.enabled === false) {
        return { available: false, reason: 'Appointments not available for this property', slots: [] };
    }

    // Parse the date
    const targetDate = new Date(date);
    const dayOfWeek = targetDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    // Check if this day of week is enabled
    const weekdays = availability.weekdays || {
        monday: true, tuesday: true, wednesday: true, thursday: true, friday: true,
        saturday: true, sunday: false
    };

    if (!weekdays[dayOfWeek]) {
        return { available: false, reason: `Appointments not available on ${dayOfWeek}s`, slots: [] };
    }

    // Check if this date is blocked
    const blockedDates = availability.blockedDates || [];
    const dateStr = date;
    const isBlocked = blockedDates.some(blocked => {
        const blockedStr = new Date(blocked).toISOString().split('T')[0];
        return blockedStr === dateStr;
    });

    if (isBlocked) {
        return { available: false, reason: 'This date is blocked for appointments', slots: [] };
    }

    // Check special hours for this date
    const specialHours = availability.specialHours || [];
    const specialDay = specialHours.find(sh => {
        const shDate = new Date(sh.date).toISOString().split('T')[0];
        return shDate === dateStr;
    });

    if (specialDay && specialDay.isClosed) {
        return { available: false, reason: 'Property closed on this date', slots: [] };
    }

    // Get time slots (use special hours if defined, otherwise default slots)
    let timeSlots = specialDay?.timeSlots || availability.timeSlots;
    
    // Default time slots if none configured
    if (!timeSlots || timeSlots.length === 0) {
        timeSlots = [
            { startTime: '09:00', endTime: '10:00' },
            { startTime: '10:00', endTime: '11:00' },
            { startTime: '11:00', endTime: '12:00' },
            { startTime: '14:00', endTime: '15:00' },
            { startTime: '15:00', endTime: '16:00' },
            { startTime: '16:00', endTime: '17:00' }
        ];
    }

    // Check advance booking limits
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDateClean = new Date(targetDate);
    targetDateClean.setHours(0, 0, 0, 0);
    
    const daysInAdvance = Math.ceil((targetDateClean - today) / (1000 * 60 * 60 * 24));
    const maxAdvanceDays = availability.advanceBookingDays || 30;

    if (daysInAdvance > maxAdvanceDays) {
        return { 
            available: false, 
            reason: `Booking only available up to ${maxAdvanceDays} days in advance`, 
            slots: [] 
        };
    }

    if (daysInAdvance < 0) {
        return { available: false, reason: 'Cannot book for past dates', slots: [] };
    }

    // Check minimum advance hours for today
    const minAdvanceHours = availability.minAdvanceHours || 2;
    const now = new Date();

    // Get existing bookings for this property and date
    const organizationId = property.organizationId;
    const existingVisits = await SiteVisit.getByPropertyAndDate(organizationId, propertyId, date);
    const bookedSlots = existingVisits.map(v => v.timeSlot?.startTime);

    // Check max visits per day
    const maxVisitsPerDay = availability.maxVisitsPerDay || 8;
    if (existingVisits.length >= maxVisitsPerDay) {
        return { 
            available: false, 
            reason: 'Maximum visits reached for this date', 
            slots: [],
            bookedCount: existingVisits.length
        };
    }

    // Filter available slots
    const availableSlots = timeSlots.map(slot => {
        const isBooked = bookedSlots.includes(slot.startTime);
        
        // For today, check if slot time has passed or is within minimum advance hours
        let isPastOrTooSoon = false;
        if (daysInAdvance === 0) {
            const [hours, minutes] = slot.startTime.split(':').map(Number);
            const slotTime = new Date(targetDate);
            slotTime.setHours(hours, minutes, 0, 0);
            
            const minBookingTime = new Date(now.getTime() + minAdvanceHours * 60 * 60 * 1000);
            isPastOrTooSoon = slotTime <= minBookingTime;
        }

        return {
            startTime: slot.startTime,
            endTime: slot.endTime,
            available: !isBooked && !isPastOrTooSoon,
            reason: isBooked ? 'Already booked' : isPastOrTooSoon ? 'Too late to book' : null
        };
    });

    return {
        available: true,
        date: date,
        dayOfWeek: dayOfWeek,
        slots: availableSlots,
        slotDuration: availability.slotDuration || 60,
        bufferTime: availability.bufferTime || 30,
        bookedCount: existingVisits.length,
        maxVisits: maxVisitsPerDay,
        remainingSlots: maxVisitsPerDay - existingVisits.length
    };
}

/**
 * Check if a specific slot is available
 * @param {string} propertyId - Property ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} startTime - Start time in HH:MM format
 * @returns {Object} Availability status
 */
async function checkSlotAvailability(propertyId, date, startTime) {
    const result = await getAvailableSlots(propertyId, date);
    
    if (!result.available) {
        return { available: false, reason: result.reason };
    }

    const slot = result.slots.find(s => s.startTime === startTime);
    
    if (!slot) {
        return { available: false, reason: 'Invalid time slot' };
    }

    return {
        available: slot.available,
        reason: slot.reason,
        slot: slot
    };
}

/**
 * Check for booking conflicts (property and agent)
 * @param {string} propertyId - Property ID
 * @param {string} agentId - Agent ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} startTime - Start time in HH:MM format
 * @param {string} excludeVisitId - Optional visit ID to exclude (for rescheduling)
 * @returns {Object} Conflict status
 */
async function checkConflicts(propertyId, agentId, date, startTime, excludeVisitId = null) {
    const conflicts = {
        hasConflict: false,
        propertyConflict: null,
        agentConflict: null
    };

    // Check property conflict
    const propertyConflict = await SiteVisit.checkConflict(propertyId, date, startTime, excludeVisitId);
    if (propertyConflict) {
        conflicts.hasConflict = true;
        conflicts.propertyConflict = {
            message: 'This time slot is already booked for this property',
            existingVisit: {
                id: propertyConflict._id,
                leadName: propertyConflict.leadName,
                agentName: propertyConflict.agentName
            }
        };
    }

    // Check agent conflict
    const agentConflict = await SiteVisit.checkAgentConflict(agentId, date, startTime, excludeVisitId);
    if (agentConflict) {
        conflicts.hasConflict = true;
        conflicts.agentConflict = {
            message: 'You already have a visit scheduled at this time',
            existingVisit: {
                id: agentConflict._id,
                leadName: agentConflict.leadName,
                propertyId: agentConflict.propertyId
            }
        };
    }

    return conflicts;
}

/**
 * Update property availability settings
 * @param {string} propertyId - Property ID
 * @param {Object} availabilitySettings - New availability settings
 * @returns {Object} Updated property
 */
async function updatePropertyAvailability(propertyId, availabilitySettings) {
    const property = await Property.findById(propertyId);
    if (!property) {
        throw new Error('Property not found');
    }

    // Validate time slots
    if (availabilitySettings.timeSlots) {
        for (const slot of availabilitySettings.timeSlots) {
            if (!isValidTimeFormat(slot.startTime) || !isValidTimeFormat(slot.endTime)) {
                throw new Error('Invalid time format. Use HH:MM format.');
            }
            if (slot.startTime >= slot.endTime) {
                throw new Error('Start time must be before end time');
            }
        }
    }

    // Merge with existing availability
    property.availability = {
        ...property.availability?.toObject?.() || property.availability || {},
        ...availabilitySettings
    };

    await property.save();
    return property;
}

/**
 * Block specific dates for a property
 * @param {string} propertyId - Property ID
 * @param {Array} dates - Array of dates to block
 * @returns {Object} Updated property
 */
async function blockDates(propertyId, dates) {
    const property = await Property.findById(propertyId);
    if (!property) {
        throw new Error('Property not found');
    }

    if (!property.availability) {
        property.availability = {};
    }

    const existingBlocked = property.availability.blockedDates || [];
    const newBlocked = [...new Set([...existingBlocked.map(d => new Date(d).toISOString()), ...dates.map(d => new Date(d).toISOString())])];
    
    property.availability.blockedDates = newBlocked.map(d => new Date(d));
    await property.save();

    return property;
}

/**
 * Unblock specific dates for a property
 * @param {string} propertyId - Property ID
 * @param {Array} dates - Array of dates to unblock
 * @returns {Object} Updated property
 */
async function unblockDates(propertyId, dates) {
    const property = await Property.findById(propertyId);
    if (!property) {
        throw new Error('Property not found');
    }

    if (!property.availability?.blockedDates) {
        return property;
    }

    const datesToRemove = dates.map(d => new Date(d).toISOString().split('T')[0]);
    property.availability.blockedDates = property.availability.blockedDates.filter(blocked => {
        const blockedStr = new Date(blocked).toISOString().split('T')[0];
        return !datesToRemove.includes(blockedStr);
    });

    await property.save();
    return property;
}

/**
 * Set special hours for a specific date
 * @param {string} propertyId - Property ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {Object} specialHour - Special hours config { timeSlots, isClosed }
 * @returns {Object} Updated property
 */
async function setSpecialHours(propertyId, date, specialHour) {
    const property = await Property.findById(propertyId);
    if (!property) {
        throw new Error('Property not found');
    }

    if (!property.availability) {
        property.availability = {};
    }

    if (!property.availability.specialHours) {
        property.availability.specialHours = [];
    }

    // Remove existing special hours for this date
    const dateStr = new Date(date).toISOString().split('T')[0];
    property.availability.specialHours = property.availability.specialHours.filter(sh => {
        const shDate = new Date(sh.date).toISOString().split('T')[0];
        return shDate !== dateStr;
    });

    // Add new special hours
    property.availability.specialHours.push({
        date: new Date(date),
        timeSlots: specialHour.timeSlots || [],
        isClosed: specialHour.isClosed || false
    });

    await property.save();
    return property;
}

/**
 * Get property availability settings
 * @param {string} propertyId - Property ID
 * @returns {Object} Availability settings
 */
async function getPropertyAvailability(propertyId) {
    const property = await Property.findById(propertyId);
    if (!property) {
        throw new Error('Property not found');
    }

    // Return availability with defaults
    const defaultAvailability = {
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
    };

    return {
        propertyId: property._id,
        propertyName: property.name,
        availability: {
            ...defaultAvailability,
            ...property.availability?.toObject?.() || property.availability || {}
        }
    };
}

/**
 * Validate time format (HH:MM)
 */
function isValidTimeFormat(time) {
    if (!time || typeof time !== 'string') return false;
    const regex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return regex.test(time);
}

module.exports = {
    getAvailableSlots,
    checkSlotAvailability,
    checkConflicts,
    updatePropertyAvailability,
    blockDates,
    unblockDates,
    setSpecialHours,
    getPropertyAvailability
};
